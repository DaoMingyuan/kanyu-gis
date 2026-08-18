//! 堪舆缓冲区技能（WASM guest）：按距离对要素做缓冲区分析。
//!
//! 输入 FeatureCollection 约定：
//! - 首条 `properties._role == "param"` 要素携带缓冲参数：`_distance`（数值，地图单位，> 0）；
//!   参数要素为操作约定，不带入输出；
//! - 其余 Point / LineString / Polygon 及 Multi* 要素按距离膨胀为面，属性继承；
//!   结果多部时附 `_part` 序号；无 geometry 要素原样透传。
//!
//! 算法（geo 0.33）：`geo::Buffer`（GEOS 风格 round join 缓冲），
//! 点 → 近圆面、线 → 条带面、面 → 外扩面（负距离内缩不在本契约，距离必须为正）。
//!
//! 构建（生成 ../buffer_zones.wasm）：
//!   cargo build --target wasm32-unknown-unknown --release \
//!     --manifest-path dsh/skills/buffer_zones/Cargo.toml
//!   wasm-tools component new \
//!     dsh/skills/buffer_zones/target/wasm32-unknown-unknown/release/buffer_zones.wasm \
//!     -o dsh/skills/buffer_zones.wasm

use std::convert::TryFrom;

use geo::Buffer;
use geo_types::{Geometry, LineString, MultiPolygon, Polygon};

wit_bindgen::generate!({
    world: "skill",
    path: "../../../crates/kanyu-skill/wit",
});

struct BufferZones;

/// geo LineString → GeoJSON 坐标数组。
fn ring_to_json(ls: &LineString<f64>) -> serde_json::Value {
    serde_json::Value::Array(
        ls.coords()
            .map(|c| serde_json::json!([c.x, c.y]))
            .collect(),
    )
}

/// geo Polygon → GeoJSON geometry Value。
fn polygon_to_json(poly: &Polygon<f64>) -> serde_json::Value {
    let mut rings = Vec::with_capacity(poly.interiors().len() + 1);
    rings.push(ring_to_json(poly.exterior()));
    for hole in poly.interiors() {
        rings.push(ring_to_json(hole));
    }
    serde_json::json!({ "type": "Polygon", "coordinates": rings })
}

/// 参数要素提取：首条 `_role=="param"` 的 `_distance`（> 0）。
fn read_distance(features: &[serde_json::Value]) -> Result<f64, String> {
    for f in features {
        let props = f.get("properties");
        let is_param = props
            .and_then(|p| p.get("_role"))
            .and_then(|r| r.as_str())
            == Some("param");
        if !is_param {
            continue;
        }
        let d = props
            .and_then(|p| p.get("_distance"))
            .and_then(|v| v.as_f64())
            .ok_or_else(|| "参数要素缺少 _distance 数值".to_string())?;
        if d <= 0.0 {
            return Err("缓冲距离必须为正数".to_string());
        }
        return Ok(d);
    }
    Err("未找到缓冲参数（properties._role=\"param\" 且含 _distance 的要素）".to_string())
}

/// 单要素 geometry（serde_json Value）→ geo Geometry。
fn to_geometry(i: usize, g: &serde_json::Value) -> Result<Geometry<f64>, String> {
    let gj: geojson::Geometry = serde_json::from_value(g.clone())
        .map_err(|e| format!("要素 #{i} geometry 非合法 GeoJSON: {e}"))?;
    Geometry::<f64>::try_from(gj).map_err(|e| format!("要素 #{i} geometry 转换失败: {e}"))
}

impl exports::kanyu::skill::analyzer::Guest for BufferZones {
    fn meta() -> String {
        r#"{"name":"buffer_zones","version":"0.1.0","capabilities":["analyzer"]}"#.to_string()
    }

    fn run(input: String) -> Result<String, String> {
        let root: serde_json::Value =
            serde_json::from_str(&input).map_err(|e| format!("输入非合法 JSON: {e}"))?;
        let features = root
            .get("features")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "输入缺少 features 数组".to_string())?;

        let distance = read_distance(features)?;

        let mut out_features: Vec<serde_json::Value> = Vec::new();
        let mut buffered = 0usize;
        for (i, f) in features.iter().enumerate() {
            let is_param = f
                .get("properties")
                .and_then(|p| p.get("_role"))
                .and_then(|r| r.as_str())
                == Some("param");
            if is_param {
                continue; // 参数要素为操作约定，不带入输出
            }
            let g = match f.get("geometry") {
                Some(g) if !g.is_null() => g,
                _ => {
                    out_features.push(f.clone()); // 无 geometry 要素原样透传
                    continue;
                }
            };
            let geom = to_geometry(i, g)?;
            let mp: MultiPolygon<f64> = geom.buffer(distance);
            if mp.0.is_empty() {
                return Err(format!("要素 #{i} 缓冲结果为空"));
            }
            buffered += 1;
            for (pi, part) in mp.0.iter().enumerate() {
                let mut nf = f.clone();
                let props = nf
                    .get_mut("properties")
                    .and_then(|p| p.as_object_mut());
                if let Some(props) = props {
                    props.remove("_role");
                    props.insert("_distance".to_string(), serde_json::Value::from(distance));
                    if mp.0.len() > 1 {
                        props.insert("_part".to_string(), serde_json::Value::from(pi));
                    }
                }
                out_features.push(serde_json::json!({
                    "type": "Feature",
                    "geometry": polygon_to_json(part),
                    "properties": nf.get("properties").cloned().unwrap_or(serde_json::json!({})),
                }));
            }
        }
        if buffered == 0 {
            return Err("无可缓冲要素（Point/LineString/Polygon 及 Multi*）".to_string());
        }

        Ok(serde_json::json!({
            "type": "FeatureCollection",
            "features": out_features,
        })
        .to_string())
    }
}

export!(BufferZones);

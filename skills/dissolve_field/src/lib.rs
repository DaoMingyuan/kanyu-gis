//! 堪舆融合技能（WASM guest）：按属性字段分组合并面要素（dissolve）。
//!
//! 输入 FeatureCollection 约定：
//! - 首条 `properties._role == "param"` 要素携带 `_field`（分组字段名，必填）；
//!   参数要素为操作约定，不带入输出；
//! - 其余 Polygon / MultiPolygon 为基准要素：按 `_field` 值分组，组内几何
//!   合并（union），每组输出一个要素——properties 只保留分组字段值 +
//!   `_count`（组内原要素数），多部附 `_part`；
//! - 分组字段缺失/空值的要素归入 `_field` 缺失组（值写 null）；
//!   非面要素报错（融合仅面向面要素）。
//!
//! 算法（geo 0.33）：`geo::BooleanOps::union` 组内折叠（相邻/相交面合并，
//! 相离面保留为多部）。
//!
//! 构建（生成 ../dissolve_field.wasm）：
//!   cargo build --target wasm32-unknown-unknown --release \
//!     --manifest-path dsh/skills/dissolve_field/Cargo.toml
//!   wasm-tools component new \
//!     dsh/skills/dissolve_field/target/wasm32-unknown-unknown/release/dissolve_field.wasm \
//!     -o dsh/skills/dissolve_field.wasm

use std::collections::BTreeMap;
use std::convert::TryFrom;

use geo::BooleanOps;
use geo_types::{Geometry, LineString, MultiPolygon, Polygon};

wit_bindgen::generate!({
    world: "skill",
    path: "../../../crates/kanyu-skill/wit",
});

struct DissolveField;

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

/// 单要素 geometry → geo MultiPolygon（仅面要素；其余报错）。
fn to_multi_polygon(i: usize, g: &serde_json::Value) -> Result<MultiPolygon<f64>, String> {
    let gj: geojson::Geometry = serde_json::from_value(g.clone())
        .map_err(|e| format!("要素 #{i} geometry 非合法 GeoJSON: {e}"))?;
    match Geometry::<f64>::try_from(gj).map_err(|e| format!("要素 #{i} geometry 转换失败: {e}"))? {
        Geometry::Polygon(p) => Ok(MultiPolygon(vec![p])),
        Geometry::MultiPolygon(mp) => Ok(mp),
        _ => Err(format!("要素 #{i} 非面要素（融合仅支持 Polygon/MultiPolygon）")),
    }
}

/// 参数要素提取：首条 `_role=="param"` 的 `_field`。
fn read_field(features: &[serde_json::Value]) -> Result<&str, String> {
    for f in features {
        let props = f.get("properties");
        let is_param = props
            .and_then(|p| p.get("_role"))
            .and_then(|r| r.as_str())
            == Some("param");
        if !is_param {
            continue;
        }
        return props
            .and_then(|p| p.get("_field"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "参数要素缺少 _field（分组字段名）".to_string());
    }
    Err("未找到融合参数（properties._role=\"param\" 且含 _field 的要素）".to_string())
}

/// 分组键：字段值的稳定字符串形（缺失/空 → 统一缺失键）。
fn group_key(props: Option<&serde_json::Value>, field: &str) -> (String, serde_json::Value) {
    let v = props
        .and_then(|p| p.get(field))
        .cloned()
        .unwrap_or(serde_json::Value::Null);
    let key = match &v {
        serde_json::Value::Null => "__null__".to_string(),
        serde_json::Value::String(s) => "s:".to_string() + s,
        other => "j:".to_string() + &other.to_string(),
    };
    (key, v)
}

impl exports::kanyu::skill::analyzer::Guest for DissolveField {
    fn meta() -> String {
        r#"{"name":"dissolve_field","version":"0.1.0","capabilities":["analyzer"]}"#.to_string()
    }

    fn run(input: String) -> Result<String, String> {
        let root: serde_json::Value =
            serde_json::from_str(&input).map_err(|e| format!("输入非合法 JSON: {e}"))?;
        let features = root
            .get("features")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "输入缺少 features 数组".to_string())?;

        let field = read_field(features)?;

        // ① 分组（BTreeMap 稳定序）
        let mut groups: BTreeMap<String, (serde_json::Value, Vec<MultiPolygon<f64>>)> = BTreeMap::new();
        for (i, f) in features.iter().enumerate() {
            let role = f
                .get("properties")
                .and_then(|p| p.get("_role"))
                .and_then(|r| r.as_str());
            if role == Some("param") {
                continue;
            }
            let g = match f.get("geometry") {
                Some(g) if !g.is_null() => g,
                _ => continue,
            };
            let mp = to_multi_polygon(i, g)?;
            let (key, val) = group_key(f.get("properties"), field);
            groups.entry(key).or_insert_with(|| (val, Vec::new())).1.push(mp);
        }
        if groups.is_empty() {
            return Err("无可融合面要素（Polygon/MultiPolygon）".to_string());
        }

        // ② 组内 union 折叠 → 逐组输出（properties = 分组字段 + _count，多部附 _part）
        let mut out_features: Vec<serde_json::Value> = Vec::new();
        for (_, (val, mps)) in &groups {
            let mut merged = MultiPolygon::<f64>(vec![]);
            for mp in mps {
                merged = merged.union(mp);
            }
            if merged.0.is_empty() {
                return Err("融合结果为空（组内几何合并失败）".to_string());
            }
            let count = mps.len();
            for (pi, part) in merged.0.iter().enumerate() {
                let mut props = serde_json::Map::new();
                props.insert(field.to_string(), val.clone());
                props.insert("_count".to_string(), serde_json::Value::from(count));
                if merged.0.len() > 1 {
                    props.insert("_part".to_string(), serde_json::Value::from(pi));
                }
                out_features.push(serde_json::json!({
                    "type": "Feature",
                    "geometry": polygon_to_json(part),
                    "properties": serde_json::Value::Object(props),
                }));
            }
        }

        serde_json::to_string(&serde_json::json!({
            "type": "FeatureCollection",
            "features": out_features,
        }))
        .map_err(|e| format!("输出序列化失败: {e}"))
    }
}

// export! 由上面的 generate! 就地生成（macros generating macros）。
export!(DissolveField);

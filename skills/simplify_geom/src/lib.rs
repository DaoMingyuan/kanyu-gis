//! 堪舆几何简化技能（WASM guest）：按容差对线/面要素做简化（RDP 算法）。
//!
//! 输入 FeatureCollection 约定：
//! - 首条 `properties._role == "param"` 要素携带简化参数：`_tolerance`
//!   （数值，地图单位，> 0——Ramer-Douglas-Peucker 容差，越大简化越狠）；
//!   参数要素为操作约定，不带入输出；
//! - 其余 LineString / Polygon 及 Multi* 要素按容差抽稀顶点，属性继承 +
//!   `_tolerance` + `_verts`（简化前后顶点数 "前→后"）；Point / MultiPoint
//!   与无 geometry 要素原样透传（简化对点无意义）。
//!
//! 算法（geo 0.33）：`geo::Simplify`（Ramer-Douglas-Peucker）。简化后环仍
//! 保持闭合有效；结果退化（面环 < 4 坐标、线 < 2 坐标）的要素跳过，全部
//! 退化时中文报错。
//!
//! 构建（生成 ../simplify_geom.wasm）：
//!   cargo build --target wasm32-unknown-unknown --release \
//!     --manifest-path dsh/skills/simplify_geom/Cargo.toml
//!   wasm-tools component new \
//!     dsh/skills/simplify_geom/target/wasm32-unknown-unknown/release/simplify_geom.wasm \
//!     -o dsh/skills/simplify_geom.wasm

use std::convert::TryFrom;

use geo::Simplify;
use geo_types::{Geometry, LineString, MultiLineString, MultiPolygon, Polygon};

wit_bindgen::generate!({
    world: "skill",
    path: "../../../crates/kanyu-skill/wit",
});

struct SimplifyGeom;

/// geo LineString → GeoJSON 坐标数组。
fn line_to_json(ls: &LineString<f64>) -> serde_json::Value {
    serde_json::Value::Array(
        ls.coords()
            .map(|c| serde_json::json!([c.x, c.y]))
            .collect(),
    )
}

/// geo Polygon → GeoJSON geometry Value。
fn polygon_to_json(poly: &Polygon<f64>) -> serde_json::Value {
    let mut rings = Vec::with_capacity(poly.interiors().len() + 1);
    rings.push(line_to_json(poly.exterior()));
    for hole in poly.interiors() {
        rings.push(line_to_json(hole));
    }
    serde_json::json!({ "type": "Polygon", "coordinates": rings })
}

/// geo Geometry → GeoJSON geometry Value（线/面系；点系不走此路）。
fn geometry_to_json(g: &Geometry<f64>) -> serde_json::Value {
    match g {
        Geometry::LineString(ls) => {
            serde_json::json!({ "type": "LineString", "coordinates": line_to_json(ls) })
        }
        Geometry::MultiLineString(mls) => serde_json::json!({
            "type": "MultiLineString",
            "coordinates": mls.0.iter().map(line_to_json).collect::<Vec<_>>(),
        }),
        Geometry::Polygon(p) => polygon_to_json(p),
        Geometry::MultiPolygon(mp) => serde_json::json!({
            "type": "MultiPolygon",
            "coordinates": mp.0.iter().map(|p| {
                polygon_to_json(p).get("coordinates").cloned().unwrap_or(serde_json::json!([]))
            }).collect::<Vec<_>>(),
        }),
        _ => serde_json::Value::Null,
    }
}

/// geo Geometry 顶点总数（线/面系坐标计数；点系按点数）。
fn vertex_count(g: &Geometry<f64>) -> usize {
    match g {
        Geometry::Point(_) => 1,
        Geometry::MultiPoint(mp) => mp.0.len(),
        Geometry::LineString(ls) => ls.0.len(),
        Geometry::MultiLineString(mls) => mls.0.iter().map(|l| l.0.len()).sum(),
        Geometry::Polygon(p) => {
            p.exterior().0.len() + p.interiors().iter().map(|r| r.0.len()).sum::<usize>()
        }
        Geometry::MultiPolygon(mp) => mp.0.iter().map(|p| {
            p.exterior().0.len() + p.interiors().iter().map(|r| r.0.len()).sum::<usize>()
        }).sum(),
        _ => 0,
    }
}

/// 参数要素提取：首条 `_role=="param"` 的 `_tolerance`（> 0）。
fn read_tolerance(features: &[serde_json::Value]) -> Result<f64, String> {
    for f in features {
        let props = f.get("properties");
        let is_param = props
            .and_then(|p| p.get("_role"))
            .and_then(|r| r.as_str())
            == Some("param");
        if !is_param {
            continue;
        }
        let t = props
            .and_then(|p| p.get("_tolerance"))
            .and_then(|v| v.as_f64())
            .ok_or_else(|| "参数要素缺少 _tolerance 数值".to_string())?;
        if t <= 0.0 {
            return Err("简化容差必须为正数".to_string());
        }
        return Ok(t);
    }
    Err("未找到简化参数（properties._role=\"param\" 且含 _tolerance 的要素）".to_string())
}

/// 单要素 geometry（serde_json Value）→ geo Geometry。
fn to_geometry(i: usize, g: &serde_json::Value) -> Result<Geometry<f64>, String> {
    let gj: geojson::Geometry = serde_json::from_value(g.clone())
        .map_err(|e| format!("要素 #{i} geometry 非合法 GeoJSON: {e}"))?;
    Geometry::<f64>::try_from(gj).map_err(|e| format!("要素 #{i} geometry 转换失败: {e}"))
}

/// 线/面几何按容差简化；退化（线 < 2 坐标 / 面环 < 4 坐标）返回 None 跳过。
fn simplify_geom(g: &Geometry<f64>, tol: f64) -> Option<Geometry<f64>> {
    match g {
        Geometry::LineString(ls) => {
            let s = ls.simplify(tol);
            if s.0.len() >= 2 { Some(Geometry::LineString(s)) } else { None }
        }
        Geometry::MultiLineString(mls) => {
            let s: MultiLineString<f64> = mls.simplify(tol);
            let kept: Vec<LineString<f64>> = s.0.into_iter().filter(|l| l.0.len() >= 2).collect();
            if kept.is_empty() { None } else { Some(Geometry::MultiLineString(MultiLineString(kept))) }
        }
        Geometry::Polygon(p) => {
            let s = p.simplify(tol);
            if s.exterior().0.len() >= 4 { Some(Geometry::Polygon(s)) } else { None }
        }
        Geometry::MultiPolygon(mp) => {
            let s: MultiPolygon<f64> = mp.simplify(tol);
            let kept: Vec<Polygon<f64>> =
                s.0.into_iter().filter(|p| p.exterior().0.len() >= 4).collect();
            if kept.is_empty() { None } else { Some(Geometry::MultiPolygon(MultiPolygon(kept))) }
        }
        _ => None,
    }
}

impl exports::kanyu::skill::analyzer::Guest for SimplifyGeom {
    fn meta() -> String {
        r#"{"name":"simplify_geom","version":"0.1.0","capabilities":["analyzer"]}"#.to_string()
    }

    fn run(input: String) -> Result<String, String> {
        let root: serde_json::Value =
            serde_json::from_str(&input).map_err(|e| format!("输入非合法 JSON: {e}"))?;
        let features = root
            .get("features")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "输入缺少 features 数组".to_string())?;

        let tolerance = read_tolerance(features)?;

        let mut out_features: Vec<serde_json::Value> = Vec::new();
        let mut simplified = 0usize;
        let mut skipped = 0usize;
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
            match geom {
                // 点系透传（简化对点无意义）
                Geometry::Point(_) | Geometry::MultiPoint(_) => {
                    out_features.push(f.clone());
                }
                _ => {
                    let before = vertex_count(&geom);
                    match simplify_geom(&geom, tolerance) {
                        Some(sg) => {
                            let after = vertex_count(&sg);
                            simplified += 1;
                            let mut props = f
                                .get("properties")
                                .and_then(|p| p.as_object().cloned())
                                .unwrap_or_default();
                            props.remove("_role");
                            props.insert("_tolerance".to_string(), serde_json::Value::from(tolerance));
                            props.insert(
                                "_verts".to_string(),
                                serde_json::Value::from(format!("{before}→{after}")),
                            );
                            out_features.push(serde_json::json!({
                                "type": "Feature",
                                "geometry": geometry_to_json(&sg),
                                "properties": serde_json::Value::Object(props),
                            }));
                        }
                        None => skipped += 1, // 退化要素跳过
                    }
                }
            }
        }
        if simplified == 0 {
            return Err(format!(
                "无可简化要素（线/面系；{skipped} 要素容差 {tolerance} 下退化跳过）"
            ));
        }

        Ok(serde_json::json!({
            "type": "FeatureCollection",
            "features": out_features,
        })
        .to_string())
    }
}

export!(SimplifyGeom);

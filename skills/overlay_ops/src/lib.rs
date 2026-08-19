//! 堪舆叠加分析技能（WASM guest）：两图层叠加（intersect / union / difference）。
//!
//! 输入 FeatureCollection 约定：
//! - 首条 `properties._role == "param"` 要素携带 `_op`：
//!   `"intersect"`（相交——基准面 × 叠加面两两交集，基准属性继承）/
//!   `"union"`（合并——两图层全部面合并为整体，按部输出）/
//!   `"difference"`（差集——基准面减去叠加面整体，基准属性继承）/
//!   `"clip"`（裁剪——基准面 × 叠加整体一次性交集，ArcGIS Clip 语义：
//!   不两两配对、叠加属性不入产出，基准属性继承，一部一基准要素）；
//! - `properties._role == "overlay"` 要素为叠加层（host 从第二输入文件注入）；
//! - 其余为基准层要素；仅 Polygon / MultiPolygon 参与叠加，参数要素不带入输出。
//!
//! 算法（geo 0.33）：`geo::BooleanOps`（intersection/union/difference），
//! 叠加层先合并为整体再参与差集/裁剪；交集两两配对逐部输出。
//!
//! 构建（生成 ../overlay_ops.wasm）：
//!   cargo build --target wasm32-unknown-unknown --release \
//!     --manifest-path dsh/skills/overlay_ops/Cargo.toml
//!   wasm-tools component new \
//!     dsh/skills/overlay_ops/target/wasm32-unknown-unknown/release/overlay_ops.wasm \
//!     -o dsh/skills/overlay_ops.wasm

use std::convert::TryFrom;

use geo::BooleanOps;
use geo_types::{Geometry, LineString, MultiPolygon, Polygon};

wit_bindgen::generate!({
    world: "skill",
    path: "../../../crates/kanyu-skill/wit",
});

struct OverlayOps;

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
        _ => Err(format!("要素 #{i} 非面要素（叠加分析仅支持 Polygon/MultiPolygon）")),
    }
}

/// 参数要素提取：首条 `_role=="param"` 的 `_op`。
fn read_op(features: &[serde_json::Value]) -> Result<&str, String> {
    for f in features {
        let props = f.get("properties");
        let is_param = props
            .and_then(|p| p.get("_role"))
            .and_then(|r| r.as_str())
            == Some("param");
        if !is_param {
            continue;
        }
        let op = props
            .and_then(|p| p.get("_op"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "参数要素缺少 _op（intersect/union/difference/clip）".to_string())?;
        return match op {
            "intersect" | "union" | "difference" | "clip" => Ok(op),
            _ => Err(format!("不支持的叠加算子 \"{op}\"（支持 intersect/union/difference/clip）")),
        };
    }
    Err("未找到叠加参数（properties._role=\"param\" 且含 _op 的要素）".to_string())
}

/// 产出要素构造：基准属性继承（去 _role），多部附 `_part`。
fn push_parts(
    out: &mut Vec<serde_json::Value>,
    src_props: Option<&serde_json::Value>,
    mp: &MultiPolygon<f64>,
) {
    let base_props = src_props.cloned().unwrap_or(serde_json::json!({}));
    for (pi, part) in mp.0.iter().enumerate() {
        let mut props = base_props.as_object().cloned().unwrap_or_default();
        props.remove("_role");
        if mp.0.len() > 1 {
            props.insert("_part".to_string(), serde_json::Value::from(pi));
        }
        out.push(serde_json::json!({
            "type": "Feature",
            "geometry": polygon_to_json(part),
            "properties": serde_json::Value::Object(props),
        }));
    }
}

impl exports::kanyu::skill::analyzer::Guest for OverlayOps {
    fn meta() -> String {
        r#"{"name":"overlay_ops","version":"0.1.0","capabilities":["analyzer"]}"#.to_string()
    }

    fn run(input: String) -> Result<String, String> {
        let root: serde_json::Value =
            serde_json::from_str(&input).map_err(|e| format!("输入非合法 JSON: {e}"))?;
        let features = root
            .get("features")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "输入缺少 features 数组".to_string())?;

        let op = read_op(features)?;

        // ① 分派基准层 / 叠加层
        let mut base: Vec<(usize, MultiPolygon<f64>)> = Vec::new();
        let mut overlay: Vec<MultiPolygon<f64>> = Vec::new();
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
            if role == Some("overlay") {
                overlay.push(to_multi_polygon(i, g)?);
            } else {
                base.push((i, to_multi_polygon(i, g)?));
            }
        }
        if base.is_empty() {
            return Err("无基准面要素（Polygon/MultiPolygon）".to_string());
        }
        if op != "union" && overlay.is_empty() {
            return Err("无叠加面要素（properties._role=\"overlay\"，由 input2 注入）".to_string());
        }

        // ② 叠加层合并为整体（union/difference 的减项、intersect 的配对域）
        let mut overlay_union = MultiPolygon::<f64>(vec![]);
        for mp in &overlay {
            overlay_union = overlay_union.union(mp);
        }

        // ③ 算子分派
        let mut out_features: Vec<serde_json::Value> = Vec::new();
        match op {
            "intersect" => {
                for (i, bmp) in &base {
                    let src_props = features[*i].get("properties");
                    for bp in &bmp.0 {
                        for op_ in overlay_union.0.iter() {
                            let inter = bp.intersection(op_);
                            if !inter.0.is_empty() {
                                push_parts(&mut out_features, src_props, &inter);
                            }
                        }
                    }
                }
                if out_features.is_empty() {
                    return Err("叠加结果为空（两图层无相交区域）".to_string());
                }
            }
            "union" => {
                let mut all = overlay_union.clone();
                for (_, bmp) in &base {
                    all = all.union(bmp);
                }
                if all.0.is_empty() {
                    return Err("叠加结果为空".to_string());
                }
                push_parts(&mut out_features, None, &all);
            }
            "clip" => {
                // 裁剪（ArcGIS Clip 语义）：基准面整体 ∩ 叠加整体——不两两配对，
                // 叠加属性不入产出，一部一基准要素（多部附 _part）。
                for (i, bmp) in &base {
                    let src_props = features[*i].get("properties");
                    let inter = bmp.intersection(&overlay_union);
                    if !inter.0.is_empty() {
                        push_parts(&mut out_features, src_props, &inter);
                    }
                }
                if out_features.is_empty() {
                    return Err("裁剪结果为空（基准面与裁剪模子无相交区域）".to_string());
                }
            }
            _ => {
                // difference：基准面逐面减去叠加整体
                for (i, bmp) in &base {
                    let src_props = features[*i].get("properties");
                    for bp in &bmp.0 {
                        let diff = bp.difference(&overlay_union);
                        if !diff.0.is_empty() {
                            push_parts(&mut out_features, src_props, &diff);
                        }
                    }
                }
                if out_features.is_empty() {
                    return Err("差集结果为空（基准面被叠加面完全覆盖）".to_string());
                }
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
export!(OverlayOps);

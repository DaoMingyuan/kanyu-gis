//! 堪舆面切割技能（WASM guest）：以切割线劈开面要素。
//!
//! 输入 FeatureCollection 约定：
//! - `properties._role == "cut"` 的首条 LineString 为切割线（输出中剔除）；
//! - 其余 Polygon / MultiPolygon 为目标面，属性随切割结果继承并附 `_part` 序号；
//! - 点/线等其他要素原样透传。
//!
//! 算法（geo 0.33）：切割线微缓冲成窄条带（ε = 数据范围 × 1e-6），
//! 与目标面做 BooleanOps 差集——切割线贯通则差集裂为多部，逐一输出；
//! 未贯通（或未接触）则差集仍为单部，目标面原样保留。
//!
//! 构建（生成 ../split_polygons.wasm）：
//!   cargo build --target wasm32-unknown-unknown --release \
//!     --manifest-path dsh/skills/split_polygons/Cargo.toml
//!   wasm-tools component new \
//!     dsh/skills/split_polygons/target/wasm32-unknown-unknown/release/split_polygons.wasm \
//!     -o dsh/skills/split_polygons.wasm

use geo::{BooleanOps, Buffer, Coord, LineString, MultiPolygon, Polygon};

wit_bindgen::generate!({
    world: "skill",
    path: "../../../crates/kanyu-skill/wit",
});

struct SplitPolygons;

/// JSON 坐标数组 → geo Coord 序列（仅取 x/y，Z/M 不参算）。
fn to_coords(arr: &[serde_json::Value]) -> Result<Vec<Coord<f64>>, String> {
    let mut out = Vec::with_capacity(arr.len());
    for p in arr {
        let pair = p.as_array().ok_or_else(|| "坐标项非数组".to_string())?;
        if pair.len() < 2 {
            return Err("坐标项不足二维".to_string());
        }
        let x = pair[0].as_f64().ok_or_else(|| "坐标 x 非数值".to_string())?;
        let y = pair[1].as_f64().ok_or_else(|| "坐标 y 非数值".to_string())?;
        out.push(Coord { x, y });
    }
    Ok(out)
}

fn to_line_string(arr: &[serde_json::Value]) -> Result<LineString<f64>, String> {
    Ok(LineString::new(to_coords(arr)?))
}

/// 单个 Polygon 的 coordinates（[外环, 洞环...]）→ geo Polygon。
fn to_polygon(rings: &[serde_json::Value]) -> Result<Polygon<f64>, String> {
    if rings.is_empty() {
        return Err("Polygon coordinates 为空".to_string());
    }
    let ext = to_line_string(
        rings[0].as_array().ok_or_else(|| "外环非数组".to_string())?,
    )?;
    let mut holes = Vec::new();
    for ring in rings.iter().skip(1) {
        holes.push(to_line_string(
            ring.as_array().ok_or_else(|| "洞环非数组".to_string())?,
        )?);
    }
    Ok(Polygon::new(ext, holes))
}

/// geo Polygon → GeoJSON geometry Value。
fn polygon_to_json(poly: &Polygon<f64>) -> serde_json::Value {
    let mut rings = Vec::with_capacity(poly.interiors().len() + 1);
    let dump = |ls: &LineString<f64>| {
        serde_json::Value::Array(
            ls.coords()
                .map(|c| serde_json::json!([c.x, c.y]))
                .collect(),
        )
    };
    rings.push(dump(poly.exterior()));
    for hole in poly.interiors() {
        rings.push(dump(hole));
    }
    serde_json::json!({ "type": "Polygon", "coordinates": rings })
}

/// 数据范围（全部目标面外包围盒最长边），ε 缓冲宽度的基准。
fn bbox_extent(polys: &[MultiPolygon<f64>]) -> f64 {
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for mp in polys {
        for poly in mp.iter() {
            for c in poly.exterior().coords() {
                x0 = x0.min(c.x); y0 = y0.min(c.y);
                x1 = x1.max(c.x); y1 = y1.max(c.y);
            }
        }
    }
    if x0 > x1 { 1.0 } else { (x1 - x0).max(y1 - y0) }
}

impl exports::kanyu::skill::analyzer::Guest for SplitPolygons {
    fn meta() -> String {
        r#"{"name":"split_polygons","version":"0.1.0","capabilities":["analyzer"]}"#.to_string()
    }

    fn run(input: String) -> Result<String, String> {
        let root: serde_json::Value =
            serde_json::from_str(&input).map_err(|e| format!("输入非合法 JSON: {e}"))?;
        let features = root
            .get("features")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "输入缺少 features 数组".to_string())?;

        // ① 找切割线（首条 _role=="cut" 的 LineString）
        let mut cut: Option<LineString<f64>> = None;
        for f in features {
            let is_cut = f
                .get("properties")
                .and_then(|p| p.get("_role"))
                .and_then(|r| r.as_str())
                == Some("cut");
            if !is_cut {
                continue;
            }
            let g = f.get("geometry").ok_or_else(|| "切割线缺 geometry".to_string())?;
            if g.get("type").and_then(|t| t.as_str()) != Some("LineString") {
                return Err("切割线必须是 LineString".to_string());
            }
            let coords = g
                .get("coordinates")
                .and_then(|c| c.as_array())
                .ok_or_else(|| "切割线缺 coordinates".to_string())?;
            let line = to_line_string(coords)?;
            if line.0.len() < 2 {
                return Err("切割线至少需要 2 个顶点".to_string());
            }
            cut = Some(line);
            break;
        }
        let cut = cut.ok_or_else(|| "未找到切割线（properties._role=\"cut\" 的 LineString）".to_string())?;

        // ② 解析目标面
        let mut targets: Vec<(usize, MultiPolygon<f64>)> = Vec::new();
        for (i, f) in features.iter().enumerate() {
            let g = match f.get("geometry") {
                Some(g) if !g.is_null() => g,
                _ => continue,
            };
            let coords = g.get("coordinates").and_then(|c| c.as_array());
            match g.get("type").and_then(|t| t.as_str()) {
                Some("Polygon") => {
                    let rings = coords.ok_or_else(|| format!("要素 #{i} Polygon 缺 coordinates"))?;
                    targets.push((i, MultiPolygon(vec![to_polygon(rings)?])));
                }
                Some("MultiPolygon") => {
                    let polys = coords.ok_or_else(|| format!("要素 #{i} MultiPolygon 缺 coordinates"))?;
                    let mut mp = Vec::with_capacity(polys.len());
                    for p in polys {
                        let rings = p.as_array().ok_or_else(|| format!("要素 #{i} 子面非数组"))?;
                        mp.push(to_polygon(rings)?);
                    }
                    targets.push((i, MultiPolygon(mp)));
                }
                _ => {}
            }
        }
        if targets.is_empty() {
            return Err("无目标面要素（Polygon/MultiPolygon）".to_string());
        }

        // ③ 微缓冲切割线 → 逐面差集劈分
        let extent = bbox_extent(&targets.iter().map(|(_, mp)| mp.clone()).collect::<Vec<_>>());
        let eps = extent * 1e-6;
        let strip = cut.buffer(eps);

        let mut out_features: Vec<serde_json::Value> = Vec::new();
        let mut split_count = 0usize;
        for (i, f) in features.iter().enumerate() {
            let is_cut = f
                .get("properties")
                .and_then(|p| p.get("_role"))
                .and_then(|r| r.as_str())
                == Some("cut");
            if is_cut {
                continue; // 切割线为操作产物，不带入输出
            }
            let target = targets.iter().find(|(ti, _)| *ti == i);
            let Some((_, mp)) = target else {
                out_features.push(f.clone()); // 非面要素原样透传
                continue;
            };
            let mut parts: Vec<Polygon<f64>> = Vec::new();
            for poly in mp.iter() {
                let diff = poly.difference(&strip);
                parts.extend(diff.into_iter());
            }
            if parts.len() > mp.0.len() {
                split_count += 1;
            }
            for (pi, part) in parts.iter().enumerate() {
                let mut nf = f.clone();
                let props = nf.get_mut("properties").and_then(|p| p.as_object_mut());
                if let Some(props) = props {
                    props.remove("_role");
                    if parts.len() > 1 {
                        props.insert("_part".to_string(), serde_json::Value::from(pi));
                    }
                }
                nf.as_object_mut()
                    .ok_or_else(|| "要素非对象".to_string())?
                    .insert("geometry".to_string(), polygon_to_json(part));
                out_features.push(nf);
            }
        }
        if split_count == 0 {
            return Err("切割线未劈开任何目标面（须横贯面要素）".to_string());
        }
        serde_json::to_string(&serde_json::json!({
            "type": "FeatureCollection",
            "features": out_features,
        }))
        .map_err(|e| format!("输出序列化失败: {e}"))
    }
}

// export! 由上面的 generate! 就地生成（macros generating macros）。
export!(SplitPolygons);

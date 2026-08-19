//! 堪舆几何量算技能（WASM guest）：逐要素面积/长度量算（ArcGIS Calculate
//! Geometry 语义对齐）。
//!
//! 输入 FeatureCollection 约定：
//! - 首条 `properties._role == "param"` 要素携带量算参数：`_measure`
//!   （`"area"` 面积 / `"length"` 长度，必填）；参数要素为操作约定，不带入输出；
//! - 其余要素按类型量算，结果写入属性：
//!   - `area`：Polygon/MultiPolygon → `_area`（shoelace 外环减内环，平方地图单位）；
//!   - `length`：LineString/MultiLineString → `_length`（欧氏长度，地图单位）；
//!   - 类型不匹配（点系、area 作用于线等）跳过并计 `_skipped`；无 geometry 透传。
//!
//! 纯 shoelace/欧氏长度实现，零 geo 依赖（平面坐标语义——投影单位即地图单位，
//! 经纬度数据请先投影变换再量算）。
//!
//! 构建（生成 ../measure_geom.wasm）：
//!   cargo build --target wasm32-unknown-unknown --release \
//!     --manifest-path dsh/skills/measure_geom/Cargo.toml
//!   wasm-tools component new \
//!     dsh/skills/measure_geom/target/wasm32-unknown-unknown/release/measure_geom.wasm \
//!     -o dsh/skills/measure_geom.wasm

wit_bindgen::generate!({
    world: "skill",
    path: "../../../crates/kanyu-skill/wit",
});

struct MeasureGeom;

/// 坐标环 shoelace 面积（绝对值）。
fn ring_area(ring: &[Vec<f64>]) -> f64 {
    let mut s = 0.0;
    for i in 0..ring.len() {
        let a = &ring[i];
        let b = &ring[(i + 1) % ring.len()];
        s += a[0] * b[1] - b[0] * a[1];
    }
    s.abs() / 2.0
}

/// 多边形面积：外环减全部内环。
fn polygon_area(rings: &[Vec<Vec<f64>>]) -> f64 {
    if rings.is_empty() {
        return 0.0;
    }
    let mut a = ring_area(&rings[0]);
    for hole in &rings[1..] {
        a -= ring_area(hole);
    }
    a.max(0.0)
}

/// 折线欧氏长度。
fn line_length(coords: &[Vec<f64>]) -> f64 {
    coords
        .windows(2)
        .map(|w| ((w[1][0] - w[0][0]).powi(2) + (w[1][1] - w[0][1]).powi(2)).sqrt())
        .sum()
}

/// 要素 geometry 量算：area → 面系求面积；length → 线系求长度；其余 None。
fn measure(g: &serde_json::Value, op: &str) -> Option<f64> {
    let ty = g.get("type")?.as_str()?;
    let coords = g.get("coordinates")?;
    match (op, ty) {
        ("area", "Polygon") => serde_json::from_value::<Vec<Vec<Vec<f64>>>>(coords.clone())
            .ok()
            .map(|r| polygon_area(&r)),
        ("area", "MultiPolygon") => serde_json::from_value::<Vec<Vec<Vec<Vec<f64>>>>>(coords.clone())
            .ok()
            .map(|ms| ms.iter().map(|p| polygon_area(p)).sum()),
        ("length", "LineString") => serde_json::from_value::<Vec<Vec<f64>>>(coords.clone())
            .ok()
            .map(|c| line_length(&c)),
        ("length", "MultiLineString") => serde_json::from_value::<Vec<Vec<Vec<f64>>>>(coords.clone())
            .ok()
            .map(|ms| ms.iter().map(|l| line_length(l)).sum()),
        _ => None,
    }
}

/// 参数要素提取：首条 `_role=="param"` 的 `_measure`（area/length）。
fn read_measure(features: &[serde_json::Value]) -> Result<&str, String> {
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
            .and_then(|p| p.get("_measure"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "参数要素缺少 _measure（area/length）".to_string())?;
        return match op {
            "area" | "length" => Ok(op),
            _ => Err(format!("不支持的量算类型 \"{op}\"（支持 area/length）")),
        };
    }
    Err("未找到量算参数（properties._role=\"param\" 且含 _measure 的要素）".to_string())
}

impl exports::kanyu::skill::analyzer::Guest for MeasureGeom {
    fn meta() -> String {
        r#"{"name":"measure_geom","version":"0.1.0","capabilities":["analyzer"]}"#.to_string()
    }

    fn run(input: String) -> Result<String, String> {
        let root: serde_json::Value =
            serde_json::from_str(&input).map_err(|e| format!("输入非合法 JSON: {e}"))?;
        let features = root
            .get("features")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "输入缺少 features 数组".to_string())?;

        let op = read_measure(features)?;
        let out_key = if op == "area" { "_area" } else { "_length" };

        let mut out_features: Vec<serde_json::Value> = Vec::new();
        let mut measured = 0usize;
        let mut skipped = 0usize;
        for f in features {
            let props_obj = f.get("properties").and_then(|p| p.as_object().cloned());
            let is_param = f
                .get("properties")
                .and_then(|p| p.get("_role"))
                .and_then(|r| r.as_str())
                == Some("param");
            if is_param {
                continue; // 参数要素为操作约定，不带入输出
            }
            let g = f.get("geometry");
            let val = g.filter(|g| !g.is_null()).and_then(|g| measure(g, op));
            match val {
                Some(v) => {
                    measured += 1;
                    let mut props = props_obj.unwrap_or_default();
                    props.remove("_role");
                    props.insert(out_key.to_string(), serde_json::Value::from(v));
                    out_features.push(serde_json::json!({
                        "type": "Feature",
                        "geometry": g.cloned().unwrap_or(serde_json::Value::Null),
                        "properties": serde_json::Value::Object(props),
                    }));
                }
                None => {
                    skipped += 1;
                    out_features.push(f.clone()); // 类型不匹配/无 geometry 透传
                }
            }
        }
        if measured == 0 {
            let want = if op == "area" { "Polygon/MultiPolygon" } else { "LineString/MultiLineString" };
            return Err(format!("无可量算要素（{op} 需要 {want}；{skipped} 要素类型不匹配透传）"));
        }

        Ok(serde_json::json!({
            "type": "FeatureCollection",
            "features": out_features,
        })
        .to_string())
    }
}

export!(MeasureGeom);

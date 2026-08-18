//! 堪舆统计聚合技能（WASM guest）：按分组字段对数值字段做统计汇总。
//!
//! 输入 FeatureCollection 约定：
//! - 首条 `properties._role == "param"` 要素携带参数：
//!   `_stat`（数值统计字段名，必填）、`_field`（分组字段名，可选——缺省全表一组）；
//! - 其余要素参与统计：`_stat` 值须为数值（或可解析为数值的字符串——宿主
//!   经 GeoArrow 类型化列中转时，混合类型列会被强制为字符串列，数值单元格
//!   变成 "10" 形态，此处兼容解析）；真正非数值的跳过并计入 `_skipped`。
//!
//! 输出：每组一个要素（geometry 为 null——纯统计表语义），properties：
//! - 分组字段值（有分组时）+ `_count`（参与要素数）/ `_skipped`（跳过的非数值数）
//!   / `_sum` / `_min` / `_max` / `_avg`。
//!
//! 构建（生成 ../stat_summary.wasm）：
//!   cargo build --target wasm32-unknown-unknown --release \
//!     --manifest-path dsh/skills/stat_summary/Cargo.toml
//!   wasm-tools component new \
//!     dsh/skills/stat_summary/target/wasm32-unknown-unknown/release/stat_summary.wasm \
//!     -o dsh/skills/stat_summary.wasm

use std::collections::BTreeMap;

wit_bindgen::generate!({
    world: "skill",
    path: "../../../crates/kanyu-skill/wit",
});

struct StatSummary;

/// 组统计累加器。
#[derive(Default)]
struct Acc {
    count: usize,
    skipped: usize,
    sum: f64,
    min: f64,
    max: f64,
}

/// 参数要素提取：`_stat` 必填，`_field` 可选。
fn read_params(features: &[serde_json::Value]) -> Result<(String, Option<String>), String> {
    for f in features {
        let props = f.get("properties");
        let is_param = props
            .and_then(|p| p.get("_role"))
            .and_then(|r| r.as_str())
            == Some("param");
        if !is_param {
            continue;
        }
        let stat = props
            .and_then(|p| p.get("_stat"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "参数要素缺少 _stat（数值统计字段名）".to_string())?;
        let field = props
            .and_then(|p| p.get("_field"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        return Ok((stat.to_string(), field));
    }
    Err("未找到统计参数（properties._role=\"param\" 且含 _stat 的要素）".to_string())
}

/// 分组键（复用 dissolve 约定：缺失/空 → 统一缺失键）。
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

/// 单元格取数值：原生数值直取；字符串尝试解析（兼容宿主类型化列强制
/// 为字符串列的场景）；其余视为非数值。
fn cell_f64(v: &serde_json::Value) -> Option<f64> {
    v.as_f64().or_else(|| {
        v.as_str().and_then(|s| {
            let t = s.trim();
            if t.is_empty() {
                None
            } else {
                t.parse::<f64>().ok()
            }
        })
    })
}

impl exports::kanyu::skill::analyzer::Guest for StatSummary {
    fn meta() -> String {
        r#"{"name":"stat_summary","version":"0.1.0","capabilities":["analyzer"]}"#.to_string()
    }

    fn run(input: String) -> Result<String, String> {
        let root: serde_json::Value =
            serde_json::from_str(&input).map_err(|e| format!("输入非合法 JSON: {e}"))?;
        let features = root
            .get("features")
            .and_then(|f| f.as_array())
            .ok_or_else(|| "输入缺少 features 数组".to_string())?;

        let (stat, field) = read_params(features)?;

        let mut groups: BTreeMap<String, (serde_json::Value, Acc)> = BTreeMap::new();
        for f in features {
            let props = f.get("properties");
            let is_param = props
                .and_then(|p| p.get("_role"))
                .and_then(|r| r.as_str())
                == Some("param");
            if is_param {
                continue;
            }
            let (key, val) = match &field {
                Some(fd) => group_key(props, fd),
                None => ("__all__".to_string(), serde_json::Value::Null),
            };
            let acc = &mut groups.entry(key).or_insert_with(|| (val, Acc::default())).1;
            match props.and_then(|p| p.get(&stat)).and_then(cell_f64) {
                Some(x) => {
                    if acc.count == 0 {
                        acc.min = x;
                        acc.max = x;
                    } else {
                        acc.min = acc.min.min(x);
                        acc.max = acc.max.max(x);
                    }
                    acc.count += 1;
                    acc.sum += x;
                }
                None => acc.skipped += 1,
            }
        }
        if groups.is_empty() {
            return Err("无可统计要素".to_string());
        }

        let mut out_features: Vec<serde_json::Value> = Vec::new();
        for (_, (val, acc)) in &groups {
            if acc.count == 0 {
                return Err(format!("组 {} 无有效数值（_stat={stat} 全为非数值）",
                    match val { serde_json::Value::Null => "<缺失>".to_string(), v => v.to_string() }));
            }
            let mut props = serde_json::Map::new();
            if let Some(fd) = &field {
                props.insert(fd.clone(), val.clone());
            }
            props.insert("_count".to_string(), serde_json::Value::from(acc.count));
            props.insert("_skipped".to_string(), serde_json::Value::from(acc.skipped));
            props.insert("_sum".to_string(), serde_json::Value::from(acc.sum));
            props.insert("_min".to_string(), serde_json::Value::from(acc.min));
            props.insert("_max".to_string(), serde_json::Value::from(acc.max));
            props.insert("_avg".to_string(), serde_json::Value::from(acc.sum / acc.count as f64));
            out_features.push(serde_json::json!({
                "type": "Feature",
                "geometry": null,
                "properties": serde_json::Value::Object(props),
            }));
        }

        serde_json::to_string(&serde_json::json!({
            "type": "FeatureCollection",
            "features": out_features,
        }))
        .map_err(|e| format!("输出序列化失败: {e}"))
    }
}

// export! 由上面的 generate! 就地生成（macros generating macros）。
export!(StatSummary);

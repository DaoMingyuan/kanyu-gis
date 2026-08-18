# kanyu-gis —— 堪舆 GIS × DeepSeek Harness 组件

> 把堪舆（Kanyu）GIS 内核的七大能力移植为 DeepSeek Harness（DSH / Cordis）动态插件，
> 并附带 `kanyu-gis` GIS 模式 agent preset。
>
> 主仓库（堪舆内核与完整文档）：[DaoMingyuan/Kanyu](https://github.com/DaoMingyuan/Kanyu)。
> 本仓是主仓 `dsh/` 目录的独立分发仓，两仓以主仓 `dsh/` 为单一事实来源。

## 组成

| 路径 | 职责 |
|------|------|
| `plugin/host.js` | 组件 Host 半（宿主进程侧）：以 `kanyu` CLI 为执行后端，暴露 Package 私有 JSON RPC，并向 DSH 模型注册 8 个 `kanyu_*` 动态工具（Harness function-calling） |
| `plugin/client.js` | 组件 Client 半（浏览器侧）：DSH Web GUI「堪舆 GIS 工作台」，会话头部按钮 + 浮层七页签（目录/数据/地图/坐标/处理/编辑/3D/关于） |
| `presets/kanyu-gis/` | GIS 模式 agent preset：`preset.yml` + `agent.cordis.yml` + `skills/kanyu-gis/SKILL.md`（七域能力地图技能） |
| `examples/` | 演示数据（GeoJSON） |
| `tools/verify_preset.mjs` | preset 可加载性旁路校验：`node tools/verify_preset.mjs --preset-dir presets` |
| `sync-preset.sh` | preset 同步到本机 DSH 安装区（`~/.dsh/.agent-presets/kanyu-gis/`）并校验 |

## 七大能力域

| 能力 | 组件工具 | 内核落点（kanyu CLI） |
|------|----------|----------------------|
| 地图面板 | `kanyu_render` | `kanyu render map`（晨山/夜观星主题，PNG/SVG） |
| GIS 数据目录读取 | `kanyu_catalog` / `kanyu_data` | `kanyu data info/query/validate` |
| 坐标框架 | `kanyu_crs` | `kanyu data reproject`（EPSG 全库） |
| 工程目录 | Client 目录页签 | `catalog.list` RPC（格式注册表对齐） |
| 地理处理 | `kanyu_geoprocess` | `kanyu analysis` 13 工具（QGIS 语义） |
| 地理编辑 | `kanyu_edit` | 组件内 GeoJSON 在线编辑内核（6 算子） |
| 3D 地理 | `kanyu_scene3d` | 挤出体场景制备 + canvas 等距投影 |

另有 `kanyu_introspect`（系统自省）。全部工具经 PATH 上的 `kanyu` CLI 执行，
不依赖宿主 `node_modules`。

## 安装

前置：安装堪舆 CLI（见主仓库 Release 的 MSI 安装包，或 `cargo install --path crates/kanyu-cli`），
并具备 DeepSeek Harness 宿主环境。

```bash
# 同步 preset 到本机 DSH 安装区（含旁路校验）
bash sync-preset.sh

# 新开 GIS 模式会话
dsh run --preset kanyu-gis -w <工作区目录>

# 或在已有会话中挂载
cordis_mount "$HOME/.dsh/.agent-presets/kanyu-gis" kanyu-gis
```

## 自我迭代边界

组件迭代发生在 Git 协作层（提交/PR），运行时绝不自改内核。
主仓联动协议见 [AI_SYNC.md](https://github.com/DaoMingyuan/Kanyu/blob/main/AI_SYNC.md)。

## 许可

双许可：[Apache-2.0](LICENSE-APACHE) 或 [MIT](LICENSE-MIT)，任选其一。

/**
 * dsh/tools/test_plugin.mjs —— kanyu-gis 组件本地测试器（无模型、确定性）。
 *
 * 原理：Host 半（dsh/plugin/host.js）是 DSH vm 沙箱求值的函数体，依赖
 *   ctx.get('shell'|'fs'|'sandboxPolicy') 与 harness.handle/registerTool/defineTool。
 * 本测试器用 node:vm 构造等价沙箱（shell 走真实 child_process → 真 kanyu CLI；
 * fs 走 node:fs），加载插件后逐项驱动全部 RPC 与动态工具抽查，断言输出形状。
 *
 * Client 半（dsh/plugin/client.js）为浏览器侧 React 代码，这里做语法解析 +
 * 结构静态断言（页签/slot 注册），不做 DOM 渲染。
 *
 * 用法（仓库根）：node dsh/tools/test_plugin.mjs [--static]
 *   --static：零依赖 CI 模式——跳过一切调用 kanyu CLI 的断言
 *   （ping / introspect / data.xxx / render.map / crs.reproject /
 *   geoprocess.run / 动态工具抽查），
 *   RPC 桥实测改用纯本地方法 crs.presets；组件仓（根布局）自动识别。
 * 退出码：0 = 全部通过；1 = 存在失败项；2 = 环境/装载错误。
 * 副作用：仅在 target/tmp/ 与 dsh/output/ 写临时文件，结束自清理。
 */
import { execFile } from 'node:child_process';
import { promises as fsp, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 布局自检：主仓为 <root>/dsh/tools/ 三级；独立组件仓（kanyu-gis）为 <root>/tools/ 两级
const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PARENT_DIR = path.dirname(TOOLS_DIR);
const IS_MAIN_LAYOUT = existsSync(path.join(path.dirname(PARENT_DIR), 'dsh', 'plugin', 'host.js'));
const REPO_ROOT = IS_MAIN_LAYOUT ? path.dirname(PARENT_DIR) : PARENT_DIR;
const DSH_DIR = IS_MAIN_LAYOUT ? 'dsh' : '.';
const dshPath = (...segs) => path.join(DSH_DIR, ...segs);
const WORKSPACE = REPO_ROOT; // 等价于 DSH 会话工作区根
const EXAMPLE = dshPath('examples', 'buildings.geojson');
const CATALOG_DIR = IS_MAIN_LAYOUT ? 'dsh' : 'examples';
const TMP_DIR = path.join(REPO_ROOT, 'target', 'tmp', 'dsh-test');
const STATIC_ONLY = process.argv.includes('--static') || process.env.KANYU_TEST_STATIC === '1';

// ---------- 结果收集 ----------
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' —— ' + detail : ''}`);
}

// ---------- mock：shell（真实子进程） ----------
// 注意：Windows 上经 cmd.exe 传含中文的绝对路径会发生代码页截断（实测
// "E:\BaiduSyncdisk\堪舆GIS\..." 在 cmd 下损坏）；DSH 生产侧 shell 服务为
// pwsh（UTF-16 参数传递无此问题）。本地测试器统一走 Git Bash（UTF-8），
// 与 kanyu CLI 实测环境一致。
const BASH = existsSync('D:/Program Files/Git/bin/bash.exe') ? 'D:/Program Files/Git/bin/bash.exe' : 'bash';
function runCmd(command, workdir, timeoutMs) {
  return new Promise((resolve) => {
    execFile(BASH, ['-c', command], {
      cwd: workdir, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
      windowsHide: true, env: { ...process.env, MSYS2_ARG_CONV_EXCL: '*' },
    }, (err, stdout, stderr) => {
      const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
      resolve({
        exitCode,
        stdout: { text: String(stdout), truncated: false },
        stderr: { text: String(stderr || (err && err.killed ? 'timeout' : '')), truncated: false },
      });
    });
  });
}
const shellService = {
  resolve(req) { return req; },
  async run(spec) { return runCmd(spec.command, spec.workdir, spec.timeoutMs); },
};

// ---------- mock：fs（dsh-fs 契约的最小等价面） ----------
const fsService = {
  async resolve(p, opts) {
    const base = (opts && opts.cwd) || WORKSPACE;
    const abs = path.isAbsolute(String(p)) ? String(p) : path.resolve(base, String(p));
    return { displayPath: abs };
  },
  processPath(t) { return typeof t === 'string' ? t : t.displayPath; },
  async listDir(t) {
    const dir = this.processPath(t);
    const ents = await fsp.readdir(dir, { withFileTypes: true });
    return ents.map((e) => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
      size: e.isFile() ? statSync(path.join(dir, e.name)).size : null,
      target: { displayPath: path.join(dir, e.name) },
    }));
  },
  async readText(t) { return fsp.readFile(this.processPath(t), 'utf8'); },
  async readBytes(t, _offset, maxBytes) {
    const b = await fsp.readFile(this.processPath(t));
    return new Uint8Array(b.subarray(0, maxBytes || b.length));
  },
  async writeText(t, text) {
    const p = this.processPath(t);
    await fsp.mkdir(path.dirname(p), { recursive: true });
    await fsp.writeFile(p, text, 'utf8');
  },
};

// ---------- mock：harness（RPC 表 + 动态工具表） ----------
const rpc = new Map();
const tools = new Map();
const harness = {
  handle(name, fn) { rpc.set(name, fn); },
  defineTool(def) { return def; },
  registerTool(_ctx, def) { tools.set(def.name, def); return def; },
};
const ctx = {
  get(key) {
    if (key === 'shell') return shellService;
    if (key === 'fs') return fsService;
    if (key === 'sandboxPolicy') return { workspaceRoot: WORKSPACE };
    return undefined;
  },
};

// ---------- 加载 Host 半（顶层 return → 函数包装后在 vm 上下文求值） ----------
async function loadPlugin(rel) {
  const src = await fsp.readFile(path.join(REPO_ROOT, rel), 'utf8');
  const sandbox = {
    console, btoa, atob, TextEncoder, TextDecoder,
    ctx, harness, setTimeout, clearTimeout, Promise, JSON, Math, Date,
  };
  vm.createContext(sandbox);
  const plugin = new vm.Script(`(function(){${src}\n})()`, { filename: rel }).runInContext(sandbox);
  if (!plugin || typeof plugin.apply !== 'function') throw new Error(rel + ' 未导出 apply');
  plugin.apply(ctx);
  return plugin;
}

async function callRpc(name, args) {
  const fn = rpc.get(name);
  if (!fn) throw new Error('RPC 未注册: ' + name);
  return fn(args || {});
}

// ---------- 主流程 ----------
async function main() {
  await fsp.mkdir(TMP_DIR, { recursive: true });

  // 装载
  const plugin = await loadPlugin(dshPath('plugin', 'host.js'));
  check('装载 host.js 并 apply', plugin.name === 'kanyu-gis', 'name=' + plugin.name);
  check('RPC 注册齐全（31 个）', rpc.size === 31, '实际 ' + rpc.size + '：' + [...rpc.keys()].join(','));
  check('动态工具注册齐全（8 个 kanyu_*）', tools.size === 8, [...tools.keys()].join(','));
  // 写拒绝指引（2026-08-18 第十八轮）：workspace-write 模式的中文可操作提示
  const hostSrc = await fsp.readFile(path.join(REPO_ROOT, dshPath('plugin', 'host.js')), 'utf8');
  check('host.js 写回失败含 workspace-write 可操作指引（3080 实测 fs 只读工作区外）',
    hostSrc.includes('workspace-write') && hostSrc.includes('writeHint'));
  // data.query 落盘健壮性（2026-08-18 第二十六轮）：kanyu --output 底层不建父目录，须先 ensureOutDir
  check('host.js dataQuery 落盘前 ensureOutDir（dsh/output 缺省时 --output 写失败防护）',
    /async function dataQuery[\s\S]*?ensureOutDir\(\)/.test(hostSrc));
  // crs.reproject 同款防护（2026-08-18 第二十七轮）：write_geojson_result 同为 std::fs::write
  check('host.js crsReproject 落盘前 ensureOutDir（reproject --output 同款防护）',
    /async function crsReproject[\s\S]*?ensureOutDir\(\)/.test(hostSrc));
  // 符号化编辑模型投影（2026-08-18 第五十二轮）：LayerSymbology → StyleRule
  // 对齐壳层 symbology.rs to_style_rule（色带值/f64::MIN 首档/均匀取样）
  const symProjKeys = ['symToRule', 'RAMPS', 'F64_MIN', 'rampSample', 'hexOf', 'Jade', 'Amber', 'Slate'];
  check('host.js 符号化投影 symToRule（RAMPS 三色带 + F64_MIN 首档 + 均匀取样）',
    symProjKeys.every((k) => hostSrc.includes(k)),
    symProjKeys.filter((k) => !hostSrc.includes(k)).join(',') || '全部命中');
  // 工程图层样式读写（第五十二轮）：style.get/style.set RPC + .kyu layers[].style
  check('host.js style.get/style.set 注册（.kyu LayerSymbology 读写 + 图层 id 匹配）',
    hostSrc.includes("harness.handle('style.get'") && hostSrc.includes("harness.handle('style.set'")
      && hostSrc.includes('async function styleGet') && hostSrc.includes('async function styleSet'));
  // 工程图层清单（2026-08-18 第五十五轮）：style.list RPC + source 相对工程目录解析
  check('host.js style.list 注册（layers 全列 + source 绝对路径解析 + styleMode 摘要 + fs.resolve 三级回退）',
    hostSrc.includes("harness.handle('style.list'") && /async function styleList[\s\S]*?styleMode/.test(hostSrc)
      && /async function styleList[\s\S]*?resolved\.displayPath/.test(hostSrc));
  // toolbox.run 同款防护（2026-08-18 第二十八轮）：tool run --output 单产出同路径写出
  check('host.js toolboxRun 落盘前 ensureOutDir（tool run --output 同款防护）',
    /async function toolboxRun[\s\S]*?ensureOutDir\(\)/.test(hostSrc));
  // kanyu_data query 落盘分支（2026-08-18 第二十九轮）：模型侧确认文本非空串
  check('host.js kanyu_data query 落盘分支含命中确认文本（对齐客户端 runQuery 语义）',
    /查询完成：命中/.test(hostSrc));
  // kanyu_crs reproject 回执计数（2026-08-18 第三十轮）：模型侧确认文本带要素数
  check('host.js kanyu_crs reproject 落盘分支含计数确认文本（对齐客户端 runReproject 语义）',
    /投影变换完成：/.test(hostSrc));
  // kanyu_data calc 字段计算器（2026-08-18 第四十三轮）：attrcalc 内核出口契约键
  check('host.js kanyu_data calc 契约键（dataCalc + ensureOutDir 防护 + 落盘确认文本）',
    /async function dataCalc[\s\S]*?ensureOutDir\(\)/.test(hostSrc) && hostSrc.includes('字段计算完成（'));
  // kanyu_geoprocess 产出回执（2026-08-18 第三十一轮）：双分支附 stderr 写出清单
  check('host.js kanyu_geoprocess 产出回执（writesSummary 解析「已写出 N 要素 → path」共用契约）',
    hostSrc.includes('writesSummary') && hostSrc.includes('产出: '));
  // kanyu_edit 撤销栈回执（2026-08-18 第三十三轮）：history 不再被文本工具丢弃
  check('host.js kanyu_edit 回执含撤销栈深度（history 不再被丢弃）',
    hostSrc.includes('撤销栈') && hostSrc.includes('r.history'));
  // 编辑算子补齐（2026-08-18 第五十六轮）：feature-move 算子契约键
  check('host.js feature-move 算子契约键（EDIT_OPS 入列 + translateCoords 递归平移 + 负量逆操作）',
    hostSrc.includes("'feature-move'") && hostSrc.includes('translateCoords') && hostSrc.includes('dx: -dx, dy: -dy'));
  // vertex-move 修复（2026-08-18 第五十六轮）：ringPath 缺省按几何类型分派 + Z/M 保留 + undo 容量对齐内核 100
  check('host.js vertex-move 修复（ringPath 类型分派 + Z/M 保留）+ EDIT_HISTORY_CAP 100',
    hostSrc.includes('ringPath 缺省按几何类型分派') && hostSrc.includes('.concat(oldPos.slice(2))')
      && hostSrc.includes('EDIT_HISTORY_CAP = 100'));
  // 挖洞算子（2026-08-18 第五十七轮）：hole-add 对齐 kanyu-edit AddHole 校验语义
  check('host.js hole-add 算子契约键（EDIT_OPS 入列 + hole-remove 逆操作 + AddHole 校验语义移植）',
    hostSrc.includes("'hole-add'") && hostSrc.includes("'hole-remove'")
      && hostSrc.includes('洞环须完全位于面内') && hostSrc.includes('洞环不得与外环或既有洞的边界相接'));
  // 整行属性替换（2026-08-18 第五十八轮）：attributes-replace 对齐 kanyu-edit UpdateProperties
  check('host.js attributes-replace 算子契约键（EDIT_OPS 入列 + 自逆操作 + UpdateProperties 移植）',
    hostSrc.includes("'attributes-replace'") && hostSrc.includes('UpdateProperties')
      && hostSrc.includes('属性已整行替换'));
  // kanyu_catalog 服务链接回执指引（2026-08-18 第三十四轮）：discover 用法指引 + fetch 接力提示 + xml/data 离线直通
  check('host.js kanyu_catalog 服务链接回执（discover 拉取指引 + fetch 接力提示 + xml/data 参数）',
    hostSrc.includes('拉取图层：本工具 url + layer=') && hostSrc.includes('接力检视/渲染/编辑')
      && hostSrc.includes('args.xml') && hostSrc.includes('args.data'));
  // kanyu_catalog WMS 参数面（2026-08-18 第三十六轮）：bbox/宽高直通 + urlOnly 离线契约
  check('host.js kanyu_catalog WMS 分支参数面（bbox/width/height 直通 + urlOnly）',
    hostSrc.includes('args.bbox') && hostSrc.includes('args.urlOnly')
      && hostSrc.includes('仅构造未拉取'));
  // kanyu_scene3d 高度范围回执（2026-08-18 第三十七轮）：heightRange 增量字段 + 交互视图接力
  check('host.js kanyu_scene3d 回执含高度范围 + 3D 页签接力指引',
    hostSrc.includes('heightRange') && hostSrc.includes('高度范围') && hostSrc.includes('工作台 3D 页签'));
  // kanyu_render layout 布局排版（2026-08-18 第四十六轮）：renderLayout 助手契约键
  check('host.js kanyu_render layout 契约键（renderLayout + ensureOutDir 防护 + 排版完成回执）',
    /async function renderLayout[\s\S]*?ensureOutDir\(\)/.test(hostSrc) && hostSrc.includes('排版完成: '));
  // 模型侧符号化同能力（2026-08-18 第五十三轮）：kanyu_render schema 含 symbology
  // 编辑模型入参 + renderLayout 同款 symToRule 投影（显式 style 优先）
  check('host.js kanyu_render schema 含 symbology 入参（LayerSymbology 编辑模型，模型侧同能力）',
    /name: 'kanyu_render'[\s\S]*?symbology: \{ type: 'object'/.test(hostSrc));
  check('host.js renderLayout symbology 投影（symToRule 同款，layout 分支同能力）',
    /async function renderLayout[\s\S]*?symToRule\(symbology\)/.test(hostSrc));
  // 3D 场景符号化着色（2026-08-18 第五十四轮）：scene3dData symbology 投影
  // 逐要素取色 + catColors 类别色映射 + symbologyMode 回执；工具 schema 同参
  check('host.js scene3d.data symbology 契约键（symToRule 投影 + catColors + symbologyMode）',
    /async function scene3dData[\s\S]*?symToRule\(symbology\)/.test(hostSrc)
      && hostSrc.includes('catColors') && hostSrc.includes('symbologyMode'));
  check('host.js kanyu_scene3d schema 含 symbology 入参（模型侧 3D 同能力）',
    /name: 'kanyu_scene3d'[\s\S]*?symbology: \{ type: 'object'/.test(hostSrc));
  // render.layout RPC（2026-08-18 第四十八轮）：kyu 工程布局规格解析 + SVG 文本回传
  check('host.js render.layout 契约键（layoutPreview + kyu 清单解析 + svg 回传 + RPC 注册）',
    /async function layoutPreview[\s\S]*?manifest\.layers/.test(hostSrc)
      && hostSrc.includes(`harness.handle('render.layout'`) && hostSrc.includes('kyu: db.path'));
  // catalog.readImage（2026-08-18 第五十轮）：产物目录越界防护 + base64 回传 + RPC 注册
  check('host.js catalog.readImage 契约键（readImagePng + 产物目录边界 + RPC 注册）',
    /async function readImagePng[\s\S]*?仅限 dsh\/output 产物目录内/.test(hostSrc)
      && hostSrc.includes(`harness.handle('catalog.readImage'`));
  if (STATIC_ONLY) check('模式：--static（无 kanyu CLI，CLI 依赖断言整组跳过）', true,
    '布局=' + (IS_MAIN_LAYOUT ? '主仓 dsh/' : '组件仓根'));

  // ① 系统自省（CLI 依赖）
  if (!STATIC_ONLY) {
    const ping = await callRpc('ping');
    check('ping：七大能力 + 13 地理处理工具', ping.ok && ping.capabilities.length === 7 && ping.tools.length === 13,
      'kanyu=' + String(ping.kanyu).slice(0, 40));
    const intro = await callRpc('introspect');
    check('introspect：kanyu introspect --json 可达', intro.ok && /kanyu-core/.test(intro.stdout));
  }

  // ② GIS 数据目录读取（能力 2/4）
  const cat = await callRpc('catalog.list', { dir: CATALOG_DIR, depth: 3 });
  const exts = new Set((cat.items || []).map((i) => i.ext));
  check('catalog.list：扫描 ' + CATALOG_DIR + '/ 检出 geojson（GIS 扩展名矩阵过滤）', cat.ok && cat.count >= 1 && exts.has('geojson'),
    'count=' + cat.count + ' exts=' + [...exts].join(','));
  // 五分类（壳层 catalog.rs 范式，两种模式皆覆盖；2026-08-18 第十四轮）
  const catNames = (cat.categories || []).map((c) => c.name);
  check('catalog.list：五分类对齐壳层 catalog.rs（地图框/布局框/数据库/服务链接/本机数据 + kyu 入数据库类）',
    catNames.join(',') === '地图框,布局框,数据库,服务链接,本机数据'
      && (cat.dbItems || []).some((i) => i.ext === 'kyu')
      && (cat.dataItems || []).every((i) => i.ext !== 'kdb' && i.ext !== 'kyu'),
    'cats=' + catNames.join('/') + ' db=' + (cat.dbItems || []).length + ' data=' + (cat.dataItems || []).length);
  // 地图框/布局框组件语境对应物（2026-08-18 第二十轮）：渲染产物 + .kyu layouts 清单
  const catCounts = {};
  for (const c of cat.categories || []) catCounts[c.name] = c.count;
  check('catalog.list：布局框解析 .kyu layouts（demo.kyu 夹具「示例布局A4横」入列 + kyu 工程路径回传）',
    Array.isArray(cat.mapItems) && Array.isArray(cat.layoutItems)
      && (cat.layoutItems || []).some((l) => l.title === '示例布局A4横' && typeof l.kyu === 'string' && l.kyu.length > 0)
      && catCounts['布局框'] === (cat.layoutItems || []).length
      && catCounts['地图框'] === (cat.mapItems || []).length,
    'layouts=' + JSON.stringify(cat.layoutItems) + ' maps=' + (cat.mapItems || []).length);
  // 服务链接：WFS GetCapabilities 最小提取（离线 xml 路径，两种模式皆覆盖；2026-08-18 第十五轮）
  const capsXml = await fsp.readFile(path.join(REPO_ROOT, dshPath('examples', 'wfs_capabilities.xml')), 'utf8');
  const svc = await callRpc('services.discover', { xml: capsXml });
  check('services.discover：GetCapabilities 解析（命名空间剥离 + 实体反转义 + 缺 Name 块跳过）',
    svc.ok && svc.count === 2 && svc.layers[0].name === 'demo:buildings'
      && svc.layers[0].title === '示例建筑 & 设施' && svc.layers[1].name === 'demo:roads',
    'count=' + svc.count + ' names=' + (svc.layers || []).map((l) => l.name).join(','));
  // WFS GetFeature 拉取落图层（离线 data 路径，两种模式皆覆盖；2026-08-18 第十六轮）
  const wfsOut = path.join(TMP_DIR, 'wfs-fetch.geojson');
  const inlineFc = JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { name: 'A' }, geometry: { type: 'Point', coordinates: [114, 30] } },
    { type: 'Feature', properties: { name: 'B' }, geometry: { type: 'Point', coordinates: [114.1, 30.1] } },
  ] });
  const fetched = await callRpc('services.fetch', { layer: 'demo:buildings', data: inlineFc, output: wfsOut });
  let written = -1;
  try { written = JSON.parse(await fsp.readFile(wfsOut, 'utf8')).features.length; } catch { /* -1 */ }
  check('services.fetch：离线拉取落盘（FeatureCollection 校验 + 2 要素写出 + 图层名消毒入默认名）',
    fetched.ok && fetched.count === 2 && written === 2,
    'count=' + fetched.count + ' written=' + written);
  // kanyu_catalog 服务链接分支回执（2026-08-18 第三十四轮）：xml/data 离线直通 + 指引/接力提示
  const tCatSvc = tools.get('kanyu_catalog');
  const catDisc = tCatSvc && await tCatSvc.execute({ xml: capsXml });
  check('动态工具 kanyu_catalog(discover+xml)：图层清单 + 拉取用法指引',
    typeof catDisc === 'string' && /发现 2 个图层/.test(catDisc) && /demo:buildings/.test(catDisc)
      && /拉取图层：本工具 url \+ layer=<名称>/.test(catDisc),
    String(catDisc).slice(0, 120));
  const catFetchOut = path.join(TMP_DIR, 'kanyu-catalog-fetch.geojson');
  const catFetch = tCatSvc && await tCatSvc.execute({ layer: 'demo:buildings', data: inlineFc, output: catFetchOut });
  let catFetchWritten = -1;
  try { catFetchWritten = JSON.parse(await fsp.readFile(catFetchOut, 'utf8')).features.length; } catch { /* -1 */ }
  check('动态工具 kanyu_catalog(fetch+data)：计数回执 + 接力提示 + 落盘一致',
    typeof catFetch === 'string' && /已拉取 2 个要素 → /.test(catFetch)
      && /可继续作为 kanyu_data\/kanyu_render\/kanyu_edit 的 path 接力/.test(catFetch) && catFetchWritten === 2,
    String(catFetch).slice(0, 160) + ' written=' + catFetchWritten);
  // WMS 参数面（2026-08-18 第三十六轮）：bbox/宽高直通 + urlOnly 离线契约（两种模式皆覆盖，不触网）
  const catWms = tCatSvc && await tCatSvc.execute({ url: 'https://example.com/wms', layer: 'demo:dem', kind: 'wms',
    bbox: [116.39, 39.9, 116.41, 39.92], width: 800, height: 600, urlOnly: true });
  check('动态工具 kanyu_catalog(wms+urlOnly)：GetMap 地址构造（bbox 六位小数 + 宽高直通，不触网）',
    typeof catWms === 'string' && /仅构造未拉取/.test(catWms)
      && /bbox=116\.390000,39\.900000,116\.410000,39\.920000/.test(catWms)
      && /width=800&height=600/.test(catWms),
    String(catWms).slice(0, 200));
  // 顶点编辑数据源（原样几何不抽稀，两种模式皆覆盖；2026-08-18 第十九轮）
  const egeo = await callRpc('edit.geometry', { path: EXAMPLE, maxFeatures: 200 });
  const eg0 = egeo.ok && egeo.features && egeo.features[0] && egeo.features[0].geometry;
  check('edit.geometry：原样几何 + bbox（4 要素无抽稀，顶点下标与文件一致）',
    egeo.ok && egeo.count === 4 && egeo.total === 4 && Array.isArray(egeo.bbox) && egeo.bbox.length === 4
      && eg0 && Array.isArray(eg0.coordinates),
    'count=' + egeo.count + ' bbox=' + JSON.stringify(egeo.bbox));
  // WMS GetMap 地址构造（urlOnly 离线契约路径，两种模式皆覆盖；2026-08-18 第十七轮）
  const wms = await callRpc('services.wms', { url: 'https://example.com/wms?token=1', layer: 'demo:base', bbox: [113.5, 29.5, 114.5, 30.5], width: 800, height: 600, urlOnly: true });
  check('services.wms：buildGetmapUrl 契约（1.3.0 + EPSG:4326 + bbox 六位小数 + 基址补 &）',
    wms.ok && /service=WMS&request=GetMap&version=1\.3\.0&layers=demo:base&styles=&format=image\/png&transparent=false&crs=EPSG:4326&bbox=113\.500000,29\.500000,114\.500000,30\.500000&width=800&height=600$/.test(wms.source),
    wms.source || '无 source');
  if (!STATIC_ONLY) {
    const info = await callRpc('data.info', { path: EXAMPLE });
    check('data.info：buildings.geojson 4 要素', info.ok && /"feature_count":\s*4/.test(info.stdout));
    // 范围摘要（2026-08-18 第三十二轮）：内核 LayerSummary.extent 经 CLI --json 直通
    check('data.info：extent 范围摘要（[minx,miny,maxx,maxy] 数值四元组）',
      info.ok && /"extent":\s*\[\s*-?[\d.]+,\s*-?[\d.]+,\s*-?[\d.]+,\s*-?[\d.]+\s*\]/.test(info.stdout),
      (info.stdout.match(/"extent":[\s\S]{0,60}/) || ['无 extent'])[0].replace(/\s+/g, ' '));
    const query = await callRpc('data.query', { path: EXAMPLE, filter: 'height > 10' });
    let queryHits = -1;
    try { queryHits = JSON.parse(query.stdout.slice(query.stdout.search(/[{[]/))).features.length; } catch { /* 解析失败即 -1 */ }
    check('data.query：filter "height > 10" 有命中', query.ok && queryHits > 0, 'matched=' + queryHits);
    // 查询落盘联动依赖面（2026-08-18 第二十六轮）：output 写出 + stderr「已写出 N 个要素」计数契约
    const qOut = path.join(TMP_DIR, 'query-out.geojson');
    const queryWo = await callRpc('data.query', { path: EXAMPLE, filter: 'height > 10', output: qOut });
    let qWritten = -1;
    try { qWritten = JSON.parse(await fsp.readFile(qOut, 'utf8')).features.length; } catch { /* 解析失败即 -1 */ }
    check('data.query(output)：落盘 + stderr 计数契约（客户端 runQuery 依赖面，与 stdout 路径同计数）',
      queryWo.ok && /已写出 \d+ 个要素/.test(queryWo.stderr) && qWritten > 0 && qWritten === queryHits,
      'stderr=' + String(queryWo.stderr).slice(0, 60) + ' written=' + qWritten);
    const val = await callRpc('data.validate', { path: EXAMPLE });
    check('data.validate：执行不抛错（GeoJSON 非宗地 TXT，宽松断言）', typeof val.exitCode === 'number');
  }
  // 属性表预览（纯 fs 读面，两种模式皆覆盖；2026-08-18 第十三轮）
  const prev = await callRpc('data.preview', { path: EXAMPLE, limit: 50 });
  check('data.preview：字段并集 + 行矩阵（4/4 行，含 height 字段）',
    prev.ok && prev.total === 4 && prev.shown === 4 && prev.fields.includes('height')
      && Array.isArray(prev.rows) && prev.rows.length === 4 && prev.rows.every((r) => r.length === prev.fields.length),
    'fields=' + (prev.fields || []).join(','));
  const tData = tools.get('kanyu_data');
  const prevText = tData && await tData.execute({ action: 'preview', path: EXAMPLE });
  check('动态工具 kanyu_data(preview)：属性表文本（字段头 + 行）',
    typeof prevText === 'string' && /字段\(/.test(prevText) && /height/.test(prevText));
  // kanyu_data query 落盘分支（2026-08-18 第二十九轮，CLI 依赖）：模型侧确认文本 + 文件一致
  if (!STATIC_ONLY) {
    const kdOut = path.join(TMP_DIR, 'kanyu-data-query.geojson');
    const kdText = tData && await tData.execute({ action: 'query', path: EXAMPLE, filter: 'height > 10', output: kdOut });
    let kdWritten = -1;
    try { kdWritten = JSON.parse(await fsp.readFile(kdOut, 'utf8')).features.length; } catch { /* 解析失败即 -1 */ }
    check('动态工具 kanyu_data(query+output)：命中计数确认文本 + 落盘文件要素一致（非空串）',
      typeof kdText === 'string' && /查询完成：命中 \d+ 要素 → 已写出: /.test(kdText) && kdWritten > 0,
      String(kdText).slice(0, 100) + ' written=' + kdWritten);
    // kanyu_data calc 字段计算器（2026-08-18 第四十三轮，CLI 依赖）：attrcalc 内核经 kanyu data calc 出口
    const kcalcOut = path.join(TMP_DIR, 'kanyu-data-calc.geojson');
    const kcalcText = tData && await tData.execute({ action: 'calc', path: EXAMPLE, target: 'h2', expr: '[height] * 2', output: kcalcOut });
    let kcalcH2 = null;
    try { kcalcH2 = JSON.parse(await fsp.readFile(kcalcOut, 'utf8')).features[0].properties.h2; } catch { /* 解析失败即 null */ }
    check('动态工具 kanyu_data(calc+output)：确认回执 + 落盘字段值（h2 = 88.5×2 = 177）',
      typeof kcalcText === 'string' && /字段计算完成（h2）：4 要素 → 已写出: /.test(kcalcText) && kcalcH2 === 177,
      String(kcalcText).slice(0, 120) + ' h2=' + kcalcH2);
    const kcalcPrint = tData && await tData.execute({ action: 'calc', path: EXAMPLE, target: 'h2', expr: '[height] * 2' });
    check('动态工具 kanyu_data(calc 无 output)：stdout JSON 直通含计算字段',
      typeof kcalcPrint === 'string' && /"h2":\s*177/.test(kcalcPrint),
      String(kcalcPrint).slice(0, 80));
    const kcalcErr = tData && await tData.execute({ action: 'calc', path: EXAMPLE, target: 'h2', expr: '1 +' });
    check('动态工具 kanyu_data(calc 错误表达式)：失败回执非空（解析错误带中文提示）',
      typeof kcalcErr === 'string' && /失败/.test(kcalcErr),
      String(kcalcErr).slice(0, 120));
    // data.calc RPC（2026-08-18 第四十四轮）：工作台 ƒx 区依赖面——stdout GeoJSON 直通
    const dcalc = await callRpc('data.calc', { path: EXAMPLE, target: 'h2', expr: '[height] * 2' });
    check('data.calc RPC：calc 直通（stdout 含 "h2":177，工作台预览/应用同源）',
      dcalc.ok && /"h2":\s*177/.test(dcalc.stdout),
      (dcalc.stdout || '').slice(0, 60));
    // kanyu_crs reproject 回执计数（2026-08-18 第三十轮，CLI 依赖）：模型侧对齐 runReproject 语义
    const tCrs = tools.get('kanyu_crs');
    const kcOut = path.join(TMP_DIR, 'kanyu-crs-reproject.geojson');
    const kcText = tCrs && await tCrs.execute({ action: 'reproject', path: EXAMPLE, from: 'EPSG:4326', to: 'EPSG:4490', output: kcOut });
    let kcWritten = -1;
    try { kcWritten = JSON.parse(await fsp.readFile(kcOut, 'utf8')).features.length; } catch { /* 解析失败即 -1 */ }
    check('动态工具 kanyu_crs(reproject+output)：计数回执（4326 → 4490，4 要素）+ 落盘文件一致',
      typeof kcText === 'string' && /投影变换完成：EPSG:4326 → EPSG:4490，4 要素 → 已写出: /.test(kcText) && kcWritten === 4,
      String(kcText).slice(0, 100) + ' written=' + kcWritten);
  }

  // ③ 地图面板（能力 1，CLI 依赖）
  if (!STATIC_ONLY) {
    const render = await callRpc('render.map', { path: EXAMPLE, theme: 'light', width: 480, height: 320 });
    check('render.map：PNG 出图 + base64 回传', render.run && render.run.ok && render.pngBase64 && render.pngBase64.length > 500,
      render.out ? 'out=' + path.basename(render.out) + ' b64=' + (render.pngBase64 || '').length : '无输出');
    // 属性驱动符号化直通（StyleRule graduated，对齐 kanyu render --style）
    const renderSym = await callRpc('render.map', {
      path: EXAMPLE, theme: 'light', width: 480, height: 320,
      style: { type: 'graduated', field: 'height', stops: [[10, '#D85C4A'], [20, '#E8A33D'], [40, '#2D6A5E']] },
    });
    check('render.map 符号化：graduated(height) 直通 --style 出图',
      renderSym.run && renderSym.run.ok && renderSym.pngBase64 && renderSym.pngBase64.length > 500,
      renderSym.run && !renderSym.run.ok ? String(renderSym.run.stderr).slice(0, 120) : 'ok');
    // 非法规则由内核中文校验报错（阈值非升序）
    const renderBad = await callRpc('render.map', {
      path: EXAMPLE, style: { type: 'graduated', field: 'height', stops: [[20, '#D85C4A'], [10, '#E8A33D']] },
    });
    check('render.map 符号化：非升序 stops 内核校验拒绝', renderBad.run && !renderBad.run.ok && /升序/.test(String(renderBad.run.stderr)),
      renderBad.run ? 'exit=' + renderBad.run.exitCode : '无 run');
    // LayerSymbology 编辑模型投影（2026-08-18 第五十二轮）：symbology 参数
    // 经 symToRule 投成 StyleRule 出图；回执 styleApplied 带投影结果
    const renderSym2 = await callRpc('render.map', {
      path: EXAMPLE, theme: 'light', width: 480, height: 320,
      symbology: { mode: 'graduated', field: 'height', breaks: [20, 40], ramp: 'Amber' },
    });
    const sa = renderSym2 && renderSym2.styleApplied;
    check('render.map symbology 投影：graduated(breaks+ramp) → StyleRule（F64_MIN 首档 + 色带取样 3 色）出图',
      renderSym2.run && renderSym2.run.ok && renderSym2.pngBase64 && sa && sa.type === 'graduated'
        && sa.stops && sa.stops.length === 3 && sa.stops[0][0] < -1e307 && /^#[0-9A-F]{6}$/.test(sa.stops[0][1]),
      sa ? JSON.stringify(sa).slice(0, 120) : '无 styleApplied');
    // 工程样式读写闭环（第五十二轮）：临时 .kyu → style.set 写入 → style.get 读回一致
    const kyuTmp = path.join(TMP_DIR, 'test-style.kyu');
    await fsp.writeFile(kyuTmp, JSON.stringify({ kanyu_project: 1, name: 't', crs: 'EPSG:4326',
      created: '2026-08-18T00:00:00Z', kanyu_version: '0.22.0',
      layers: [{ id: 'l1', source: 'b.geojson', visible: true }] }, null, 2));
    const symW = { mode: 'categorical', field: 'usage', colors: [['办公', [45, 106, 94]]], other: [136, 136, 136] };
    const setR = await callRpc('style.set', { kyu: kyuTmp, layerId: 'l1', style: symW });
    const getR = await callRpc('style.get', { kyu: kyuTmp, layerId: 'l1' });
    check('style.set/style.get 闭环：.kyu 图层样式写入读回一致（LayerSymbology 原样透传）',
      setR && setR.ok && getR && getR.ok && JSON.stringify(getR.style) === JSON.stringify(symW),
      'set=' + (setR && setR.ok) + ' get=' + JSON.stringify(getR && getR.style).slice(0, 100));
    const setBad = await callRpc('style.set', { kyu: kyuTmp, layerId: 'l1', style: { mode: 'bogus' } });
    check('style.set 非法 mode 拒绝（中文报错指引 LayerSymbology 三模式）',
      setBad && !setBad.ok && /single\/categorical\/graduated/.test(String(setBad.error)), String(setBad && setBad.error).slice(0, 60));
    // 工程图层清单（2026-08-18 第五十五轮）：style.list 全列 + source 相对
    // 工程目录解析为绝对路径 + styleMode 摘要（承接上文 style.set 写入态）
    const listR = await callRpc('style.list', { kyu: kyuTmp });
    const l1 = listR && listR.layers && listR.layers[0];
    check('style.list：图层清单（id + source 绝对化 + styleMode 承接 style.set 写入）',
      listR && listR.ok && l1 && l1.id === 'l1' && l1.styleMode === 'categorical'
        && path.isAbsolute(l1.source) && l1.style && l1.style.field === 'usage',
      l1 ? l1.id + ' ' + l1.source + ' ' + l1.styleMode : JSON.stringify(listR).slice(0, 100));
    // 布局排版分支（2026-08-18 第四十六轮）：kanyu_render(layout) 走 render layout CLI 出 SVG
    const tRender = tools.get('kanyu_render');
    const layOut = path.join(TMP_DIR, 'kanyu-layout.svg');
    const layText = tRender && await tRender.execute({ path: EXAMPLE, layout: true, title: '示例布局', out: layOut });
    let laySvg = '';
    try { laySvg = await fsp.readFile(layOut, 'utf8'); } catch { /* 读取失败即空串 */ }
    check('动态工具 kanyu_render(layout)：SVG 排版出图（标题/图例入画 + 落盘一致）',
      typeof layText === 'string' && /排版完成: /.test(layText)
        && laySvg.includes('<svg') && laySvg.includes('示例布局'),
      String(layText).slice(0, 100) + ' svg=' + laySvg.length);
    // 模型侧符号化同能力（2026-08-18 第五十三轮）：kanyu_render symbology
    // 编辑模型入参——地图分支投影出图 + layout 分支投影排版
    const symMapText = tRender && await tRender.execute({ path: EXAMPLE, symbology: { mode: 'single', color: [217, 162, 60] } });
    const symMapOut = symMapText && (/渲染完成: (.+?)（/.exec(symMapText) || [])[1];
    let symMapOk = false;
    try { symMapOk = !!symMapOut && (await fsp.stat(symMapOut)).size > 500; } catch { /* 缺文件即 false */ }
    check('动态工具 kanyu_render(symbology single)：编辑模型投影出图落盘',
      /渲染完成: /.test(String(symMapText)) && symMapOk, String(symMapText).slice(0, 100));
    const laySymOut = path.join(TMP_DIR, 'kanyu-layout-sym.svg');
    const laySymText = tRender && await tRender.execute({ path: EXAMPLE, layout: true, title: '符号化布局', out: laySymOut,
      symbology: { mode: 'graduated', field: 'height', breaks: [20, 40], ramp: 'Jade' } });
    let laySymSvg = '';
    try { laySymSvg = await fsp.readFile(laySymOut, 'utf8'); } catch { /* 读取失败即空串 */ }
    check('动态工具 kanyu_render(layout+symbology graduated)：投影排版 SVG 出图',
      /排版完成: /.test(String(laySymText)) && laySymSvg.includes('<svg') && laySymSvg.includes('符号化布局'),
      String(laySymText).slice(0, 100) + ' svg=' + laySymSvg.length);
    // render.layout RPC（2026-08-18 第四十八轮）：kyu 工程模式——布局规格取自
    // 工程清单（page/dpi/scalebar），数据取首个可见图层（source 相对工程目录解析）
    const layRpc = await callRpc('render.layout', { kyu: dshPath('examples', 'demo.kyu'), title: '示例布局A4横' });
    check('render.layout(kyu)：工程布局解析 + SVG 回传（标题入画 + 图层 source 相对工程目录命中）',
      layRpc.ok && layRpc.svg && layRpc.svg.includes('<svg') && layRpc.svg.includes('示例布局A4横')
        && layRpc.title === '示例布局A4横',
      layRpc.ok ? 'svg=' + (layRpc.svg || '').length : String(layRpc.error).slice(0, 120));
    // catalog.readImage（2026-08-18 第五十轮）：render.map 产物读盘 → base64 回传
    const rdImg = await callRpc('catalog.readImage', { path: render.out });
    check('catalog.readImage：render.map 产物 PNG 读盘 base64 回传',
      rdImg.ok && rdImg.png && rdImg.png.length > 500 && /\.png$/.test(rdImg.name || ''),
      rdImg.ok ? 'bytes=' + rdImg.bytes : String(rdImg.error).slice(0, 100));
  }

  // catalog.readImage 越界防护（第五十轮；不经 CLI，两种模式皆覆盖）：
  // 产物目录外或非 .png 一律拒绝
  const rdBad = await callRpc('catalog.readImage', { path: EXAMPLE });
  check('catalog.readImage 边界：非产物目录 .png 拒绝（geojson 数据文件被拒）',
    rdBad.ok === false && /仅限 dsh\/output 产物目录内/.test(String(rdBad.error)),
    String(rdBad.error).slice(0, 80));

  // ④ 坐标框架（能力 3）
  const presets = await callRpc('crs.presets');
  check('crs.presets：7 条常用坐标系', presets.ok && presets.presets.length === 7);
  // crs.search 双模式可测：CLI 有 crs 子命令走内核 EPSG 全库，否则本地预设兜底
  // （4547 两侧均命中），degraded 旗标仅标注来源不影响契约。
  const crsSearch = await callRpc('crs.search', { query: '4547', limit: 20 });
  check('crs.search：4547 检索命中 EPSG:4547',
    crsSearch.ok && crsSearch.results.some(c => c.code === 'EPSG:4547'),
    JSON.stringify(crsSearch).slice(0, 120));
  const crsCommon = await callRpc('crs.search', { query: '', limit: 20 });
  check('crs.search：空查询返回常用精选（含 EPSG:4326）',
    crsCommon.ok && crsCommon.results.length > 0 && crsCommon.results.some(c => c.code === 'EPSG:4326'));
  if (!STATIC_ONLY) {
    const reproj = await callRpc('crs.reproject', { path: EXAMPLE, from: 'EPSG:4326', to: 'EPSG:4490' });
    check('crs.reproject：4326→4490 执行成功', reproj.ok, reproj.stderr ? reproj.stderr.slice(0, 80) : '');
    // 投影变换落盘联动依赖面（2026-08-18 第二十七轮）：output 写出 + stderr 计数契约
    const rpOut = path.join(TMP_DIR, 'reproject-out.geojson');
    const reprojWo = await callRpc('crs.reproject', { path: EXAMPLE, from: 'EPSG:4326', to: 'EPSG:4490', output: rpOut });
    let rpWritten = -1;
    try { rpWritten = JSON.parse(await fsp.readFile(rpOut, 'utf8')).features.length; } catch { /* 解析失败即 -1 */ }
    check('crs.reproject(output)：落盘 + stderr 计数契约（客户端 runReproject 依赖面）',
      reprojWo.ok && /已写出 4 个要素/.test(reprojWo.stderr) && rpWritten === 4,
      'stderr=' + String(reprojWo.stderr).slice(0, 60) + ' written=' + rpWritten);
  }

  // ⑤ 地理处理（能力 5）
  const gpList = await callRpc('geoprocess.list');
  check('geoprocess.list：13 工具白名单', gpList.ok && gpList.tools.length === 13);
  if (!STATIC_ONLY) {
    const gpOut = path.join(TMP_DIR, 'buffer-out.geojson');
    const gp = await callRpc('geoprocess.run', { tool: 'buffer', input: EXAMPLE, output: gpOut, params: { distance: 0.001 } });
    let gpFeat = 0;
    try { gpFeat = JSON.parse(await fsp.readFile(gpOut, 'utf8')).features.length; } catch { /* 断言兜底 */ }
    check('geoprocess.run buffer：输出 4 要素', gp.ok && gpFeat === 4, 'features=' + gpFeat);
  }

  // ⑤b 工具箱注册表（能力 5b：tooldef 37 工具全库，经 kanyu tool CLI 出口）
  // 静态模式（CI 无 CLI）只断言降级报错形状；全量模式实测内核注册表。
  if (!STATIC_ONLY) {
    const tbList = await callRpc('toolbox.list');
    check('toolbox.list：37 工具注册表（含 buffer/zonal_stats）',
      tbList.ok && tbList.tools.length === 37
        && tbList.tools.some(t => t.id === 'buffer') && tbList.tools.some(t => t.id === 'zonal_stats'),
      tbList.ok ? 'tools=' + tbList.tools.length : tbList.error);
    const tbOut = path.join(TMP_DIR, 'tool-buffer.geojson');
    const tbRun = await callRpc('toolbox.run', {
      id: 'buffer', output: tbOut,
      params: { layer: EXAMPLE, distance: '0.001|度' },
    });
    let tbFeat = 0;
    try { tbFeat = JSON.parse(await fsp.readFile(tbOut, 'utf8')).features.length; } catch { /* 断言兜底 */ }
    check('toolbox.run buffer：注册表路径输出 4 要素', tbRun.ok && tbFeat === 4,
      'exit=' + tbRun.exitCode + ' features=' + tbFeat + ' ' + String(tbRun.stderr).slice(0, 120));
    // 产图层工具联动依赖面（2026-08-18 第二十八轮）：stderr 写出清单契约
    check('toolbox.run buffer：stderr「已写出 N 个要素 → path」契约（客户端 tbRun 联动依赖面）',
      /已写出 4 个要素 → .+tool-buffer\.geojson/.test(String(tbRun.stderr)),
      String(tbRun.stderr).slice(0, 100));
    const tbReport = await callRpc('toolbox.run', { id: 'stats', params: { layer: EXAMPLE } });
    check('toolbox.run stats：报告类工具 JSON 包装（feature_count=4）',
      tbReport.ok && /"tool"\s*:\s*"stats"/.test(tbReport.stdout) && /feature_count\\?"?\s*:\s*\\?4/.test(tbReport.stdout),
      String(tbReport.stdout).slice(0, 160));
  } else {
    // 静态模式双态：CI 无 CLI → 降级中文指引；本机有 CLI → 真实注册表命中
    const tbList = await callRpc('toolbox.list');
    check('toolbox.list 静态双态：无 CLI 降级指引 / 有 CLI 真实注册表',
      tbList.ok === false
        ? /tool 子命令/.test(String(tbList.error))
        : tbList.tools.length === 37 && tbList.tools.some(t => t.id === 'buffer'),
      String(tbList.ok ? 'tools=' + tbList.tools.length : tbList.error).slice(0, 120));
  }

  // ⑥ 地理编辑（能力 6）
  const ops = await callRpc('edit.ops');
  check('edit.ops：9 算子（+attributes-replace）', ops.ok && ops.ops.length === 9 && ops.ops.includes('hole-add') && ops.ops.includes('attributes-replace'));
  const cnt = await callRpc('edit.apply', { path: EXAMPLE, op: 'feature-count' });
  check('edit.apply feature-count = 4', cnt.ok && cnt.count === 4);
  const edited = await callRpc('edit.apply', { path: EXAMPLE, op: 'attribute-set', args: { field: 'dsh_test', value: 1 } });
  const editedExists = edited.ok && existsSync(edited.output);
  check('edit.apply attribute-set：写 .edited.geojson', edited.ok && editedExists, edited.summary || edited.error);
  if (editedExists) await fsp.unlink(edited.output); // 清理临时产物

  // ⑥+ 编辑历史（对齐 kanyu-edit 命令逆操作双栈）：apply → undo → redo 闭环
  const udSrc = path.join(TMP_DIR, 'undo-test.geojson');
  await fsp.copyFile(path.join(REPO_ROOT, EXAMPLE), udSrc);
  const udRel = path.relative(REPO_ROOT, udSrc);
  const a1 = await callRpc('edit.apply', { path: udRel, op: 'attribute-set', args: { field: 'dsh_ud', value: 7 } });
  check('edit.apply 入 undo 栈（undo:1/redo:0）', a1.ok && a1.history && a1.history.undo === 1 && a1.history.redo === 0,
    JSON.stringify(a1.history));
  const u1 = await callRpc('edit.undo', { path: udRel });
  let fieldGone = false;
  try { fieldGone = JSON.parse(await fsp.readFile(u1.output, 'utf8')).features.every((f) => !(f.properties && 'dsh_ud' in f.properties)); } catch { /* 断言兜底 */ }
  check('edit.undo：逆操作回写（字段已移除，undo:0/redo:1）', u1.ok && fieldGone && u1.history.undo === 0 && u1.history.redo === 1,
    u1.summary || u1.error);
  const r1 = await callRpc('edit.redo', { path: udRel });
  let fieldBack = false;
  try { fieldBack = JSON.parse(await fsp.readFile(r1.output, 'utf8')).features.every((f) => f.properties && f.properties.dsh_ud === 7); } catch { /* 断言兜底 */ }
  check('edit.redo：正向重放（字段恢复，undo:1/redo:0）', r1.ok && fieldBack && r1.history.undo === 1 && r1.history.redo === 0,
    r1.summary || r1.error);
  const u2 = await callRpc('edit.undo', { path: udRel });
  const a2 = await callRpc('edit.apply', { path: udRel, op: 'feature-delete', args: { index: 0 } });
  check('新变更清空 redo 栈（kanyu-edit push 语义）', u2.ok && a2.ok && a2.history.redo === 0 && a2.history.undo === 1,
    JSON.stringify(a2.history));
  const h1 = await callRpc('edit.history', { path: udRel });
  check('edit.history：栈深与栈顶标签', h1.ok && h1.undo === 1 && h1.redo === 0 && /删除要素/.test(h1.undoTop),
    'undoTop=' + h1.undoTop);

  // ⑥++ kanyu_edit 撤销栈回执（2026-08-18 第三十三轮）：动态工具文本附 undo/redo 栈深
  const erSrc = path.join(TMP_DIR, 'edit-receipt-test.geojson');
  await fsp.copyFile(path.join(REPO_ROOT, EXAMPLE), erSrc);
  const erRel = path.relative(REPO_ROOT, erSrc);
  const tEdit = tools.get('kanyu_edit');
  const erText = tEdit && await tEdit.execute({ path: erRel, op: 'attribute-set', args: { index: 0, field: 'height', value: 99 } });
  check('动态工具 kanyu_edit：回执含「撤销栈 1 步 / 重做栈 0 步」（模型侧可提示回滚）',
    typeof erText === 'string' && /撤销栈 1 步 \/ 重做栈 0 步/.test(erText),
    String(erText).slice(0, 160));
  const erOut = erSrc.replace(/\.geojson$/, '.edited.geojson');
  if (existsSync(erOut)) await fsp.unlink(erOut); // 清理临时产物

  // ⑥+++ 编辑算子补齐（2026-08-18 第五十六轮）：feature-move 平移闭环 + ringPath 缺省分派 + Z/M 保留
  const mvSrc = path.join(TMP_DIR, 'feature-move-test.geojson');
  await fsp.copyFile(path.join(REPO_ROOT, EXAMPLE), mvSrc);
  const mvRel = path.relative(REPO_ROOT, mvSrc);
  const mvBefore = JSON.parse(await fsp.readFile(mvSrc, 'utf8')).features[0].geometry.coordinates[0];
  const mv1 = await callRpc('edit.apply', { path: mvRel, op: 'feature-move', args: { index: 0, dx: 1000, dy: 2000 } });
  let mvOk = false;
  try { mvOk = JSON.parse(await fsp.readFile(mv1.output, 'utf8')).features[0].geometry.coordinates[0] === mvBefore + 1000; } catch { /* 断言兜底 */ }
  check('edit.apply feature-move：整要素平移（Point x+1000 生效）', mv1.ok && mvOk, mv1.summary || mv1.error);
  const mvUndo = await callRpc('edit.undo', { path: mvRel });
  let mvBack = false;
  try { mvBack = Math.abs(JSON.parse(await fsp.readFile(mvUndo.output, 'utf8')).features[0].geometry.coordinates[0] - mvBefore) < 1e-9; } catch { /* 断言兜底 */ }
  check('feature-move undo：负量逆操作回原位（浮点容差 1e-9）', mvUndo.ok && mvBack, mvUndo.summary || mvUndo.error);
  const lsSrc = path.join(TMP_DIR, 'vm-line-test.geojson');
  await fsp.writeFile(lsSrc, JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4], [5, 6]] }, properties: {} },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [9, 8, 7] }, properties: {} },
  ] }));
  const lsRel = path.relative(REPO_ROOT, lsSrc);
  const vLine = await callRpc('edit.apply', { path: lsRel, op: 'vertex-move', args: { feature: 0, vertex: 1, x: 30, y: 40 } });
  let lineOk = false;
  try { lineOk = JSON.parse(await fsp.readFile(vLine.output, 'utf8')).features[0].geometry.coordinates[1].join(',') === '30,40'; } catch { /* 断言兜底 */ }
  check('vertex-move LineString 缺省 ringPath：不再错误下钻（修复实测）', vLine.ok && lineOk, vLine.summary || vLine.error);
  const vPt = await callRpc('edit.apply', { path: lsRel, op: 'vertex-move', args: { feature: 1, x: 90, y: 80 } });
  let ptOk = false;
  try { ptOk = JSON.parse(await fsp.readFile(vPt.output, 'utf8')).features[1].geometry.coordinates.join(',') === '90,80,7'; } catch { /* 断言兜底 */ }
  check('vertex-move Point 特判 + Z 保留（[9,8,7]→[90,80,7]）', vPt.ok && ptOk, vPt.summary || vPt.error);

  // ⑥++++ 挖洞算子（2026-08-18 第五十七轮）：hole-add 对齐 kanyu-edit AddHole 校验语义（ops.rs:383）
  const holeSrc = path.join(TMP_DIR, 'hole-test.geojson');
  await fsp.writeFile(holeSrc, JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }, properties: {} },
  ] }));
  const holeRel = path.relative(REPO_ROOT, holeSrc);
  const hAdd = await callRpc('edit.apply', { path: holeRel, op: 'hole-add', args: { index: 0, ring: [[2, 2], [4, 2], [4, 4], [2, 4]] } });
  let holeOk = false;
  try { holeOk = JSON.parse(await fsp.readFile(hAdd.output, 'utf8')).features[0].geometry.coordinates.length === 2; } catch { /* 断言兜底 */ }
  check('edit.apply hole-add：未闭合自动闭合 + 追加内环（1→2 环）', hAdd.ok && holeOk, hAdd.summary || hAdd.error);
  const hBad = await callRpc('edit.apply', { path: holeRel, op: 'hole-add', args: { index: 0, ring: [[20, 20], [22, 20], [22, 22], [20, 22], [20, 20]] } });
  check('hole-add 校验：洞环越出外环中文报错（不改动集合）', !hBad.ok && /完全位于面内/.test(hBad.error || ''), hBad.error || '');
  const hUndo = await callRpc('edit.undo', { path: holeRel });
  let holeBack = false;
  try { holeBack = JSON.parse(await fsp.readFile(hUndo.output, 'utf8')).features[0].geometry.coordinates.length === 1; } catch { /* 断言兜底 */ }
  check('hole-add undo：hole-remove 弹出末环（2→1 环，AddHole::revert 语义）', hUndo.ok && holeBack, hUndo.summary || hUndo.error);

  // ⑥+++++ 整行属性替换（2026-08-18 第五十八轮）：attributes-replace 对齐 kanyu-edit UpdateProperties（ops.rs:281）
  const arSrc = path.join(TMP_DIR, 'attr-replace-test.geojson');
  await fsp.copyFile(path.join(REPO_ROOT, EXAMPLE), arSrc);
  const arRel = path.relative(REPO_ROOT, arSrc);
  const ar1 = await callRpc('edit.apply', { path: arRel, op: 'attributes-replace', args: { index: 0, properties: { name: '改' } } });
  let arOk = false;
  try {
    const p0 = JSON.parse(await fsp.readFile(ar1.output, 'utf8')).features[0].properties;
    arOk = Object.keys(p0).length === 1 && p0.name === '改';
  } catch { /* 断言兜底 */ }
  check('edit.apply attributes-replace：整行覆写（3 字段→1 字段）', ar1.ok && arOk, ar1.summary || ar1.error);
  const arUndo = await callRpc('edit.undo', { path: arRel });
  let arBack = false;
  try {
    const p0 = JSON.parse(await fsp.readFile(arUndo.output, 'utf8')).features[0].properties;
    arBack = p0.name === '示例大厦A' && p0.height === 88.5; // 自逆操作恢复旧属性
  } catch { /* 断言兜底 */ }
  check('attributes-replace undo：自逆操作恢复旧属性行', arUndo.ok && arBack, arUndo.summary || arUndo.error);

  // ⑦ 3D 地理（能力 7）
  const s3d = await callRpc('scene3d.data', { path: EXAMPLE, heightField: 'height' });
  check('scene3d.data：bbox + 高度提取', s3d.ok && Array.isArray(s3d.bbox) && s3d.count >= 3,
    `count=${s3d.count}/${s3d.total}`);
  // 分类着色（2026-08-18 第二十五轮）：colorField 逐要素带 cat + categories 去重清单
  const s3dCat = await callRpc('scene3d.data', { path: EXAMPLE, heightField: 'height', colorField: 'usage' });
  check('scene3d.data 分类着色：usage 两类（office/residential）+ 逐要素 cat',
    s3dCat.ok && s3dCat.colorField === 'usage'
      && s3dCat.categories.includes('office') && s3dCat.categories.includes('residential')
      && s3dCat.features.filter(f => f.cat).length >= 3,
    JSON.stringify(s3dCat.categories));
  const s3dNoCat = await callRpc('scene3d.data', { path: EXAMPLE, heightField: 'height' });
  check('scene3d.data 无 colorField：categories 为 null（契约不漂移）',
    s3dNoCat.ok && s3dNoCat.categories === null && s3dNoCat.colorField === null);
  // 高度范围摘要（2026-08-18 第三十七轮）：heightRange 增量字段（缺字段归一 10 后累积）
  check('scene3d.data 高度范围：heightRange [10,120]（缺 height 字段要素归一 10）',
    s3dNoCat.ok && JSON.stringify(s3dNoCat.heightRange) === '[10,120]',
    'heightRange=' + JSON.stringify(s3dNoCat.heightRange));
  // 符号化编辑模型着色（2026-08-18 第五十四轮）：symbology 逐要素取色
  const s3dSym1 = await callRpc('scene3d.data', { path: EXAMPLE, heightField: 'height', symbology: { mode: 'single', color: [217, 162, 60] } });
  check('scene3d.data symbology single：全要素同色 #D9A23C + symbologyMode 回执',
    s3dSym1.ok && s3dSym1.symbologyMode === 'single' && s3dSym1.features.length >= 3
      && s3dSym1.features.every(f => f.color === '#D9A23C'),
    'mode=' + s3dSym1.symbologyMode + ' c0=' + (s3dSym1.features[0] || {}).color);
  const s3dSym2 = await callRpc('scene3d.data', { path: EXAMPLE, heightField: 'height',
    symbology: { mode: 'categorical', field: 'usage', colors: [['office', [45, 106, 94]]], other: [136, 136, 136] } });
  check('scene3d.data symbology categorical：接管 colorField + catColors 映射（命中色/回退色）',
    s3dSym2.ok && s3dSym2.colorField === 'usage' && s3dSym2.catColors
      && s3dSym2.catColors.office === '#2D6A5E' && s3dSym2.catColors.residential === '#888888'
      && s3dSym2.features.some(f => f.color === '#2D6A5E') && s3dSym2.features.some(f => f.color === '#888888'),
    JSON.stringify(s3dSym2.catColors));
  const s3dSym3 = await callRpc('scene3d.data', { path: EXAMPLE, heightField: 'height',
    symbology: { mode: 'graduated', field: 'height', breaks: [20, 40], ramp: 'Jade' } });
  // Jade sample(3) = colors[0]/[2]/[4] = #E8F4F0 / #7FBFB2 / #2D6A5E；height∈[10,120]
  const jadeSet = ['#E8F4F0', '#7FBFB2', '#2D6A5E'];
  check('scene3d.data symbology graduated：breaks+ramp 逐要素取色（色带取样色域内，缺字段要素不着色）',
    s3dSym3.ok && s3dSym3.symbologyMode === 'graduated'
      && s3dSym3.features.filter(f => f.color).every(f => jadeSet.includes(f.color))
      && s3dSym3.features.filter(f => f.color === '#2D6A5E').length >= 1
      && s3dSym3.features.filter(f => f.color === '#7FBFB2').length >= 1
      && s3dSym3.features.some(f => !f.color),
    JSON.stringify([...new Set(s3dSym3.features.map(f => f.color))]));
  const tS3d = tools.get('kanyu_scene3d');
  const s3dText = tS3d && await tS3d.execute({ path: EXAMPLE, heightField: 'height' });
  check('动态工具 kanyu_scene3d：回执含高度范围 + 工作台 3D 页签接力指引',
    typeof s3dText === 'string' && /高度范围 10~120/.test(s3dText) && /工作台 3D 页签/.test(s3dText),
    String(s3dText).slice(0, 200));

  // ⑧ 动态工具抽查（Harness function-calling 面，CLI 依赖）
  if (!STATIC_ONLY) {
    const tGp = tools.get('kanyu_geoprocess');
    const gpText = tGp && await tGp.execute({ tool: 'stats', input: EXAMPLE });
    check('动态工具 kanyu_geoprocess(stats)：返回统计文本', typeof gpText === 'string' && /完成/.test(gpText));
    // 注册表全库分支（2026-08-18 第二十四轮）：白名单外 id 走 toolbox.run，
    // input 便捷映射 layer；mean_coordinates 为 tooldef 注册表独产工具。
    const meanOut = path.join(TMP_DIR, 'mean-coords.geojson');
    const gpReg = tGp && await tGp.execute({ tool: 'mean_coordinates', input: EXAMPLE, output: meanOut });
    let meanFeat = 0;
    try { meanFeat = JSON.parse(await fsp.readFile(meanOut, 'utf8')).features.length; } catch { /* 断言兜底 */ }
    check('动态工具 kanyu_geoprocess(mean_coordinates)：注册表分支输出 1 要素',
      typeof gpReg === 'string' && /注册表全库/.test(gpReg) && meanFeat === 1,
      String(gpReg).slice(0, 120) + ' features=' + meanFeat);
    // 产出回执（2026-08-18 第三十一轮）：注册表分支回执附 stderr 写出清单
    check('动态工具 kanyu_geoprocess(mean_coordinates+output)：注册表分支产出回执（1 要素 → path）',
      typeof gpReg === 'string' && /产出: 1 要素 → .+mean-coords\.geojson/.test(gpReg),
      String(gpReg).slice(0, 160));
    // 白名单分支同款回执（buffer 精选面，显式 output 避免落工作区根）
    const gpBufOut = path.join(TMP_DIR, 'gp-buffer-out.geojson');
    const gpBuf = tGp && await tGp.execute({ tool: 'buffer', input: EXAMPLE, output: gpBufOut, params: { distance: 0.001 } });
    let gpBufFeat = 0;
    try { gpBufFeat = JSON.parse(await fsp.readFile(gpBufOut, 'utf8')).features.length; } catch { /* 断言兜底 */ }
    check('动态工具 kanyu_geoprocess(buffer)：白名单分支产出回执（4 要素 → path）+ 落盘一致',
      typeof gpBuf === 'string' && /工具 buffer 完成/.test(gpBuf) && /产出: 4 要素 → .+gp-buffer-out\.geojson/.test(gpBuf) && gpBufFeat === 4,
      String(gpBuf).slice(0, 160) + ' features=' + gpBufFeat);
    const gpBad = tGp && await tGp.execute({ tool: 'nonexistent_tool', input: EXAMPLE });
    check('动态工具 kanyu_geoprocess(未知 id)：注册表中文报错不静默',
      typeof gpBad === 'string' && /未知工具/.test(gpBad), String(gpBad).slice(0, 120));
    const tCat = tools.get('kanyu_catalog');
    const catText = tCat && await tCat.execute({ dir: dshPath('examples'), depth: 1 });
    check('动态工具 kanyu_catalog：目录清单文本', typeof catText === 'string' && /GEOJSON/.test(catText));
  }

  // ---------- Client 半静态校验 ----------
  const clientSrc = await fsp.readFile(path.join(REPO_ROOT, dshPath('plugin', 'client.js')), 'utf8');
  let clientParses = true;
  try { new vm.Script(`(function(){${clientSrc}\n})()`, { filename: 'client.js' }); } catch (e) { clientParses = false; }
  check('client.js 语法解析', clientParses);
  const slotsOk = ['conversation.session.header.actions', 'shell.overlay', 'tool.view.cordis']
    .every((s) => clientSrc.includes(s));
  check('client.js 三处 slot 注册', slotsOk);
  const tabsOk = ['catalog', 'data', 'map', 'crs', 'gp', 'edit', 'scene3d', 'about']
    .every((t) => clientSrc.includes(`id: '${t}'`));
  check('client.js 七能力页签 + 关于', tabsOk);
  // 3D 管线对齐内核 scene3d.rs 软件管线（2026-08-18 第十轮）：
  // yaw/pitch 视角态、faceVisible 背面剔除、高度归一化 H×0.25、拖拽旋转交互
  const s3dKeys = ['yaw', 'pitch', 'faceVisible', 'H * 0.25', 'onMouseDown', 'catColor', 'colorField', 'categories'];
  check('client.js 3D 管线对齐内核 scene3d.rs（yaw/pitch/背面剔除/高度归一化 0.25/拖拽旋转）',
    s3dKeys.every((k) => clientSrc.includes(k)),
    s3dKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 3D 页签符号化行（2026-08-18 第五十四轮）：buildSymbology 复用 +
  // 模型色 f.color / catColors 图例优先 + symbologyMode HUD
  const s3dSymKeys = ['catColors', 'f.color', 'symbologyMode', '符号化'];
  check('client.js 3D 页签符号化行（模型色 f.color + catColors 图例优先）',
    s3dSymKeys.every((k) => clientSrc.includes(k)),
    s3dSymKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 地图面板符号化（2026-08-18 第十二轮起步 / 第五十二轮升级为 LayerSymbology
  // 编辑模型）：buildSymbology 构建 single/categorical/graduated + symToForm 回填
  const symKeys = ['buildSymbology', 'symToForm', 'single', 'graduated', 'categorical', '符号化'];
  check('client.js 地图页签符号化控件（buildSymbology + single/graduated/categorical）',
    symKeys.every((k) => clientSrc.includes(k)),
    symKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 工程样式读写区（第五十二轮）：style.get/style.set + 读取样式/写入工程按钮
  const symKyuKeys = ['style.get', 'style.set', '读取样式', '写入工程'];
  check('client.js 地图页签工程样式读写区（style.get/style.set + 读取/写入按钮）',
    symKyuKeys.every((k) => clientSrc.includes(k)),
    symKyuKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 目录 .kyu 图层接力（2026-08-18 第五十五轮）：style.list 展开 + pickKyuLayer
  // 设当前图层 + symPrimaryColor 色块 + store.sym 接力地图页签 symRef 回填
  const kyuLinkKeys = ['style.list', 'pickKyuLayer', 'symPrimaryColor', 'symRef', 'store.sym'];
  check('client.js 目录 .kyu 图层接力地图页签（style.list + pickKyuLayer + symRef 回填）',
    kyuLinkKeys.every((k) => clientSrc.includes(k)),
    kyuLinkKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 目录页签五分类（2026-08-18 第十四/二十轮）：分类头 + 数据库/本机数据/地图框/布局框分离
  const catKeys = ['kyg-cat-head', 'dataItems', 'dbItems', 'mapItems', 'layoutItems', '本机数据'];
  check('client.js 目录页签五分类区（kyg-cat-head + dataItems/dbItems）',
    catKeys.every((k) => clientSrc.includes(k)),
    catKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 目录页签 freshness 自动重扫（2026-08-18 第三十九轮）：清单外新当前图层触发 scan
  const freshKeys = ['freshness 自动重扫', 'knownRef'];
  check('client.js 目录页签 freshness 自动重扫（清单外新图层触发 + knownRef 防重复）',
    freshKeys.every((k) => clientSrc.includes(k)),
    freshKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 服务链接发现/拉取/底图（2026-08-18 第十五/十六/十七轮）：discover + fetch + wms 预览
  const svcKeys = ['services.discover', 'services.fetch', 'services.wms', '发现图层', '拉取', '预览底图'];
  check('client.js 目录页签服务链接发现/拉取表单（discover + fetch + 拉取按钮）',
    svcKeys.every((k) => clientSrc.includes(k)),
    svcKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 编辑页签属性单元格编辑（2026-08-18 第十八轮）：data.preview 行选 + attribute-set
  const editAttrKeys = ['加载属性表', 'applyAttr', '写入单元格'];
  check('client.js 编辑页签属性单元格编辑区（加载属性表 + applyAttr + 写入单元格）',
    editAttrKeys.every((k) => clientSrc.includes(k)),
    editAttrKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 编辑页签顶点编辑画布（2026-08-18 第十九轮）：edit.geometry + enumVertices + 拖拽写 vertex-move
  const editVertKeys = ['edit.geometry', 'enumVertices', 'drawEdit2d', '顶点编辑'];
  check('client.js 编辑页签顶点编辑画布（edit.geometry + enumVertices + drawEdit2d）',
    editVertKeys.every((k) => clientSrc.includes(k)),
    editVertKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 编辑页签字段计算器 ƒx 区（2026-08-18 第四十四轮）：data.calc + 前 5 行预览 + 应用落盘联动
  const editCalcKeys = ['calcPreview', 'calcApply', '预览前 5 行', 'data.calc', '字段计算完成（'];
  check('client.js 编辑页签字段计算器区（calcPreview/calcApply + 前 5 行预览 + 应用确认回执）',
    editCalcKeys.every((k) => clientSrc.includes(k)),
    editCalcKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 处理页签工具箱全库表单（2026-08-18 第二十三轮）：ToolboxPanel + toolbox.list/toolbox.run + 分类分组
  const tbKeys = ['ToolboxPanel', 'toolbox.list', 'toolbox.run', 'TB_CAT_CN'];
  check('client.js 处理页签工具箱全库表单（ToolboxPanel + toolbox.list/run + 分类分组）',
    tbKeys.every((k) => clientSrc.includes(k)),
    tbKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 数据页签查询联动（2026-08-18 第二十六轮）：runQuery 落盘 + 命中计数 + 设为当前图层
  const qryKeys = ['runQuery', 'kanyu-query-', '已写出 ', '已设为当前图层'];
  check('client.js 数据页签查询联动（runQuery + 落盘 dsh/output + 命中 N/M + 设为当前图层）',
    qryKeys.every((k) => clientSrc.includes(k)),
    qryKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 查询结果联动属性表（2026-08-18 第三十八轮）：命中即览（自动 data.preview 结果集）
  const qryTblKeys = ['查询结果联动属性表', 'pv2'];
  check('client.js 数据页签查询结果联动属性表（runQuery 命中即览）',
    qryTblKeys.every((k) => clientSrc.includes(k)),
    qryTblKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 坐标页签投影变换联动（2026-08-18 第二十七轮）：runReproject 落盘 + 计数 + 设为当前图层
  const crsKeys = ['runReproject', 'kanyu-reproject-', 'crs.search', '已设为当前图层'];
  check('client.js 坐标页签投影变换联动（runReproject + 落盘 dsh/output + 设为当前图层）',
    crsKeys.every((k) => clientSrc.includes(k)),
    crsKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 处理页签产图层工具联动（2026-08-18 第二十八轮）：tbRun 缺省落盘 + stderr 清单 + 首产出设当前图层
  const tbLinkKeys = ['producesLayer', 'kanyu-tool-', 'split_by_field', '已设为当前图层'];
  check('client.js 处理页签产图层工具联动（tbRun 缺省落盘 + stderr 写出清单 + 设为当前图层）',
    tbLinkKeys.every((k) => clientSrc.includes(k)),
    tbLinkKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 编辑页签联动刷新（2026-08-18 第三十五轮）：apply2/undoRedo 成功后属性表作废 + 几何重载 + 路径广播
  const editRefKeys = ['联动刷新', 'nextPath', 'setAttrs(null)'];
  check('client.js 编辑页签联动刷新（apply2/undoRedo 后属性表作废 + 顶点画布重载 + 广播）',
    editRefKeys.every((k) => clientSrc.includes(k)) && clientSrc.split('联动刷新').length >= 3,
    editRefKeys.filter((k) => !clientSrc.includes(k)).join(',') || '两处命中');
  // 地图页签联动重渲染（2026-08-18 第四十轮）：store.rev 内容版本号 + 已渲染过自动跟随
  const mapAutoKeys = ['store.rev', '联动重渲染', 'autoRef'];
  check('client.js 地图页签联动重渲染（store.rev 版本号 + autoRef 跟随重渲 + 编辑四处递增）',
    mapAutoKeys.every((k) => clientSrc.includes(k)) && clientSrc.split('store.rev++').length >= 5,
    mapAutoKeys.filter((k) => !clientSrc.includes(k)).join(',') || '命中');
  // 3D 页签联动重载（2026-08-18 第四十一轮）：rev 跟随自动重载场景（TabMap 同范式）
  const s3dAutoKeys = ['联动重载', 'auto3dRef'];
  check('client.js 3D 页签联动重载（store.rev 跟随 + auto3dRef 自动重载场景）',
    s3dAutoKeys.every((k) => clientSrc.includes(k)),
    s3dAutoKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 目录布局框点击预览（2026-08-18 第四十八轮）：render.layout + SVG 内嵌 + 关闭按钮
  const layPvKeys = ['previewLayout', 'render.layout', 'kyg-layout-preview', '关闭布局预览'];
  check('client.js 目录布局框点击排版预览（previewLayout + render.layout + SVG 内嵌 + 关闭按钮）',
    layPvKeys.every((k) => clientSrc.includes(k)),
    layPvKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 目录地图框点击预览（2026-08-18 第五十轮）：catalog.readImage + PNG 内嵌 + 关闭按钮
  const mapPvKeys = ['previewMapImage', 'catalog.readImage', '关闭产物预览'];
  check('client.js 目录地图框点击产物预览（previewMapImage + catalog.readImage + PNG 内嵌）',
    mapPvKeys.every((k) => clientSrc.includes(k)),
    mapPvKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');

  // ---------- pkg 静态双面包契约（dsh.client 常驻形态，2026-08-18 第五轮新增） ----------
  const pkgJson = JSON.parse(await fsp.readFile(path.join(REPO_ROOT, dshPath('pkg', 'package.json')), 'utf8'));
  check('pkg/package.json：exports 三键（./client + ./package.json 防封装拦截）',
    pkgJson.exports && pkgJson.exports['.'] === './index.js'
      && pkgJson.exports['./client'] === './client.js'
      && pkgJson.exports['./package.json'] === './package.json');
  check('pkg/package.json：dsh.client 声明 web 平台',
    pkgJson.dsh && pkgJson.dsh.client && pkgJson.dsh.client.platform === 'web');

  const pkgClientSrc = await fsp.readFile(path.join(REPO_ROOT, dshPath('pkg', 'client.js')), 'utf8');
  let pkgClientParses = true;
  try { new vm.Script(pkgClientSrc, { filename: 'pkg/client.js' }); } catch (e) { pkgClientParses = false; }
  check('pkg/client.js 语法解析（classic script 形态）', pkgClientParses);
  check('pkg/client.js 工厂 id == 包名（__ModuleLoader__ 校验契约）',
    pkgClientSrc.includes(`id: '${pkgJson.name}'`), 'id 应等于 ' + pkgJson.name);
  check('pkg/client.js inject 三服务（slots/sessions/remote）',
    ['slots', 'sessions', 'remote'].every((s) => pkgClientSrc.includes(`'${s}'`)));
  const pkgSlotsOk = ['conversation.session.header.actions', 'shell.overlay']
    .every((s) => pkgClientSrc.includes(s)) && !pkgClientSrc.includes(`name: 'tool.view.cordis'`);
  check('pkg/client.js 两处 slot 注册且无 tool.view.cordis（动态包专利）', pkgSlotsOk);
  check('pkg/client.js preset 门控（agentPreset 快照 + kanyu-gis 字面量）',
    pkgClientSrc.includes('agentPreset') && pkgClientSrc.includes(`'kanyu-gis'`));
  const dialectClean = !pkgClientSrc.includes('host.call(') && !pkgClientSrc.includes('styles.insert(');
  check('pkg/client.js 无动态沙箱符号调用（host.call(/styles.insert(）', dialectClean);
  check('pkg/client.js 3D 管线对齐内核 scene3d.rs（与动态半同契约）',
    s3dKeys.every((k) => pkgClientSrc.includes(k)),
    s3dKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 3D 页签符号化行（与动态半同契约）',
    s3dSymKeys.every((k) => pkgClientSrc.includes(k)),
    s3dSymKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 地图页签符号化控件（与动态半同契约）',
    symKeys.every((k) => pkgClientSrc.includes(k)),
    symKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 地图页签工程样式读写区（与动态半同契约）',
    symKyuKeys.every((k) => pkgClientSrc.includes(k)),
    symKyuKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 目录 .kyu 图层接力地图页签（与动态半同契约）',
    kyuLinkKeys.every((k) => pkgClientSrc.includes(k)),
    kyuLinkKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 目录页签五分类区（与动态半同契约）',
    catKeys.every((k) => pkgClientSrc.includes(k)),
    catKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 目录页签 freshness 自动重扫（与动态半同契约）',
    freshKeys.every((k) => pkgClientSrc.includes(k)),
    freshKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 目录页签服务链接发现/拉取表单（与动态半同契约）',
    svcKeys.every((k) => pkgClientSrc.includes(k)),
    svcKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 编辑页签属性单元格编辑区（与动态半同契约）',
    editAttrKeys.every((k) => pkgClientSrc.includes(k)),
    editAttrKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 编辑页签顶点编辑画布（与动态半同契约）',
    editVertKeys.every((k) => pkgClientSrc.includes(k)),
    editVertKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 编辑页签字段计算器区（与动态半同契约）',
    editCalcKeys.every((k) => pkgClientSrc.includes(k)),
    editCalcKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 处理页签工具箱全库表单（与动态半同契约）',
    tbKeys.every((k) => pkgClientSrc.includes(k)),
    tbKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 数据页签查询联动（与动态半同契约）',
    qryKeys.every((k) => pkgClientSrc.includes(k)),
    qryKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 数据页签查询结果联动属性表（与动态半同契约）',
    qryTblKeys.every((k) => pkgClientSrc.includes(k)),
    qryTblKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 坐标页签投影变换联动（与动态半同契约）',
    crsKeys.every((k) => pkgClientSrc.includes(k)),
    crsKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 处理页签产图层工具联动（与动态半同契约）',
    tbLinkKeys.every((k) => pkgClientSrc.includes(k)),
    tbLinkKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 编辑页签联动刷新（与动态半同契约）',
    editRefKeys.every((k) => pkgClientSrc.includes(k)) && pkgClientSrc.split('联动刷新').length >= 3,
    editRefKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '两处命中');
  check('pkg/client.js 地图页签联动重渲染（与动态半同契约）',
    mapAutoKeys.every((k) => pkgClientSrc.includes(k)) && pkgClientSrc.split('store.rev++').length >= 5,
    mapAutoKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '命中');
  check('pkg/client.js 3D 页签联动重载（与动态半同契约）',
    s3dAutoKeys.every((k) => pkgClientSrc.includes(k)),
    s3dAutoKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 目录布局框点击排版预览（与动态半同契约）',
    layPvKeys.every((k) => pkgClientSrc.includes(k)),
    layPvKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 目录地图框点击产物预览（与动态半同契约）',
    mapPvKeys.every((k) => pkgClientSrc.includes(k)),
    mapPvKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  // 两半契约漂移锁：客户端 hostCall('<m>') 方法名必须 ⊆ Host 半 RPC 表
  const clientMethods = [...pkgClientSrc.matchAll(/hostCall\('([a-z0-9.]+)'/g)].map((m) => m[1]);
  const missing = clientMethods.filter((m) => !rpc.has(m));
  check('pkg/client.js ↔ host.js RPC 表无漂移（' + clientMethods.length + ' 方法 ⊆ 31 RPC）',
    missing.length === 0, missing.length ? '缺: ' + missing.join(',') : clientMethods.join(','));
  // 两半 RPC 面对称一致（2026-08-18 第四十二轮盘点）：动态半 host.call 与静态半
  // hostCall 方法集互无独有（比单向 ⊆ 更强的漂移锁；三元撤/重做不受 matchAll 捕获，两半同构对称）
  const dynMethods = new Set([...clientSrc.matchAll(/host\.call\('([a-z0-9.]+)'/g)].map((m) => m[1]));
  const pkgMethods = new Set(clientMethods);
  const dynOnly = [...dynMethods].filter((m) => !pkgMethods.has(m));
  const pkgOnly = [...pkgMethods].filter((m) => !dynMethods.has(m));
  check('两半 RPC 面对称一致（动态 ' + dynMethods.size + ' = 静态 ' + pkgMethods.size + '，零独有）',
    dynOnly.length === 0 && pkgOnly.length === 0 && dynMethods.size === pkgMethods.size,
    dynOnly.concat(pkgOnly).join(',') || '对称');

  // pkg/index.js 适配器桥实测：mock tools/webServer 触发 apply，模拟 HTTP 请求打 ping
  const pkgIndexSrc = await fsp.readFile(path.join(REPO_ROOT, dshPath('pkg', 'index.js')), 'utf8');
  check('pkg/index.js inject 含 webServer（RPC 桥前提）', /inject\s*=\s*\[[^\]]*'webServer'/.test(pkgIndexSrc));
  let route = null;
  let staticToolCount = 0;
  const adapterCtx = {
    get(key) {
      if (key === 'tools') return { register() { staticToolCount++ } };
      if (key === 'webServer') return { register(r) { route = r } };
      return ctx.get(key); // shell/fs/sandboxPolicy 复用上方等价面
    },
  };
  const pkgMod = await import(pathToFileURL(path.join(REPO_ROOT, dshPath('pkg', 'index.js'))).href);
  pkgMod.apply(adapterCtx, { hostSource: path.join(REPO_ROOT, dshPath('plugin', 'host.js')) });
  check('pkg/index.js apply：8 工具 + /kanyu-gis 前缀路由注册',
    staticToolCount === 8 && route && route.kind === 'prefix' && route.path === '/kanyu-gis',
    'tools=' + staticToolCount + ' route=' + (route && route.path));
  // 模拟一次 POST /kanyu-gis/call（node:http req/res 最小等价面）；
  // --static 模式用纯本地方法 crs.presets（ping 需 kanyu CLI，CI 无此前提）
  const bridgeMethod = STATIC_ONLY ? 'crs.presets' : 'ping';
  let bridgeCode = 0; let bridgeBody = '';
  const mockReq = new (await import('node:events')).EventEmitter();
  mockReq.method = 'POST'; mockReq.url = '/kanyu-gis/call';
  const mockRes = { writeHead(c) { bridgeCode = c }, end(b) { bridgeBody = b } };
  await route.handler(mockReq, mockRes);
  mockReq.emit('data', JSON.stringify({ method: bridgeMethod, args: {} }));
  mockReq.emit('end');
  for (let i = 0; i < 300 && !bridgeBody; i++) await new Promise((r) => setTimeout(r, 100));
  let bridgeOk = false;
  try { bridgeOk = bridgeCode === 200 && JSON.parse(bridgeBody).ok === true; } catch { /* 断言兜底 */ }
  check('pkg/index.js RPC 桥实测：POST /kanyu-gis/call ' + bridgeMethod + ' → 200 + ok', bridgeOk,
    'code=' + bridgeCode + ' body=' + bridgeBody.slice(0, 60));
  // 桥 UTF-8 正文契约（2026-08-18 第四十五轮）：Buffer 分片按 UTF-8 解码——中文
  // 路径参数无 charset 头亦不乱码。生产误判复核：乱码源是 curl.exe 命令行参数
  // GBK 化（--data-binary @UTF-8 文件则全链路正确），桥 Buffer 拼接本就 UTF-8；
  // 此断言锁死回归（两种模式皆覆盖，中文目录自建自扫不经 CLI）
  const cnDir = path.join(TMP_DIR, '中文目录');
  await fsp.mkdir(cnDir, { recursive: true });
  await fsp.writeFile(path.join(cnDir, '样例.geojson'), '{"type":"FeatureCollection","features":[]}');
  let cnCode = 0; let cnBody = '';
  const cnReq = new (await import('node:events')).EventEmitter();
  cnReq.method = 'POST'; cnReq.url = '/kanyu-gis/call';
  const cnRes = { writeHead(c) { cnCode = c }, end(b) { cnBody = b } };
  await route.handler(cnReq, cnRes);
  cnReq.emit('data', Buffer.from(JSON.stringify({ method: 'catalog.list', args: { dir: cnDir, depth: 1 } }), 'utf8'));
  cnReq.emit('end');
  for (let i = 0; i < 300 && !cnBody; i++) await new Promise((r) => setTimeout(r, 100));
  check('pkg/index.js RPC 桥 UTF-8 正文：中文路径参数解码正确（catalog.list 中文目录命中）',
    cnCode === 200 && /"count":\s*1/.test(cnBody) && cnBody.includes('中文目录'),
    'code=' + cnCode + ' body=' + cnBody.slice(0, 120));

  // ---------- 清理 ----------
  await fsp.rm(TMP_DIR, { recursive: true, force: true });
  await fsp.rm(path.join(REPO_ROOT, dshPath('output')), { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) { console.log('失败项: ' + failed.map((r) => r.name).join(' | ')); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error('装载/环境错误:', e && e.message || e); process.exit(2); });

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
  check('RPC 注册齐全（25 个）', rpc.size === 25, '实际 ' + rpc.size + '：' + [...rpc.keys()].join(','));
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
  // toolbox.run 同款防护（2026-08-18 第二十八轮）：tool run --output 单产出同路径写出
  check('host.js toolboxRun 落盘前 ensureOutDir（tool run --output 同款防护）',
    /async function toolboxRun[\s\S]*?ensureOutDir\(\)/.test(hostSrc));
  // kanyu_data query 落盘分支（2026-08-18 第二十九轮）：模型侧确认文本非空串
  check('host.js kanyu_data query 落盘分支含命中确认文本（对齐客户端 runQuery 语义）',
    /查询完成：命中/.test(hostSrc));
  // kanyu_crs reproject 回执计数（2026-08-18 第三十轮）：模型侧确认文本带要素数
  check('host.js kanyu_crs reproject 落盘分支含计数确认文本（对齐客户端 runReproject 语义）',
    /投影变换完成：/.test(hostSrc));
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
  check('catalog.list：布局框解析 .kyu layouts（demo.kyu 夹具「示例布局A4横」入列）',
    Array.isArray(cat.mapItems) && Array.isArray(cat.layoutItems)
      && (cat.layoutItems || []).some((l) => l.title === '示例布局A4横')
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
  }

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
  check('edit.ops：6 算子', ops.ok && ops.ops.length === 6);
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
  // 地图面板符号化（2026-08-18 第十二轮）：buildStyle 构建 StyleRule 直通 --style
  const symKeys = ['buildStyle', 'graduated', 'categorical', '符号化'];
  check('client.js 地图页签符号化控件（buildStyle + graduated/categorical）',
    symKeys.every((k) => clientSrc.includes(k)),
    symKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
  // 目录页签五分类（2026-08-18 第十四/二十轮）：分类头 + 数据库/本机数据/地图框/布局框分离
  const catKeys = ['kyg-cat-head', 'dataItems', 'dbItems', 'mapItems', 'layoutItems', '本机数据'];
  check('client.js 目录页签五分类区（kyg-cat-head + dataItems/dbItems）',
    catKeys.every((k) => clientSrc.includes(k)),
    catKeys.filter((k) => !clientSrc.includes(k)).join(',') || '全部命中');
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
  check('pkg/client.js 地图页签符号化控件（与动态半同契约）',
    symKeys.every((k) => pkgClientSrc.includes(k)),
    symKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 目录页签五分类区（与动态半同契约）',
    catKeys.every((k) => pkgClientSrc.includes(k)),
    catKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 目录页签服务链接发现/拉取表单（与动态半同契约）',
    svcKeys.every((k) => pkgClientSrc.includes(k)),
    svcKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 编辑页签属性单元格编辑区（与动态半同契约）',
    editAttrKeys.every((k) => pkgClientSrc.includes(k)),
    editAttrKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 编辑页签顶点编辑画布（与动态半同契约）',
    editVertKeys.every((k) => pkgClientSrc.includes(k)),
    editVertKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 处理页签工具箱全库表单（与动态半同契约）',
    tbKeys.every((k) => pkgClientSrc.includes(k)),
    tbKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 数据页签查询联动（与动态半同契约）',
    qryKeys.every((k) => pkgClientSrc.includes(k)),
    qryKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 坐标页签投影变换联动（与动态半同契约）',
    crsKeys.every((k) => pkgClientSrc.includes(k)),
    crsKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  check('pkg/client.js 处理页签产图层工具联动（与动态半同契约）',
    tbLinkKeys.every((k) => pkgClientSrc.includes(k)),
    tbLinkKeys.filter((k) => !pkgClientSrc.includes(k)).join(',') || '全部命中');
  // 两半契约漂移锁：客户端 hostCall('<m>') 方法名必须 ⊆ Host 半 RPC 表
  const clientMethods = [...pkgClientSrc.matchAll(/hostCall\('([a-z0-9.]+)'/g)].map((m) => m[1]);
  const missing = clientMethods.filter((m) => !rpc.has(m));
  check('pkg/client.js ↔ host.js RPC 表无漂移（' + clientMethods.length + ' 方法 ⊆ 25 RPC）',
    missing.length === 0, missing.length ? '缺: ' + missing.join(',') : clientMethods.join(','));

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

  // ---------- 清理 ----------
  await fsp.rm(TMP_DIR, { recursive: true, force: true });
  await fsp.rm(path.join(REPO_ROOT, dshPath('output')), { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) { console.log('失败项: ' + failed.map((r) => r.name).join(' | ')); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error('装载/环境错误:', e && e.message || e); process.exit(2); });

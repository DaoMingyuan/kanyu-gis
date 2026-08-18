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
 * 用法（仓库根）：node dsh/tools/test_plugin.mjs
 * 退出码：0 = 全部通过；1 = 存在失败项；2 = 环境/装载错误。
 * 副作用：仅在 target/tmp/ 与 dsh/output/ 写临时文件，结束自清理。
 */
import { execFile } from 'node:child_process';
import { promises as fsp, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKSPACE = REPO_ROOT; // 等价于 DSH 会话工作区根
const EXAMPLE = path.join('dsh', 'examples', 'buildings.geojson');
const TMP_DIR = path.join(REPO_ROOT, 'target', 'tmp', 'dsh-test');

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
  const plugin = await loadPlugin(path.join('dsh', 'plugin', 'host.js'));
  check('装载 host.js 并 apply', plugin.name === 'kanyu-gis', 'name=' + plugin.name);
  check('RPC 注册齐全（17 个）', rpc.size === 17, '实际 ' + rpc.size + '：' + [...rpc.keys()].join(','));
  check('动态工具注册齐全（8 个 kanyu_*）', tools.size === 8, [...tools.keys()].join(','));

  // ① 系统自省
  const ping = await callRpc('ping');
  check('ping：七大能力 + 13 地理处理工具', ping.ok && ping.capabilities.length === 7 && ping.tools.length === 13,
    'kanyu=' + String(ping.kanyu).slice(0, 40));
  const intro = await callRpc('introspect');
  check('introspect：kanyu introspect --json 可达', intro.ok && /kanyu-core/.test(intro.stdout));

  // ② GIS 数据目录读取（能力 2/4）
  const cat = await callRpc('catalog.list', { dir: 'dsh', depth: 3 });
  const exts = new Set((cat.items || []).map((i) => i.ext));
  check('catalog.list：扫描 dsh/ 检出 geojson（GIS 扩展名矩阵过滤）', cat.ok && cat.count >= 1 && exts.has('geojson'),
    'count=' + cat.count + ' exts=' + [...exts].join(','));
  const info = await callRpc('data.info', { path: EXAMPLE });
  check('data.info：buildings.geojson 4 要素', info.ok && /"feature_count":\s*4/.test(info.stdout));
  const query = await callRpc('data.query', { path: EXAMPLE, filter: 'height > 10' });
  let queryHits = -1;
  try { queryHits = JSON.parse(query.stdout.slice(query.stdout.search(/[{[]/))).features.length; } catch { /* 解析失败即 -1 */ }
  check('data.query：filter "height > 10" 有命中', query.ok && queryHits > 0, 'matched=' + queryHits);
  const val = await callRpc('data.validate', { path: EXAMPLE });
  check('data.validate：执行不抛错（GeoJSON 非宗地 TXT，宽松断言）', typeof val.exitCode === 'number');

  // ③ 地图面板（能力 1）
  const render = await callRpc('render.map', { path: EXAMPLE, theme: 'light', width: 480, height: 320 });
  check('render.map：PNG 出图 + base64 回传', render.run && render.run.ok && render.pngBase64 && render.pngBase64.length > 500,
    render.out ? 'out=' + path.basename(render.out) + ' b64=' + (render.pngBase64 || '').length : '无输出');

  // ④ 坐标框架（能力 3）
  const presets = await callRpc('crs.presets');
  check('crs.presets：7 条常用坐标系', presets.ok && presets.presets.length === 7);
  const reproj = await callRpc('crs.reproject', { path: EXAMPLE, from: 'EPSG:4326', to: 'EPSG:4490' });
  check('crs.reproject：4326→4490 执行成功', reproj.ok, reproj.stderr ? reproj.stderr.slice(0, 80) : '');

  // ⑤ 地理处理（能力 5）
  const gpList = await callRpc('geoprocess.list');
  check('geoprocess.list：13 工具白名单', gpList.ok && gpList.tools.length === 13);
  const gpOut = path.join(TMP_DIR, 'buffer-out.geojson');
  const gp = await callRpc('geoprocess.run', { tool: 'buffer', input: EXAMPLE, output: gpOut, params: { distance: 0.001 } });
  let gpFeat = 0;
  try { gpFeat = JSON.parse(await fsp.readFile(gpOut, 'utf8')).features.length; } catch { /* 断言兜底 */ }
  check('geoprocess.run buffer：输出 4 要素', gp.ok && gpFeat === 4, 'features=' + gpFeat);

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

  // ⑧ 动态工具抽查（Harness function-calling 面）
  const tGp = tools.get('kanyu_geoprocess');
  const gpText = tGp && await tGp.execute({ tool: 'stats', input: EXAMPLE });
  check('动态工具 kanyu_geoprocess(stats)：返回统计文本', typeof gpText === 'string' && /完成/.test(gpText));
  const tCat = tools.get('kanyu_catalog');
  const catText = tCat && await tCat.execute({ dir: 'dsh/examples', depth: 1 });
  check('动态工具 kanyu_catalog：目录清单文本', typeof catText === 'string' && /GEOJSON/.test(catText));

  // ---------- Client 半静态校验 ----------
  const clientSrc = await fsp.readFile(path.join(REPO_ROOT, 'dsh', 'plugin', 'client.js'), 'utf8');
  let clientParses = true;
  try { new vm.Script(`(function(){${clientSrc}\n})()`, { filename: 'client.js' }); } catch (e) { clientParses = false; }
  check('client.js 语法解析', clientParses);
  const slotsOk = ['conversation.session.header.actions', 'shell.overlay', 'tool.view.cordis']
    .every((s) => clientSrc.includes(s));
  check('client.js 三处 slot 注册', slotsOk);
  const tabsOk = ['catalog', 'data', 'map', 'crs', 'gp', 'edit', 'scene3d', 'about']
    .every((t) => clientSrc.includes(`id: '${t}'`));
  check('client.js 七能力页签 + 关于', tabsOk);

  // ---------- pkg 静态双面包契约（dsh.client 常驻形态，2026-08-18 第五轮新增） ----------
  const pkgJson = JSON.parse(await fsp.readFile(path.join(REPO_ROOT, 'dsh', 'pkg', 'package.json'), 'utf8'));
  check('pkg/package.json：exports 三键（./client + ./package.json 防封装拦截）',
    pkgJson.exports && pkgJson.exports['.'] === './index.js'
      && pkgJson.exports['./client'] === './client.js'
      && pkgJson.exports['./package.json'] === './package.json');
  check('pkg/package.json：dsh.client 声明 web 平台',
    pkgJson.dsh && pkgJson.dsh.client && pkgJson.dsh.client.platform === 'web');

  const pkgClientSrc = await fsp.readFile(path.join(REPO_ROOT, 'dsh', 'pkg', 'client.js'), 'utf8');
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
  // 两半契约漂移锁：客户端 hostCall('<m>') 方法名必须 ⊆ Host 半 RPC 表
  const clientMethods = [...pkgClientSrc.matchAll(/hostCall\('([a-z0-9.]+)'/g)].map((m) => m[1]);
  const missing = clientMethods.filter((m) => !rpc.has(m));
  check('pkg/client.js ↔ host.js RPC 表无漂移（' + clientMethods.length + ' 方法 ⊆ 17 RPC）',
    missing.length === 0, missing.length ? '缺: ' + missing.join(',') : clientMethods.join(','));

  // pkg/index.js 适配器桥实测：mock tools/webServer 触发 apply，模拟 HTTP 请求打 ping
  const pkgIndexSrc = await fsp.readFile(path.join(REPO_ROOT, 'dsh', 'pkg', 'index.js'), 'utf8');
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
  const pkgMod = await import(pathToFileURL(path.join(REPO_ROOT, 'dsh', 'pkg', 'index.js')).href);
  pkgMod.apply(adapterCtx, { hostSource: path.join(REPO_ROOT, 'dsh', 'plugin', 'host.js') });
  check('pkg/index.js apply：8 工具 + /kanyu-gis 前缀路由注册',
    staticToolCount === 8 && route && route.kind === 'prefix' && route.path === '/kanyu-gis',
    'tools=' + staticToolCount + ' route=' + (route && route.path));
  // 模拟一次 POST /kanyu-gis/call {method:'ping'}（node:http req/res 最小等价面）
  let bridgeCode = 0; let bridgeBody = '';
  const mockReq = new (await import('node:events')).EventEmitter();
  mockReq.method = 'POST'; mockReq.url = '/kanyu-gis/call';
  const mockRes = { writeHead(c) { bridgeCode = c }, end(b) { bridgeBody = b } };
  await route.handler(mockReq, mockRes);
  mockReq.emit('data', JSON.stringify({ method: 'ping', args: {} }));
  mockReq.emit('end');
  for (let i = 0; i < 300 && !bridgeBody; i++) await new Promise((r) => setTimeout(r, 100)); // ping 走真实 kanyu CLI
  let bridgeOk = false;
  try { bridgeOk = bridgeCode === 200 && JSON.parse(bridgeBody).ok === true; } catch { /* 断言兜底 */ }
  check('pkg/index.js RPC 桥实测：POST /kanyu-gis/call ping → 200 + ok', bridgeOk,
    'code=' + bridgeCode + ' body=' + bridgeBody.slice(0, 60));

  // ---------- 清理 ----------
  await fsp.rm(TMP_DIR, { recursive: true, force: true });
  await fsp.rm(path.join(REPO_ROOT, 'dsh', 'output'), { recursive: true, force: true });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) { console.log('失败项: ' + failed.map((r) => r.name).join(' | ')); process.exit(1); }
  process.exit(0);
}

main().catch((e) => { console.error('装载/环境错误:', e && e.message || e); process.exit(2); });

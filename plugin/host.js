// ============================================================================
// 堪舆 GIS × DeepSeek Harness 组件 —— Host 半（宿主进程侧）
// ----------------------------------------------------------------------------
// 职责：
//   1. 以 kanyu CLI（堪舆内核脊髓）为执行后端，向 Client 半提供 Package 私有
//      JSON RPC（harness.handle）；
//   2. 向 DSH 模型注册 8 个动态工具（harness.registerTool），把堪舆的 AI 能力
//      （原壳层 LocalDriver/OpenAiDriver 意图面）整合进 Harness 的
//      function-calling 代理循环 —— 自然语言 → 工具调用由 Harness 模型驱动，
//      组件只暴露语义对齐内核注册表的工具面；
//   3. 七大能力域：地图面板 / GIS 数据目录读取 / 坐标框架 / 工程目录 /
//      地理处理 / 地理编辑 / 3D 地理。
//
// 运行环境约束（Cordis 动态插件）：
//   - 纯 JavaScript 函数体，无 import/require/TS/JSX；
//   - 可用内建：ctx / harness / console / btoa / atob / TextEncoder /
//     TextDecoder，以及 ECMAScript 内建（JSON/Math/Date 等）；
//   - 进程执行走 ctx.get('shell')（ShellExecRequest 契约），文件读写走
//     ctx.get('fs')（dsh-fs 契约），工作区根取 ctx.get('sandboxPolicy')。
// ============================================================================

// ---------- 常量表（与 kanyu 内核注册表语义对齐） ----------

// 目录扫描识别的 GIS 数据扩展名（对齐 kanyu-core format.rs 注册表 + 工程/存档）
const GIS_EXTS = {
  geojson: 1, json: 1, shp: 1, kml: 1, kmz: 1, dxf: 1, dwg: 1, fgb: 1,
  parquet: 1, csv: 1, tsv: 1, xlsx: 1, kdb: 1, kyu: 1, gpkg: 1, txt: 1,
}

// 坐标框架快捷表（中国 GIS 常用；全库检索走 kanyu data reproject 的 EPSG 库）
const CRS_PRESETS = [
  { code: 'EPSG:4326', name: 'WGS84 经纬度', kind: '地理' },
  { code: 'EPSG:4490', name: 'CGCS2000 经纬度（中国 2000 大地）', kind: '地理' },
  { code: 'EPSG:4547', name: 'CGCS2000 / 3 度带 CM 114E', kind: '投影' },
  { code: 'EPSG:4527', name: 'CGCS2000 / 3 度带 CM 105E', kind: '投影' },
  { code: 'EPSG:3857', name: 'Web 墨卡托（网络地图）', kind: '投影' },
  { code: 'EPSG:32650', name: 'WGS84 / UTM 50N', kind: '投影' },
  { code: 'EPSG:2437', name: '北京 1954 / 3 度带 CM 111E', kind: '投影' },
]

// 地理处理工具白名单：id / 中文名 / CLI 参数形状 / 是否双输入 / 是否产输出图层
// 与 `kanyu analysis <tool> --help` 实测参数面一致（v0.22.0）。
const GP_TOOLS = [
  { id: 'buffer',     name: '缓冲区',     params: [{ k: 'distance', label: '缓冲距离', required: true }, { k: 'segments', label: '分段数' }], out: true },
  { id: 'dissolve',   name: '融合',       params: [{ k: 'field', label: '分组字段' }], out: true },
  { id: 'simplify',   name: '道格拉斯简化', params: [{ k: 'tolerance', label: '容差', required: true }], out: true },
  { id: 'centroid',   name: '质心',       params: [], out: true },
  { id: 'convexhull', name: '凸包',       params: [], out: true },
  { id: 'deleteholes', name: '删洞',      params: [{ k: 'min-area', label: '洞面积阈值' }], out: true },
  { id: 'explode',    name: '多部件炸开', params: [], out: true },
  { id: 'overlay',    name: '叠加分析',   params: [{ k: 'operation', label: '操作(union/intersection/difference/xor)', required: true }], two: true, out: true },
  { id: 'sjoin',      name: '空间连接',   params: [{ k: 'predicate', label: '谓词(intersects/contains/within)', required: true }], two: true, out: true },
  { id: 'zonal',      name: '分区统计',   params: [{ k: 'field', label: '数值字段', required: true }, { k: 'stats', label: '统计项(count,sum,mean,min,max)', required: true }], two: true, out: true },
  { id: 'stats',      name: '图层统计',   params: [], out: false },
  { id: 'measure',    name: '测地线度量', params: [{ k: 'kind', label: '类型(length/area)', required: true }], out: false },
  { id: 'topology',   name: '拓扑检查',   params: [{ k: 'rules', label: '规则(no_overlap)', required: true }], out: false },
]

// 地理编辑算子（组件内 GeoJSON 编辑内核，自我迭代起点；
// 深度拓扑编辑由 kanyu-edit crate 承接，本组件覆盖轻量在线编辑）
const EDIT_OPS = ['feature-count', 'feature-delete', 'feature-add', 'attribute-set', 'attribute-delete', 'vertex-move']

// ---------- 工具函数 ----------

// 命令行参数引用（pwsh/bash 双兼容：双引号包裹，内部双引号转义）
function q(s) { return '"' + String(s).replace(/"/g, '\\"') + '"' }

// Uint8Array → base64（btoa 只吃 UTF-8 文本，二进制须手工编码）
function bytesToBase64(bytes) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += chars[a >> 2] + chars[((a & 3) << 4) | (b >> 4)]
    out += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '='
    out += i + 2 < bytes.length ? chars[c & 63] : '='
  }
  return out
}

// 从 stdout 中稳健提取 JSON（容忍横幅行）：定位首个 { 或 [ 起解析
function parseJsonLoose(text) {
  if (!text) return null
  const t = String(text)
  const i = t.search(/[{[]/)
  if (i < 0) return null
  try { return JSON.parse(t.slice(i)) } catch (e) { return null }
}

// 路径截断显示（目录清单用）
function shortPath(p, n) {
  const s = String(p)
  return s.length <= (n || 80) ? s : '…' + s.slice(s.length - (n || 80))
}

// ---------- 插件体 ----------

return {
  name: 'kanyu-gis',

  apply(ctx) {
    const shell = ctx.get('shell')
    const fs = ctx.get('fs')
    const policy = ctx.get('sandboxPolicy')
    const WORKSPACE = policy && policy.workspaceRoot ? policy.workspaceRoot : '.'
    const OUT_DIR = WORKSPACE + '\\dsh\\output'

    if (!shell) {
      console.error('kanyu-gis: shell service 不可用，组件停用')
      return
    }

    // ------ 执行后端：kanyu CLI ------
    let kanyuVersion = null

    async function ensureOutDir() {
      // mkdir 在 cmd/pwsh/bash 下同名可用；已存在时失败忽略
      try {
        const spec = shell.resolve({ command: 'mkdir ' + q(OUT_DIR), workdir: WORKSPACE, timeoutMs: 10000 })
        await shell.run(spec)
      } catch (e) { /* 忽略：目录多半已存在 */ }
    }

    async function runKanyu(args, timeoutMs) {
      const command = 'kanyu ' + args.join(' ')
      try {
        const spec = shell.resolve({
          command,
          workdir: WORKSPACE,
          timeoutMs: timeoutMs || 120000,
          stdoutMaxBytes: 8 * 1024 * 1024,
        })
        const r = await shell.run(spec)
        return {
          ok: r.exitCode === 0,
          exitCode: r.exitCode,
          stdout: r.stdout && r.stdout.text ? r.stdout.text : '',
          stderr: r.stderr && r.stderr.text ? r.stderr.text : '',
          truncated: !!(r.stdout && r.stdout.truncated),
        }
      } catch (e) {
        return { ok: false, exitCode: null, stdout: '', stderr: String(e && e.message || e), truncated: false }
      }
    }

    // 路径 → kanyu 可开的进程路径（经 fs 后端规范化）
    async function procPath(p) {
      if (!fs) return String(p)
      try {
        const target = await fs.resolve(String(p), { cwd: WORKSPACE })
        return fs.processPath(target)
      } catch (e) {
        return String(p)
      }
    }

    // ------ 能力 1/4：GIS 数据目录读取 + 工程目录 ------
    async function catalogList(dir, depth) {
      if (!fs) return { ok: false, error: 'fs service 不可用' }
      const root = dir || WORKSPACE
      const maxDepth = typeof depth === 'number' ? depth : 3
      const items = []
      const SKIP = { target: 1, '.git': 1, node_modules: 1, dist: 1, output: 1 }
      async function walk(path, d) {
        if (d < 0 || items.length >= 500) return
        let target
        try { target = await fs.resolve(path) } catch (e) { return }
        let entries
        try { entries = await fs.listDir(target) } catch (e) { return }
        for (const e of entries) {
          if (items.length >= 500) break
          if (e.type === 'directory') {
            if (SKIP[e.name]) continue
            await walk(e.target.displayPath, d - 1)
          } else if (e.type === 'file') {
            const dot = e.name.lastIndexOf('.')
            const ext = dot >= 0 ? e.name.slice(dot + 1).toLowerCase() : ''
            if (GIS_EXTS[ext]) {
              items.push({
                path: fs.processPath(e.target),
                name: e.name,
                ext,
                size: typeof e.size === 'number' ? e.size : null,
              })
            }
          }
        }
      }
      await walk(root, maxDepth)
      return { ok: true, root, count: items.length, items }
    }

    // ------ 能力 2：数据读取（info / query / validate / preview 属性表） ------
    async function dataInfo(path) {
      const p = await procPath(path)
      return runKanyu(['data', 'info', '--json', q(p)])
    }
    async function dataQuery(path, filter, output) {
      const p = await procPath(path)
      const args = ['data', 'query', '--json', '--filter', q(filter)]
      if (output) args.push('--output', q(await procPath(output)))
      args.push(q(p))
      return runKanyu(args)
    }
    async function dataValidate(path) {
      const p = await procPath(path)
      return runKanyu(['data', 'validate', '--json', q(p)])
    }
    // 属性表预览（纯 fs 读面，对齐壳层 attrtable.rs 的只读表语义：字段并集 +
    // 前 N 行；不经 CLI——--static 模式与无 CLI 环境亦可覆盖；GeoJSON 先行）
    async function dataPreview(path, limit) {
      if (!fs) return { ok: false, error: 'fs service 不可用' }
      const p = await procPath(path)
      let fc
      try {
        const target = await fs.resolve(p)
        fc = JSON.parse(await fs.readText(target))
      } catch (e) { return { ok: false, error: '读取/解析失败（属性表目前支持 GeoJSON）: ' + String(e && e.message || e) } }
      const feats = fc && Array.isArray(fc.features) ? fc.features : []
      const cap = Math.min(Number(limit) || 50, 200)
      const fields = []
      const seen = new Set()
      for (const f of feats) {
        const props = f && f.properties
        if (!props) continue
        for (const k of Object.keys(props)) if (!seen.has(k)) { seen.add(k); fields.push(k) }
        if (fields.length >= 40) break
      }
      const cell = (v) => {
        if (v === null || v === undefined) return ''
        const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
        return s.length > 80 ? s.slice(0, 77) + '…' : s
      }
      const rows = feats.slice(0, cap).map((f) => fields.map((k) => cell(f && f.properties ? f.properties[k] : null)))
      return { ok: true, source: p, fields, rows, shown: rows.length, total: feats.length }
    }

    // ------ 能力 1：地图面板（离屏渲染 → base64 PNG 回传 Client） ------
    async function renderMap(path, theme, width, height, style) {
      await ensureOutDir()
      const p = await procPath(path)
      const out = OUT_DIR + '\\kanyu-map-' + Date.now() + '.png'
      const args = ['render', 'map', '--json', '--out', q(out),
        '--width', String(width || 800), '--height', String(height || 600),
        '--theme', theme === 'dark' ? 'dark' : 'light']
      // 属性驱动符号化（StyleRule，对齐 kanyu-render：graduated/categorical）。
      // 走 --style-file 而非内联 --style：JSON 内嵌双引号在 pwsh 下无法经
      // 命令行引号转义可靠传递（2026-08-18 实测 3080 桥打穿为 pwsh 后端，
      // \" 转义被拆成多参数报 unexpected argument）；样式 JSON 落临时文件，
      // 路径参数不含引号，pwsh/bash 双兼容。非法规则由内核中文校验报错回传。
      if (style && typeof style === 'object') {
        const sf = OUT_DIR + '\\kanyu-style-' + Date.now() + '.json'
        const target = await fs.resolve(sf)
        await fs.writeText(target, JSON.stringify(style))
        args.push('--style-file', q(sf))
      }
      args.push(q(p))
      const r = await runKanyu(args, 180000)
      if (!r.ok || !fs) return { run: r, pngBase64: null, out }
      try {
        const target = await fs.resolve(out)
        const bytes = await fs.readBytes(target, undefined, 16 * 1024 * 1024)
        return { run: r, pngBase64: bytesToBase64(bytes), out }
      } catch (e) {
        return { run: r, pngBase64: null, out, readError: String(e && e.message || e) }
      }
    }

    // ------ 能力 3：坐标框架 ------
    async function crsReproject(path, from, to, output) {
      const p = await procPath(path)
      const args = ['data', 'reproject', '--json', '--from', q(from), '--to', q(to)]
      if (output) args.push('--output', q(await procPath(output)))
      args.push(q(p))
      return runKanyu(args, 180000)
    }

    // ------ 能力 5：地理处理 ------
    async function geoprocessRun(toolId, input, input2, output, params) {
      const def = GP_TOOLS.find(t => t.id === toolId)
      if (!def) return { ok: false, error: '未知工具: ' + toolId + '（可用: ' + GP_TOOLS.map(t => t.id).join('/') + '）' }
      const args = ['analysis', def.id, '--json']
      const kv = params || {}
      for (const p of def.params) {
        const v = kv[p.k]
        if (v !== undefined && v !== null && v !== '') args.push('--' + p.k, q(v))
      }
      args.push(q(await procPath(input)))
      if (def.two) {
        if (!input2) return { ok: false, error: def.id + ' 需要第二输入图层' }
        args.push(q(await procPath(input2)))
      }
      if (def.out) {
        const out = output || (OUT_DIR + '\\gp-' + def.id + '-' + Date.now() + '.geojson')
        await ensureOutDir()
        args.push('--output', q(await procPath(out)))
      }
      return runKanyu(args, 300000)
    }

    // ------ 能力 6：地理编辑（GeoJSON 在线编辑内核） ------
    // 对齐 kanyu-edit 内核范式（crates/kanyu-edit/src/history.rs）：命令逆操作
    // 双栈——每个变更算子在应用时同步计算结构化逆操作，按源文件键控入 undo 栈
    // （容量 64、溢出淘汰最旧、新变更清空 redo 栈）；edit.undo/edit.redo 在两栈
    // 间移动记录并对同一输出文件回写。feature-count 为只读算子，不入栈。
    const EDIT_HISTORY_CAP = 64
    const editHistory = new Map() // 源文件路径 -> { undo: [], redo: [] }（记录含 outPath）
    function historyOf(p) {
      let h = editHistory.get(p)
      if (!h) { h = { undo: [], redo: [] }; editHistory.set(p, h) }
      return h
    }
    // 单一变更入口：正/逆向共用。返回 { ok, error?, summary?, inverse? }，
    // inverse 为结构化逆操作（{ op, args }），仅变更算子产生。
    // feature-insert / attribute-restore 为逆操作内部算子，不进 EDIT_OPS 公开清单。
    function applyMutation(fc, op, a) {
      const feats = fc.features
      if (op === 'feature-delete') {
        const i = Number(a.index)
        if (!(i >= 0 && i < feats.length)) return { ok: false, error: 'index 越界: ' + a.index }
        const deleted = feats.splice(i, 1)[0]
        return { ok: true, summary: '删除要素 #' + i + '，余 ' + feats.length,
          inverse: { op: 'feature-insert', args: { index: i, feature: deleted } } }
      } else if (op === 'feature-insert') {
        const i = Math.max(0, Math.min(Number(a.index) || 0, feats.length))
        if (!a.feature || a.feature.type !== 'Feature') return { ok: false, error: 'feature-insert 需要 feature（GeoJSON Feature 对象）' }
        feats.splice(i, 0, a.feature)
        return { ok: true, summary: '插入要素至 #' + i + '，共 ' + feats.length,
          inverse: { op: 'feature-delete', args: { index: i } } }
      } else if (op === 'feature-add') {
        if (!a.geometry || !a.geometry.type) return { ok: false, error: 'feature-add 需要 geometry（GeoJSON Geometry 对象）' }
        feats.push({ type: 'Feature', geometry: a.geometry, properties: a.properties || {} })
        return { ok: true, summary: '新增 ' + a.geometry.type + ' 要素，共 ' + feats.length,
          inverse: { op: 'feature-delete', args: { index: feats.length - 1 } } }
      } else if (op === 'attribute-set') {
        if (!a.field) return { ok: false, error: 'attribute-set 需要 field' }
        const idx = a.index === undefined || a.index === null ? -1 : Number(a.index)
        const old = []
        let n = 0
        feats.forEach((f, i) => {
          if (idx < 0 || i === idx) {
            if (!f.properties) f.properties = {}
            old.push([i, a.field in f.properties, f.properties[a.field]])
            f.properties[a.field] = a.value === undefined ? null : a.value
            n++
          }
        })
        return { ok: true, summary: '字段 ' + a.field + ' 已写入 ' + n + ' 个要素',
          inverse: { op: 'attribute-restore', args: { field: a.field, old } } }
      } else if (op === 'attribute-delete') {
        if (!a.field) return { ok: false, error: 'attribute-delete 需要 field' }
        const old = []
        let n = 0
        feats.forEach((f, i) => {
          if (f.properties && a.field in f.properties) {
            old.push([i, true, f.properties[a.field]])
            delete f.properties[a.field]
            n++
          }
        })
        return { ok: true, summary: '字段 ' + a.field + ' 已从 ' + n + ' 个要素删除',
          inverse: { op: 'attribute-restore', args: { field: a.field, old } } }
      } else if (op === 'attribute-restore') {
        // old: [[要素号, 原是否存在, 原值], ...]——恢复 attribute-set/delete 前的字段状态
        for (const [i, existed, val] of a.old || []) {
          const f = feats[i]
          if (!f) continue
          if (!f.properties) f.properties = {}
          if (existed) f.properties[a.field] = val
          else delete f.properties[a.field]
        }
        // 逆之逆 = 重做时的新鲜逆操作由 redo 路径重算，这里给保守等价物
        return { ok: true, summary: '字段 ' + a.field + ' 已恢复 ' + (a.old || []).length + ' 个要素',
          inverse: { op: 'attribute-restore', args: { field: a.field, old: (a.old || []).map(([i]) => {
            const f = feats[i]
            return [i, !!(f && f.properties && a.field in f.properties), f && f.properties ? f.properties[a.field] : undefined]
          }) } } }
      } else if (op === 'vertex-move') {
        const i = Number(a.feature)
        const f = feats[i]
        if (!f) return { ok: false, error: 'feature 越界: ' + a.feature }
        // ringPath：Polygon 为 [环号]，MultiPolygon 为 [部件号, 环号]（GeomPath 三级定位）
        let coords = f.geometry && f.geometry.coordinates
        const ringPath = Array.isArray(a.ringPath) ? a.ringPath : [0]
        for (const ri of ringPath) {
          if (!Array.isArray(coords)) return { ok: false, error: '几何路径解析失败' }
          coords = coords[Number(ri)]
        }
        const vi = Number(a.vertex)
        if (!Array.isArray(coords) || !Array.isArray(coords[vi])) return { ok: false, error: 'vertex 越界: ' + a.vertex }
        const oldPos = coords[vi].slice()
        coords[vi] = [Number(a.x), Number(a.y)]
        return { ok: true, summary: '要素 #' + i + ' 顶点 ' + vi + ' 已移至 (' + a.x + ', ' + a.y + ')',
          inverse: { op: 'vertex-move', args: { feature: i, ringPath, vertex: vi, x: oldPos[0], y: oldPos[1] } } }
      }
      return { ok: false, error: '未知编辑算子: ' + op }
    }
    async function editReadFc(p) {
      let text
      try {
        const target = await fs.resolve(p)
        text = await fs.readText(target)
      } catch (e) { return { error: '读取失败: ' + String(e && e.message || e) } }
      try {
        const fc = JSON.parse(text)
        if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return { error: '仅支持 FeatureCollection 根' }
        return { fc }
      } catch (e) { return { error: 'GeoJSON 解析失败: ' + String(e && e.message || e) } }
    }
    async function editWriteFc(outPath, fc) {
      try {
        const target = await fs.resolve(outPath)
        await fs.writeText(target, JSON.stringify(fc))
        return true
      } catch (e) { return false }
    }
    async function editApply(path, op, args, inPlace) {
      if (!fs) return { ok: false, error: 'fs service 不可用' }
      if (EDIT_OPS.indexOf(op) < 0) return { ok: false, error: '未知编辑算子: ' + op + '（可用: ' + EDIT_OPS.join('/') + '）' }
      const p = await procPath(path)
      if (!/\.(geojson|json)$/i.test(p)) return { ok: false, error: '组件内编辑内核目前仅支持 GeoJSON（其他格式请先经 kanyu data export 转换）' }
      const r = await editReadFc(p)
      if (r.error) return { ok: false, error: r.error }
      const fc = r.fc
      const feats = fc.features
      const a = args || {}
      if (op === 'feature-count') {
        return { ok: true, summary: '要素数 ' + feats.length, count: feats.length }
      }
      const m = applyMutation(fc, op, a)
      if (!m.ok) return m
      const outPath = inPlace ? p : p.replace(/\.(geojson|json)$/i, '.edited.geojson')
      if (!(await editWriteFc(outPath, fc))) return { ok: false, error: '写回失败: ' + outPath }
      // 入 undo 栈（容量淘汰最旧 + 清空 redo），与 kanyu-edit History.push 同语义
      const h = historyOf(p)
      h.undo.push({ op, args: a, inverse: m.inverse, outPath, label: m.summary })
      if (h.undo.length > EDIT_HISTORY_CAP) h.undo.shift()
      h.redo.length = 0
      return { ok: true, summary: m.summary, output: outPath, count: feats.length,
        history: { undo: h.undo.length, redo: h.redo.length } }
    }
    async function editUndoRedo(path, dir) {
      if (!fs) return { ok: false, error: 'fs service 不可用' }
      const p = await procPath(path)
      const h = historyOf(p)
      const stack = dir === 'undo' ? h.undo : h.redo
      const rec = stack.pop()
      if (!rec) return { ok: false, error: (dir === 'undo' ? '无可撤销' : '无可重做') + '的编辑记录（' + p + '）' }
      const r = await editReadFc(rec.outPath)
      if (r.error) { stack.push(rec); return { ok: false, error: r.error } }
      const m = dir === 'undo' ? applyMutation(r.fc, rec.inverse.op, rec.inverse.args) : applyMutation(r.fc, rec.op, rec.args)
      if (!m.ok) { stack.push(rec); return { ok: false, error: '回滚应用失败: ' + m.error } }
      if (!(await editWriteFc(rec.outPath, r.fc))) { stack.push(rec); return { ok: false, error: '写回失败: ' + rec.outPath } }
      // undo：记录移入 redo 栈；redo：重算新鲜逆操作后移回 undo 栈
      if (dir === 'undo') h.redo.push(rec)
      else h.undo.push({ op: rec.op, args: rec.args, inverse: m.inverse, outPath: rec.outPath, label: rec.label })
      return { ok: true, summary: (dir === 'undo' ? '已撤销: ' : '已重做: ') + rec.label, output: rec.outPath,
        history: { undo: h.undo.length, redo: h.redo.length } }
    }

    // ------ 能力 7：3D 地理（挤出体数据制备，Client canvas 软件 3D 管线绘制） ------
    async function scene3dData(path, heightField, maxFeatures) {
      if (!fs) return { ok: false, error: 'fs service 不可用' }
      const p = await procPath(path)
      let text
      try {
        const target = await fs.resolve(p)
        text = await fs.readText(target)
      } catch (e) { return { ok: false, error: '读取失败（3D 数据源目前支持 GeoJSON）: ' + String(e && e.message || e) } }
      let fc
      try { fc = JSON.parse(text) } catch (e) { return { ok: false, error: 'GeoJSON 解析失败' } }
      const feats = fc && Array.isArray(fc.features) ? fc.features : []
      const hf = heightField || 'height'
      const cap = Math.min(Number(maxFeatures) || 300, 1000)
      const out = []
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      let budget = 24000 // 顶点总量预算
      for (const f of feats) {
        if (out.length >= cap || budget <= 0) break
        const g = f.geometry
        if (!g) continue
        let ring = null
        if (g.type === 'Polygon') ring = g.coordinates[0]
        else if (g.type === 'MultiPolygon') ring = g.coordinates[0] && g.coordinates[0][0]
        else if (g.type === 'LineString') ring = g.coordinates
        else if (g.type === 'Point') ring = [g.coordinates]
        if (!Array.isArray(ring) || ring.length === 0) continue
        // 顶点抽稀：每环最多 120 点
        const step = Math.max(1, Math.floor(ring.length / 120))
        const pts = []
        for (let i = 0; i < ring.length && pts.length < 120 && budget > 0; i += step) {
          const xy = ring[i]
          if (!Array.isArray(xy)) continue
          const x = Math.round(Number(xy[0]) * 1e6) / 1e6
          const y = Math.round(Number(xy[1]) * 1e6) / 1e6
          if (!isFinite(x) || !isFinite(y)) continue
          pts.push([x, y]); budget--
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
        if (pts.length === 0) continue
        const props = f.properties || {}
        const h = Number(props[hf])
        out.push({
          ring: pts,
          geom: g.type,
          height: isFinite(h) ? h : 10,
          name: props.name || props.Name || props.NAME || null,
        })
      }
      return {
        ok: true, source: p, heightField: hf,
        count: out.length, total: feats.length,
        bbox: isFinite(minX) ? [minX, minY, maxX, maxY] : null,
        features: out,
      }
    }

    // ------ 系统自省 ------
    async function introspect() { return runKanyu(['introspect', '--json'], 60000) }

    async function ping() {
      if (kanyuVersion === null) {
        const r = await runKanyu(['--version'], 30000)
        kanyuVersion = r.ok ? (r.stdout || r.stderr).trim() : '不可用: ' + (r.stderr || 'exit ' + r.exitCode)
      }
      return {
        ok: true, kanyu: kanyuVersion, workspace: WORKSPACE,
        capabilities: ['地图面板', 'GIS数据目录读取', '坐标框架', '工程目录', '地理处理', '地理编辑', '3D地理'],
        tools: GP_TOOLS.map(t => t.id), editOps: EDIT_OPS, crsPresets: CRS_PRESETS.length,
      }
    }

    // ---------- Package 私有 RPC（Client → Host） ----------
    harness.handle('ping', async () => ping())
    harness.handle('introspect', async () => introspect())
    harness.handle('catalog.list', async (a) => catalogList(a && a.dir, a && a.depth))
    harness.handle('data.info', async (a) => dataInfo(a && a.path))
    harness.handle('data.query', async (a) => dataQuery(a && a.path, a && a.filter, a && a.output))
    harness.handle('data.validate', async (a) => dataValidate(a && a.path))
    harness.handle('data.preview', async (a) => dataPreview(a && a.path, a && a.limit))
    harness.handle('render.map', async (a) => renderMap(a && a.path, a && a.theme, a && a.width, a && a.height, a && a.style))
    harness.handle('crs.presets', async () => ({ ok: true, presets: CRS_PRESETS }))
    harness.handle('crs.reproject', async (a) => crsReproject(a && a.path, a && a.from, a && a.to, a && a.output))
    harness.handle('geoprocess.list', async () => ({ ok: true, tools: GP_TOOLS }))
    harness.handle('geoprocess.run', async (a) => geoprocessRun(a && a.tool, a && a.input, a && a.input2, a && a.output, a && a.params))
    harness.handle('edit.ops', async () => ({ ok: true, ops: EDIT_OPS }))
    harness.handle('edit.apply', async (a) => editApply(a && a.path, a && a.op, a && a.args, !!(a && a.inPlace)))
    harness.handle('edit.undo', async (a) => editUndoRedo(a && a.path, 'undo'))
    harness.handle('edit.redo', async (a) => editUndoRedo(a && a.path, 'redo'))
    harness.handle('edit.history', async (a) => {
      const p = await procPath(a && a.path)
      const h = historyOf(p)
      return { ok: true, undo: h.undo.length, redo: h.redo.length,
        undoTop: h.undo.length ? h.undo[h.undo.length - 1].label : null,
        redoTop: h.redo.length ? h.redo[h.redo.length - 1].label : null }
    })
    harness.handle('scene3d.data', async (a) => scene3dData(a && a.path, a && a.heightField, a && a.maxFeatures))

    // ---------- 动态模型工具（堪舆 AI 能力 → Harness function-calling） ----------
    // 原壳层 LocalDriver 意图匹配/OpenAiDriver function calling 的能力面，
    // 在 DSH 组件中收敛为 8 个注册进 Harness 工具注册表的一等工具，
    // 由 Harness 模型路由直接驱动（单一事实来源：kanyu 内核注册表）。

    function textTool(def) {
      // 统一 output 形状：文本块
      return harness.registerTool(ctx, harness.defineTool({
        name: def.name,
        description: def.description,
        parameters: def.parameters,
        output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
        execute: def.execute,
      }))
    }

    textTool({
      name: 'kanyu_introspect',
      description: '堪舆内核系统自省：模块清单、MCP 工具面、格式能力矩阵（单一事实来源，对齐 kanyu introspect --json）。',
      parameters: {},
      async execute() {
        const r = await introspect()
        const j = parseJsonLoose(r.stdout)
        return j ? JSON.stringify(j).slice(0, 6000) : (r.ok ? r.stdout.slice(0, 6000) : '失败: ' + r.stderr.slice(0, 2000))
      },
    })

    textTool({
      name: 'kanyu_catalog',
      description: '扫描目录下的 GIS 数据文件（geojson/shp/kml/dxf/dwg/fgb/parquet/kdb/kyu 等，对齐内核格式注册表），返回路径/类型/大小清单。',
      parameters: {
        dir: { type: 'string', description: '起始目录（缺省为会话工作区根）' },
        depth: { type: 'number', description: '递归深度（默认 3）' },
      },
      async execute(args) {
        const r = await catalogList(args.dir, args.depth)
        if (!r.ok) return '目录扫描失败: ' + r.error
        const lines = r.items.slice(0, 80).map(i => i.ext.toUpperCase().padEnd(8) + ' ' + (i.size === null ? '-' : Math.round(i.size / 1024) + 'KB').padStart(9) + '  ' + shortPath(i.path))
        return '目录 ' + r.root + ' 共 ' + r.count + ' 个 GIS 数据文件' + (r.count > 80 ? '（前 80 条）' : '') + ':\n' + lines.join('\n')
      },
    })

    textTool({
      name: 'kanyu_data',
      description: '读取 GIS 数据：action=info 检视（格式/要素数/字段清单）、query 属性查询（filter 如 "height > 50"）、validate 宗地 TXT 质检、preview 属性表预览（字段并集 + 前 N 行，纯读面不经 CLI）。',
      parameters: {
        action: { type: 'string', required: true, description: 'info | query | validate | preview' },
        path: { type: 'string', required: true, description: '数据文件路径' },
        filter: { type: 'string', description: 'query 时的过滤表达式："field op value"，op ∈ == != > >= < <=' },
        output: { type: 'string', description: 'query 结果输出路径（GeoJSON，可选）' },
        limit: { type: 'number', description: 'preview 时的行数上限（默认 50，最大 200）' },
      },
      async execute(args) {
        if (args.action === 'preview') {
          const r = await dataPreview(args.path, args.limit)
          if (!r.ok) return '失败: ' + r.error
          const text = '字段(' + r.fields.length + '): ' + r.fields.join(', ') + '\n前 ' + r.shown + '/' + r.total + ' 行:\n'
            + r.rows.map((row) => row.join(' | ')).join('\n')
          return text.slice(0, 5000)
        }
        const r = args.action === 'query' ? await dataQuery(args.path, args.filter || '', args.output)
          : args.action === 'validate' ? await dataValidate(args.path)
          : await dataInfo(args.path)
        const j = parseJsonLoose(r.stdout)
        if (j) return JSON.stringify(j).slice(0, 6000)
        return r.ok ? r.stdout.slice(0, 6000) : '失败(exit ' + r.exitCode + '): ' + r.stderr.slice(0, 2000)
      },
    })

    textTool({
      name: 'kanyu_render',
      description: '离屏渲染 GIS 数据为地图 PNG（晨山 light/夜观星 dark 主题，支持属性驱动符号化）。返回图片落盘路径，可用 read_image 查看。',
      parameters: {
        path: { type: 'string', required: true, description: '数据文件路径' },
        theme: { type: 'string', description: 'light（晨山）| dark（夜观星），默认 light' },
        width: { type: 'number', description: '宽度像素（默认 800）' },
        height: { type: 'number', description: '高度像素（默认 600）' },
        style: { type: 'object', description: '属性驱动符号化（StyleRule）：分级 {"type":"graduated","field":"height","stops":[[阈值,"#RRGGBB"],…]（严格升序）}；唯一值 {"type":"categorical","field":"usage","colors":{"类别":"#RRGGBB"},"default":"#888888"}' },
      },
      async execute(args) {
        const r = await renderMap(args.path, args.theme, args.width, args.height, args.style)
        if (!r.run.ok) return '渲染失败(exit ' + r.run.exitCode + '): ' + r.run.stderr.slice(0, 2000)
        return '渲染完成: ' + r.out + (r.pngBase64 ? '（PNG ' + Math.round(r.pngBase64.length * 3 / 4 / 1024) + 'KB，可 read_image 查看）' : '（图片读取失败）')
      },
    })

    textTool({
      name: 'kanyu_crs',
      description: '坐标框架：action=presets 列出常用坐标系；action=reproject 执行投影变换（EPSG:xxxx ↔ EPSG:xxxx，内置 EPSG 全库）。',
      parameters: {
        action: { type: 'string', required: true, description: 'presets | reproject' },
        path: { type: 'string', description: 'reproject 时的数据文件路径' },
        from: { type: 'string', description: '源 CRS（如 EPSG:4326）' },
        to: { type: 'string', description: '目标 CRS（如 EPSG:4547）' },
        output: { type: 'string', description: '输出路径（可选，缺省打印）' },
      },
      async execute(args) {
        if (args.action === 'presets') {
          return '常用坐标系:\n' + CRS_PRESETS.map(c => c.code + '  ' + c.name + '（' + c.kind + '）').join('\n')
        }
        const r = await crsReproject(args.path, args.from, args.to, args.output)
        const j = parseJsonLoose(r.stdout)
        if (j) return JSON.stringify(j).slice(0, 4000)
        return r.ok ? (args.output ? '已输出: ' + args.output : r.stdout.slice(0, 4000)) : '失败: ' + r.stderr.slice(0, 2000)
      },
    })

    textTool({
      name: 'kanyu_geoprocess',
      description: '地理处理工具箱（对齐 QGIS/ArcGIS 语义，kanyu analysis 内核）：buffer/dissolve/simplify/centroid/convexhull/deleteholes/explode/overlay/sjoin/zonal/stats/measure/topology。',
      parameters: {
        tool: { type: 'string', required: true, description: '工具 id：' + GP_TOOLS.map(t => t.id).join('/') },
        input: { type: 'string', required: true, description: '输入图层路径' },
        input2: { type: 'string', description: '第二输入图层（overlay/sjoin/zonal 必填）' },
        output: { type: 'string', description: '输出路径（可选，缺省落 dsh/output/）' },
        params: { type: 'object', additionalProperties: true, description: '工具参数键值（如 {"distance": 100}）' },
      },
      async execute(args) {
        const r = await geoprocessRun(args.tool, args.input, args.input2, args.output, args.params)
        const j = parseJsonLoose(r.stdout)
        const head = r.ok ? '工具 ' + args.tool + ' 完成' : '工具 ' + args.tool + ' 失败(exit ' + r.exitCode + ')'
        return head + '\n' + (j ? JSON.stringify(j).slice(0, 4000) : (r.ok ? r.stdout.slice(0, 4000) : r.stderr.slice(0, 2000)))
      },
    })

    textTool({
      name: 'kanyu_edit',
      description: '地理编辑（GeoJSON 在线编辑内核，对齐 kanyu-edit 命令逆操作双栈）：feature-count/feature-delete/feature-add/attribute-set/attribute-delete/vertex-move；默认写出 .edited.geojson，inPlace=true 原地修改；变更入 undo 栈，撤销/重做经 edit.undo/edit.redo RPC（工作台编辑页签有按钮）。',
      parameters: {
        path: { type: 'string', required: true, description: 'GeoJSON 文件路径' },
        op: { type: 'string', required: true, description: '编辑算子：' + EDIT_OPS.join('/') },
        args: { type: 'object', additionalProperties: true, description: '算子参数（如 {"index":0}、{"field":"height","value":30}、{"feature":0,"ringPath":[0],"vertex":2,"x":113.5,"y":34.2}）' },
        inPlace: { type: 'boolean', description: 'true 原地覆盖（默认 false 写 .edited.geojson）' },
      },
      async execute(args) {
        const r = await editApply(args.path, args.op, args.args, !!args.inPlace)
        return r.ok ? (r.summary + (r.output ? '\n输出: ' + r.output : '')) : '编辑失败: ' + r.error
      },
    })

    textTool({
      name: 'kanyu_scene3d',
      description: '3D 地理：从 GeoJSON 制备挤出体场景数据（按高度字段拉伸棱柱，yaw/pitch 斜投影 + 背面剔除 + 纵深排序，对齐内核 scene3d.rs 软件管线），返回场景摘要；完整交互式 3D 视图在组件 Client 面板。',
      parameters: {
        path: { type: 'string', required: true, description: 'GeoJSON 文件路径' },
        heightField: { type: 'string', description: '高度字段名（默认 height，无该字段取 10）' },
        maxFeatures: { type: 'number', description: '最大要素数（默认 300）' },
      },
      async execute(args) {
        const r = await scene3dData(args.path, args.heightField, args.maxFeatures)
        if (!r.ok) return '3D 数据制备失败: ' + r.error
        return '3D 场景: ' + r.count + '/' + r.total + ' 要素，高度字段 ' + r.heightField + '，bbox=' + JSON.stringify(r.bbox)
      },
    })

    console.log('kanyu-gis Host 半已激活：7 大能力 RPC + 8 动态工具，工作区 ' + WORKSPACE)
  },
}

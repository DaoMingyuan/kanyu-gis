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

// 坐标框架快捷表（中国 GIS 常用；EPSG 全库 7507 条检索走 `kanyu crs search`，
// 接内核 core::crs::search_crs 单一事实来源，此处仅作离线/快显兜底）
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
const EDIT_OPS = ['feature-count', 'feature-delete', 'feature-add', 'attribute-set', 'attribute-delete', 'attributes-replace', 'vertex-move', 'feature-move', 'hole-add']

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
      // 壳层 catalog.rs 固定五分类（ArcGIS Pro 工程目录范式）的组件语境映射：
      // 数据库 = .kdb/.kyu 工程/库文件；本机数据 = 其余 GIS 数据文件；
      // 地图框/布局框/服务链接组件语境暂无对应物，按壳层契约给空态提示。
      const DB_EXTS = { kdb: 1, kyu: 1 }
      const dbItems = items.filter(i => DB_EXTS[i.ext])
      const dataItems = items.filter(i => !DB_EXTS[i.ext])
      // 地图框 = 会话工作区渲染产物（output/*.png，render.map 落盘——组件语境
      // 无壳层运行时地图框，产物即对应物）；布局框 = 扫描到的 .kyu 工程
      // v2 布局清单（壳层 project.rs layouts 字段，单一事实来源）。
      const mapItems = []
      try {
        const outEntries = await fs.listDir(await fs.resolve(OUT_DIR))
        for (const e of outEntries) {
          if (e.type === 'file' && /\.png$/i.test(e.name))
            mapItems.push({ path: fs.processPath(e.target), name: e.name, size: typeof e.size === 'number' ? e.size : null })
        }
      } catch (e) { /* 输出目录尚未存在 */ }
      const layoutItems = []
      for (const db of dbItems.slice(0, 50)) {
        if (db.ext !== 'kyu') continue
        try {
          const manifest = JSON.parse(await fs.readText(await fs.resolve(db.path)))
          for (const l of (manifest && manifest.layouts) || [])
            layoutItems.push({ title: l.title || '（未命名布局）', from: db.name, kyu: db.path })
        } catch (e) { /* 非工程 JSON 跳过 */ }
      }
      const categories = [
        { name: '地图框', count: mapItems.length, placeholder: '暂无渲染产物——地图页签渲染后在此列出' },
        { name: '布局框', count: layoutItems.length, placeholder: '暂无布局——.kyu 工程（v2 起）持久化布局清单后在此列出' },
        { name: '数据库', count: dbItems.length, placeholder: null },
        { name: '服务链接', count: 0, placeholder: '暂无服务链接——输入基址点「发现图层」（WFS/WMS，对齐壳层 services.rs）' },
        { name: '本机数据', count: dataItems.length, placeholder: null },
      ]
      return { ok: true, root, count: items.length, items, dataItems, dbItems, mapItems, layoutItems, categories }
    }

    // ------ 能力 2：数据读取（info / query / validate / preview 属性表） ------
    async function dataInfo(path) {
      const p = await procPath(path)
      return runKanyu(['data', 'info', '--json', q(p)])
    }
    async function dataQuery(path, filter, output) {
      const p = await procPath(path)
      const args = ['data', 'query', '--json', '--filter', q(filter)]
      // kanyu data query --output 底层 std::fs::write 不建父目录，先确保 dsh/output 存在
      if (output) { await ensureOutDir(); args.push('--output', q(await procPath(output))) }
      args.push(q(p))
      return runKanyu(args)
    }
    async function dataValidate(path) {
      const p = await procPath(path)
      return runKanyu(['data', 'validate', '--json', q(p)])
    }
    // 字段计算器（attrcalc 内核出口：表达式逐要素求值写入 target 字段）
    async function dataCalc(path, target, expr, output) {
      const p = await procPath(path)
      const args = ['data', 'calc', '--json', '--target', q(target), '--expr', q(expr)]
      if (output) { await ensureOutDir(); args.push('--output', q(await procPath(output))) }
      args.push(q(p))
      return runKanyu(args)
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
    // 符号化编辑模型 → StyleRule 投影（第五十二轮，对齐壳层 symbology.rs
    // LayerSymbology→to_style_rule；.kyu 持久化用本模型，CLI 直通用 StyleRule）。
    // 色带值与 Ramp::colors 逐一对应（浅→深 5 色）；sample 对齐均匀取样算法。
    const RAMPS = {
      Jade:  ['#E8F4F0', '#BFE0D8', '#7FBFB2', '#4D9A8C', '#2D6A5E'],
      Amber: ['#FBF3DC', '#F3DFA0', '#E9C46A', '#D9A23C', '#B07818'],
      Slate: ['#EAF1F6', '#C6D9E6', '#8FB3CC', '#5E8FAD', '#3A6B8C'],
    }
    // f64::MIN（首档阈值全域着色，对齐 to_style_rule；JS Number.MIN_VALUE 是
    // 最小正数，绝不可用）
    const F64_MIN = -1.7976931348623157e308
    function hexOf(c) {
      const p = (Array.isArray(c) ? c : []).map(v => Math.max(0, Math.min(255, Math.round(Number(v) || 0))))
      while (p.length < 3) p.push(0)
      return '#' + p.slice(0, 3).map(v => v.toString(16).padStart(2, '0').toUpperCase()).join('')
    }
    function rampSample(name, n) {
      const cs = RAMPS[name] || RAMPS.Jade
      n = Math.max(1, n | 0)
      const out = []
      for (let i = 0; i < n; i++) out.push(cs[n === 1 ? cs.length - 1 : Math.floor(i * (cs.length - 1) / (n - 1))])
      return out
    }
    function symToRule(sym) {
      if (!sym || typeof sym !== 'object') return null
      const mode = String(sym.mode || '')
      if (mode === 'single') return { type: 'categorical', field: '', colors: {}, default: hexOf(sym.color) }
      if (mode === 'categorical') {
        const colors = {}
        ;(sym.colors || []).forEach(p => { if (Array.isArray(p) && p.length >= 2) colors[String(p[0])] = hexOf(p[1]) })
        return { type: 'categorical', field: String(sym.field || ''), colors, default: hexOf(sym.other || [136, 136, 136]) }
      }
      if (mode === 'graduated') {
        const breaks = (sym.breaks || []).map(Number).filter(isFinite)
        const cols = rampSample(sym.ramp, breaks.length + 1)
        const stops = [[F64_MIN, cols[0]]]
        breaks.forEach((b, i) => stops.push([b, cols[i + 1]]))
        return { type: 'graduated', field: String(sym.field || ''), stops }
      }
      return null
    }
    async function renderMap(path, theme, width, height, style, symbology) {
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
      // symbology（LayerSymbology 编辑模型，.kyu 持久化格式）经 symToRule
      // 投影为 StyleRule；显式 style 优先（第五十二轮）。
      if ((!style || typeof style !== 'object') && symbology && typeof symbology === 'object') style = symToRule(symbology)
      if (style && typeof style === 'object') {
        const sf = OUT_DIR + '\\kanyu-style-' + Date.now() + '.json'
        const target = await fs.resolve(sf)
        await fs.writeText(target, JSON.stringify(style))
        args.push('--style-file', q(sf))
      }
      args.push(q(p))
      const r = await runKanyu(args, 180000)
      if (!r.ok || !fs) return { run: r, pngBase64: null, out, styleApplied: style || null }
      try {
        const target = await fs.resolve(out)
        const bytes = await fs.readBytes(target, undefined, 16 * 1024 * 1024)
        return { run: r, pngBase64: bytesToBase64(bytes), out, styleApplied: style || null }
      } catch (e) {
        return { run: r, pngBase64: null, out, styleApplied: style || null, readError: String(e && e.message || e) }
      }
    }

    // 工程图层样式读写（style.get/style.set RPC，第五十二轮）：.kyu 清单
    // layers[].style 为 LayerSymbology JSON（壳层 project.rs 原样透传字段，
    // core 不解 schema）；读回供符号化面板回填，写入对齐 core 的
    // to_string_pretty 两空格缩进。图层按 id 匹配。
    async function styleGet(kyu, layerId) {
      if (!kyu) return { ok: false, error: '缺 kyu 工程路径' }
      let m
      try {
        m = JSON.parse(await fs.readText(await fs.resolve(await procPath(kyu))))
      } catch (e) { return { ok: false, error: 'kyu 工程读取/解析失败: ' + String(e && e.message || e) } }
      const layers = m.layers || []
      const lay = layerId != null && layerId !== '' ? layers.find(l => l.id === layerId) : layers[0]
      if (!lay) return { ok: false, error: '工程内未找到图层: ' + String(layerId || '(空)') }
      return { ok: true, kyu, layerId: lay.id, source: lay.source, style: lay.style || null }
    }
    async function styleSet(kyu, layerId, style) {
      if (!kyu) return { ok: false, error: '缺 kyu 工程路径' }
      if (!style || typeof style !== 'object' || !/^(single|categorical|graduated)$/.test(String(style.mode || '')))
        return { ok: false, error: 'style 须为 LayerSymbology JSON（mode: single/categorical/graduated，对齐壳层 symbology.rs）' }
      let target
      try { target = await fs.resolve(await procPath(kyu)) } catch (e) { return { ok: false, error: String(e && e.message || e) } }
      let m
      try { m = JSON.parse(await fs.readText(target)) }
      catch (e) { return { ok: false, error: 'kyu 工程读取/解析失败: ' + String(e && e.message || e) } }
      const lay = (m.layers || []).find(l => l.id === layerId)
      if (!lay) return { ok: false, error: '工程内未找到图层: ' + String(layerId || '(空)') }
      lay.style = style
      try {
        await fs.writeText(target, JSON.stringify(m, null, 2))
      } catch (e) { return { ok: false, error: 'kyu 工程写回失败: ' + writeHint(e) } }
      return { ok: true, kyu, layerId: lay.id, style }
    }

    // 工程图层清单（style.list RPC，第五十五轮）：.kyu layers 全列——id /
    // source（相对工程目录解析为绝对路径，供客户端直接设为当前图层）/
    // visible / styleMode / style 原文。目录页签 .kyu 条目点击展开用。
    async function styleList(kyu) {
      if (!kyu) return { ok: false, error: '缺 kyu 工程路径' }
      let m, kyuAbs
      try {
        // fs.resolve 返回 {displayPath} 对象：readText 直接吃该对象（styleGet
        // 同款）；取字符串走 processPath → displayPath → 原值三级回退
        // （3080 实测 processPath 对 resolve 对象可能取不出，2026-08-18）
        const resolved = await fs.resolve(await procPath(kyu))
        m = JSON.parse(await fs.readText(resolved))
        kyuAbs = (fs.processPath && fs.processPath(resolved)) || resolved.displayPath || String(resolved)
      } catch (e) { return { ok: false, error: 'kyu 工程读取/解析失败: ' + String(e && e.message || e) } }
      const base = kyuAbs.replace(/[\\/][^\\/]+$/, '')
      const layers = (m.layers || []).map(l => {
        const src = String(l.source || '')
        const abs = /^([A-Za-z]:[\\/]|\/|\\\\)/.test(src) ? src : (base + '/' + src.replace(/\\/g, '/'))
        return { id: l.id, source: abs, visible: l.visible !== false,
          styleMode: l.style && l.style.mode ? String(l.style.mode) : null, style: l.style || null }
      })
      return { ok: true, kyu, name: m.name || null, crs: m.crs || null, layers }
    }

    // 布局排版（kanyu render layout，第四十六轮出口）：A4 横/竖页面 +
    // 标题/图例/比例尺/指北针，SVG 或 PNG。样式文件同 renderMap 走 --style-file。
    async function renderLayout(path, out, title, page, dpi, flags, style, symbology) {
      await ensureOutDir()
      const p = await procPath(path)
      const target = out || (OUT_DIR + '\\kanyu-layout-' + Date.now() + '.svg')
      const args = ['render', 'layout', '--out', q(await procPath(target)),
        '--title', q(String(title || '堪舆布局')),
        '--page', page === 'a4p' ? 'a4p' : 'a4l',
        '--dpi', String(dpi || 96)]
      const fl = flags || {}
      if (fl.noLegend) args.push('--no-legend')
      if (fl.noScalebar) args.push('--no-scalebar')
      if (fl.noNorth) args.push('--no-north')
      if (fl.theme) args.push('--theme', fl.theme === 'dark' ? 'dark' : 'light')
      // symbology 编辑模型投影（第五十三轮，同 renderMap 语义：显式 style 优先）
      if ((!style || typeof style !== 'object') && symbology && typeof symbology === 'object') style = symToRule(symbology)
      if (style && typeof style === 'object') {
        const sf = OUT_DIR + '\\kanyu-style-' + Date.now() + '.json'
        await fs.writeText(await fs.resolve(sf), JSON.stringify(style))
        args.push('--style-file', q(sf))
      }
      args.push(q(p))
      const r = await runKanyu(args, 180000)
      return { run: r, out: target }
    }

    // 布局预览（render.layout RPC，第四十八轮）：两种入参——
    //   ① path 直传数据文件（标题/页面/开关可选覆盖）；
    //   ② kyu + title：读 .kyu 工程清单（壳层 project.rs ProjectLayout 规格），
    //      布局规格 page/dpi/legend/scalebar/north 取自工程，数据取首个可见
    //      图层 source（相对工程文件所在目录解析）。
    // 出 SVG 落 dsh/output 并回传文本（客户端内嵌预览）。
    async function layoutPreview(args) {
      const a = args || {}
      let path = a.path
      let title = a.title
      let page = a.page
      let dpi = a.dpi
      const flags = { theme: a.theme }
      if (a.legend === false) flags.noLegend = true
      if (a.scalebar === false) flags.noScalebar = true
      if (a.north === false) flags.noNorth = true
      if (!path && a.kyu) {
        let manifest
        try {
          manifest = JSON.parse(await fs.readText(await fs.resolve(await procPath(a.kyu))))
        } catch (e) { return { ok: false, error: 'kyu 工程读取/解析失败: ' + String(e && e.message || e) } }
        const layouts = (manifest && manifest.layouts) || []
        const lay = layouts.find(l => (l.title || '') === (a.title || '')) || layouts[0]
        if (!lay) return { ok: false, error: '工程无布局清单（layouts 为空）' }
        if (!title) title = lay.title
        if (!page) page = lay.page
        if (!dpi) dpi = lay.dpi
        if (lay.legend === false) flags.noLegend = true
        if (lay.scalebar === false) flags.noScalebar = true
        if (lay.north === false) flags.noNorth = true
        const first = ((manifest.layers || []).filter(l => l.visible !== false))[0]
        if (!first || !first.source) return { ok: false, error: '工程无可见图层（layers 为空）' }
        const src = String(first.source)
        if (/^([A-Za-z]:[\\/]|\/|\\\\)/.test(src)) path = src
        else {
          // 相对路径锚定工程文件所在目录（非工作区根）；
          // fs.resolve 返回 {displayPath} 对象，须经 processPath 取字符串
          const kyuAbs = fs.processPath(await fs.resolve(await procPath(a.kyu)))
          path = kyuAbs.replace(/[\\/][^\\/]+$/, '') + '/' + src.replace(/\\/g, '/')
        }
      }
      if (!path) return { ok: false, error: '缺 path 或 kyu 参数' }
      await ensureOutDir()
      const out = OUT_DIR + '\\kanyu-layout-' + Date.now() + '.svg'
      const r = await renderLayout(path, out, title, page, dpi, flags, a.style)
      if (!r.run.ok) return { ok: false, error: r.run.stderr.slice(0, 1500), out }
      try {
        const svg = await fs.readText(await fs.resolve(out))
        return { ok: true, out, svg, title: title || '堪舆布局' }
      } catch (e) {
        return { ok: true, out, svg: null, readError: String(e && e.message || e) }
      }
    }

    // 地图框渲染产物读盘（catalog.readImage RPC，第五十轮）：PNG → base64，
    // 供目录页签地图框条目内嵌预览。越界防护：仅限 dsh/output 产物目录内
    // 的 .png——目录清单条目之外的任意路径读取一律拒绝。
    async function readImagePng(path) {
      const p = await procPath(path)
      const abs = fs.processPath(await fs.resolve(p))
      const outAbs = fs.processPath(await fs.resolve(OUT_DIR))
      const norm = (s) => String(s).replace(/\//g, '\\').toLowerCase()
      if (!/\.png$/i.test(abs) || !norm(abs).startsWith(norm(outAbs) + '\\')) {
        return { ok: false, error: '仅限 dsh/output 产物目录内的 .png（渲染产物预览边界）' }
      }
      try {
        const bytes = await fs.readBytes(await fs.resolve(abs), undefined, 16 * 1024 * 1024)
        return { ok: true, png: bytesToBase64(bytes), bytes: bytes.length, name: abs.split(/[\\/]/).pop() }
      } catch (e) { return { ok: false, error: String(e && e.message || e) } }
    }

    // ------ 能力 3：坐标框架 ------
    async function crsReproject(path, from, to, output) {      const p = await procPath(path)
      const args = ['data', 'reproject', '--json', '--from', q(from), '--to', q(to)]
      // kanyu data reproject --output 底层 std::fs::write 不建父目录，先确保 dsh/output 存在
      if (output) { await ensureOutDir(); args.push('--output', q(await procPath(output))) }
      args.push(q(p))
      return runKanyu(args, 180000)
    }

    // EPSG 全库检索（内核 core::crs::search_crs，7507 条）：经 `kanyu crs search`
    // CLI 出口，kind 英文枚举映射中文标签（与 CRS_PRESETS 一致）；CLI 版本过旧
    // 无 crs 子命令时回退本地预设过滤并标注 degraded。
    async function crsSearch(query, limit) {
      const args = ['crs', 'search', '--json', '--limit', String(limit || 20)]
      const qq = String(query || '').trim()
      if (qq) args.push(q(qq))
      const r = await runKanyu(args, 60000)
      const j = parseJsonLoose(r.stdout)
      if (r.ok && Array.isArray(j)) {
        const kindCn = { Geographic: '地理', Projected: '投影', Other: '其他' }
        return {
          ok: true, source: 'kanyu crs search（内核 EPSG 全库 7507 条）',
          results: j.map(c => ({
            code: 'EPSG:' + c.code, name: c.name,
            kind: kindCn[c.kind] || c.kind, unit: c.unit,
          })),
        }
      }
      // 回退：本机 kanyu CLI 无 crs 子命令（v0.22.0 之前），本地预设过滤兜底
      const ql = qq.toLowerCase()
      const hits = CRS_PRESETS.filter(c =>
        !ql || c.code.toLowerCase().includes(ql) || c.name.toLowerCase().includes(ql))
      return {
        ok: true, degraded: true,
        source: '本地预设兜底（kanyu CLI 无 crs 子命令，升级 CLI 后接 EPSG 全库）'
          + (r.stderr ? '；stderr: ' + r.stderr.slice(0, 200) : ''),
        results: hits,
      }
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

    // ------ 能力 5b：工具箱注册表（tooldef 37 工具全库，经 `kanyu tool` CLI 出口） ------
    // 与壳层工具箱面板/MCP 工具面同一单一事实来源；GP_TOOLS 13 白名单为精选
    // 快捷面保持不变。CLI 过旧无 tool 子命令时中文报错指引升级（无本地兜底——
    // 注册表定义在内核，JS 侧不重复造表）。
    async function toolboxList() {
      const r = await runKanyu(['tool', 'list', '--json'], 60000)
      const j = parseJsonLoose(r.stdout)
      if (r.ok && Array.isArray(j)) return { ok: true, source: 'kanyu tool list（core::tooldef 注册表）', tools: j }
      return { ok: false, error: 'kanyu CLI 无 tool 子命令或输出异常（请升级 kanyu CLI 至含 tool 组版本）'
        + (r.stderr ? '；stderr: ' + r.stderr.slice(0, 300) : '') }
    }
    async function toolboxRun(id, params, output) {
      if (!id) return { ok: false, error: '缺少工具 id（toolbox.list 查看注册表）' }
      const args = ['tool', 'run', '--json', q(String(id))]
      const kv = params || {}
      for (const k of Object.keys(kv)) {
        const v = kv[k]
        if (v !== undefined && v !== null && v !== '') args.push('--param', q(k + '=' + v))
      }
      // kanyu tool run --output 单产出底层 std::fs::write 不建父目录，先确保 dsh/output 存在
      if (output) { await ensureOutDir(); args.push('--output', q(await procPath(output))) }
      return runKanyu(args, 300000)
    }

    // ------ 能力 6：地理编辑（GeoJSON 在线编辑内核） ------
    // 对齐 kanyu-edit 内核范式（crates/kanyu-edit/src/history.rs）：命令逆操作
    // 双栈——每个变更算子在应用时同步计算结构化逆操作，按源文件键控入 undo 栈
    // （容量 100——对齐 kanyu-edit History 默认（history.rs:32）、溢出淘汰最旧、
    // 新变更清空 redo 栈）；edit.undo/edit.redo 在两栈
    // 间移动记录并对同一输出文件回写。feature-count 为只读算子，不入栈。
    const EDIT_HISTORY_CAP = 100
    const editHistory = new Map() // 源文件路径 -> { undo: [], redo: [] }（记录含 outPath）
    function historyOf(p) {
      let h = editHistory.get(p)
      if (!h) { h = { undo: [], redo: [] }; editHistory.set(p, h) }
      return h
    }
    // 单一变更入口：正/逆向共用。返回 { ok, error?, summary?, inverse? }，
    // inverse 为结构化逆操作（{ op, args }），仅变更算子产生。
    // feature-insert / attribute-restore / hole-remove 为逆操作内部算子，不进 EDIT_OPS 公开清单。
    // —— AddHole 挖洞校验移植（kanyu-edit ops.rs:330-436 语义 JS 化）——
    // 点-环关系：'in'/'out'/'on'（射线法 + 边界检测，容差 1e-12）
    function pointRingRel(p, ring) {
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a2 = ring[i], b2 = ring[j]
        const cross = (b2[0] - a2[0]) * (p[1] - a2[1]) - (b2[1] - a2[1]) * (p[0] - a2[0])
        if (Math.abs(cross) < 1e-12
          && Math.min(a2[0], b2[0]) - 1e-12 <= p[0] && p[0] <= Math.max(a2[0], b2[0]) + 1e-12
          && Math.min(a2[1], b2[1]) - 1e-12 <= p[1] && p[1] <= Math.max(a2[1], b2[1]) + 1e-12) return 'on'
        if ((a2[1] > p[1]) !== (b2[1] > p[1])
          && p[0] < (b2[0] - a2[0]) * (p[1] - a2[1]) / (b2[1] - a2[1]) + a2[0]) inside = !inside
      }
      return inside ? 'in' : 'out'
    }
    // 线段任意相交（含端点相接/共线重叠——内核按 covers 语义放行边界重叠后显式判负）
    function segTouch(p1, p2, p3, p4) {
      const dd = (a2, b2, c2) => (b2[0] - a2[0]) * (c2[1] - a2[1]) - (b2[1] - a2[1]) * (c2[0] - a2[0])
      const d1 = dd(p3, p4, p1), d2 = dd(p3, p4, p2), d3 = dd(p1, p2, p3), d4 = dd(p1, p2, p4)
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
      const on = (a2, b2, c2) => Math.abs(dd(a2, b2, c2)) < 1e-12
        && Math.min(a2[0], b2[0]) - 1e-12 <= c2[0] && c2[0] <= Math.max(a2[0], b2[0]) + 1e-12
        && Math.min(a2[1], b2[1]) - 1e-12 <= c2[1] && c2[1] <= Math.max(a2[1], b2[1]) + 1e-12
      return on(p3, p4, p1) || on(p3, p4, p2) || on(p1, p2, p3) || on(p1, p2, p4)
    }
    // 洞环合法性：顶点严格在外环内 + 不落在既有洞内 + 边不与外环/既有洞边界相接
    function holeValidate(rings, ring) {
      const ext = rings[0]
      if (!Array.isArray(ext) || ext.length < 4) return '目标面外环为空'
      for (const p of ring) {
        if (pointRingRel(p, ext) !== 'in') return '洞环须完全位于面内（不越出外环、不与既有洞相交）'
      }
      for (let e = 0; e < ring.length - 1; e++) {
        for (let k = 0; k < ext.length - 1; k++) {
          if (segTouch(ring[e], ring[e + 1], ext[k], ext[k + 1])) return '洞环不得与外环或既有洞的边界相接'
        }
      }
      for (const hole of rings.slice(1)) {
        for (const p of ring) {
          if (pointRingRel(p, hole) !== 'out') return '洞环须完全位于面内（不越出外环、不与既有洞相交）'
        }
        for (let e = 0; e < ring.length - 1; e++) {
          for (let k = 0; k < hole.length - 1; k++) {
            if (segTouch(ring[e], ring[e + 1], hole[k], hole[k + 1])) return '洞环不得与外环或既有洞的边界相接'
          }
        }
      }
      return null
    }
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
      } else if (op === 'attributes-replace') {
        // 整行属性替换（对齐 kanyu-edit UpdateProperties，ops.rs:281）：properties
        // 整体覆写（null = 清空属性表）；自逆算子——逆操作即恢复旧属性
        // （含原无属性表的 null 态），redo 路径自动重算新鲜逆操作
        const i = Number(a.index)
        const f = feats[i]
        if (!f) return { ok: false, error: 'index 越界: ' + a.index }
        if (a.properties !== null && (typeof a.properties !== 'object' || Array.isArray(a.properties))) {
          return { ok: false, error: 'attributes-replace 需要 properties（对象或 null）' }
        }
        const old = f.properties === undefined ? null : f.properties
        f.properties = a.properties === undefined ? null : a.properties
        const n = f.properties ? Object.keys(f.properties).length : 0
        return { ok: true, summary: '要素 #' + i + ' 属性已整行替换（' + n + ' 字段）',
          inverse: { op: 'attributes-replace', args: { index: i, properties: old } } }
      } else if (op === 'hole-add') {
        // 面内挖洞（对齐 kanyu-edit AddHole，ops.rs:383）：index + part（Polygon 恒 0，
        // MultiPolygon 为子面下标）+ ring（未闭合自动闭合）；apply 先经 holeValidate
        // 校验（洞环完全位于面内、不与外环/既有洞边界相接），逆操作弹出末环
        const i = Number(a.index)
        const f = feats[i]
        if (!f) return { ok: false, error: 'index 越界: ' + a.index }
        const g = f.geometry
        const part = Number(a.part) || 0
        if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) {
          return { ok: false, error: '目标要素不是面几何——洞只能加在 Polygon/MultiPolygon 上' }
        }
        if (g.type === 'Polygon' && part !== 0) return { ok: false, error: '子面下标越界: part ' + part + '（单面恒 0）' }
        const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates[part]
        if (!Array.isArray(rings)) return { ok: false, error: '子面下标越界: part ' + part }
        let ring = Array.isArray(a.ring) ? a.ring.map((p) => [Number(p[0]), Number(p[1])]) : []
        if (ring.length < 3) return { ok: false, error: '洞环至少需要 3 个顶点（闭合后 4 点）' }
        const h0 = ring[0], hl = ring[ring.length - 1]
        if (h0[0] !== hl[0] || h0[1] !== hl[1]) ring = ring.concat([h0.slice()]) // 自动闭合兜底
        const verr = holeValidate(rings, ring)
        if (verr) return { ok: false, error: verr }
        rings.push(ring)
        return { ok: true, summary: '要素 #' + i + ' 已挖洞（' + ring.length + ' 点，共 ' + rings.length + ' 环）',
          inverse: { op: 'hole-remove', args: { index: i, part } } }
      } else if (op === 'hole-remove') {
        // hole-add 逆操作内部算子（对齐 AddHole::revert）：apply 追加在尾部，逆回即弹出末环
        const i = Number(a.index)
        const f = feats[i]
        if (!f) return { ok: false, error: 'index 越界: ' + a.index }
        const g = f.geometry
        const part = Number(a.part) || 0
        if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return { ok: false, error: '目标要素不是面几何' }
        const rings = g.type === 'Polygon' ? g.coordinates : g.coordinates[part]
        if (!Array.isArray(rings)) return { ok: false, error: '子面下标越界: part ' + part }
        if (rings.length < 2) return { ok: false, error: '面无内环，无法逆回挖洞' }
        const popped = rings.pop()
        return { ok: true, summary: '要素 #' + i + ' 末环已弹出（余 ' + rings.length + ' 环）',
          inverse: { op: 'hole-add', args: { index: i, part, ring: popped } } }
      } else if (op === 'feature-move') {
        // 整要素平移（对齐 kanyu-edit MoveFeature {index,dx,dy}，ops.rs:166）
        const i = Number(a.index)
        const f = feats[i]
        if (!f) return { ok: false, error: 'index 越界: ' + a.index }
        const dx = Number(a.dx), dy = Number(a.dy)
        if (!isFinite(dx) || !isFinite(dy)) return { ok: false, error: 'feature-move 需要数值 dx/dy' }
        // 递归平移任意维度坐标嵌套（Point 至 MultiPolygon 通吃），仅动 x/y、保留 Z/M
        const translateCoords = (c) => {
          if (!Array.isArray(c)) return
          if (typeof c[0] === 'number') { c[0] += dx; c[1] += dy; return }
          for (const cc of c) translateCoords(cc)
        }
        translateCoords(f.geometry && f.geometry.coordinates)
        return { ok: true, summary: '要素 #' + i + ' 已平移 (' + dx + ', ' + dy + ')',
          inverse: { op: 'feature-move', args: { index: i, dx: -dx, dy: -dy } } }
      } else if (op === 'vertex-move') {
        const i = Number(a.feature)
        const f = feats[i]
        if (!f) return { ok: false, error: 'feature 越界: ' + a.feature }
        const gtype = f.geometry && f.geometry.type
        // ringPath 缺省按几何类型分派（修复：旧版恒 [0]，对 LineString/Point 会错误下钻
        // 进首顶点数组）：Polygon→[0]，MultiPolygon/MultiLineString→[0,0]，
        // Point/LineString/MultiPoint→[]（GeomPath 三级定位）
        const ringPath = Array.isArray(a.ringPath) ? a.ringPath
          : gtype === 'Polygon' ? [0]
          : (gtype === 'MultiPolygon' || gtype === 'MultiLineString') ? [0, 0] : []
        let coords = f.geometry && f.geometry.coordinates
        for (const ri of ringPath) {
          if (!Array.isArray(coords)) return { ok: false, error: '几何路径解析失败' }
          coords = coords[Number(ri)]
        }
        const vi = Number(a.vertex)
        if (gtype === 'Point' && ringPath.length === 0) {
          // Point 的 coordinates 本身就是 position，无 vertex 下标层
          if (!Array.isArray(coords) || typeof coords[0] !== 'number') return { ok: false, error: 'Point 几何坐标异常' }
          const oldPos = coords.slice()
          f.geometry.coordinates = [Number(a.x), Number(a.y)].concat(oldPos.slice(2))
          return { ok: true, summary: '要素 #' + i + '（Point）已移至 (' + a.x + ', ' + a.y + ')',
            inverse: { op: 'vertex-move', args: { feature: i, ringPath, vertex: 0, x: oldPos[0], y: oldPos[1] } } }
        }
        if (!Array.isArray(coords) || !Array.isArray(coords[vi])) return { ok: false, error: 'vertex 越界: ' + a.vertex }
        const oldPos = coords[vi].slice()
        // 保留 Z/M：仅覆写 x/y（修复：旧版恒写二维，三维顶点高程被丢弃）
        coords[vi] = [Number(a.x), Number(a.y)].concat(oldPos.slice(2))
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
    // 写失败提示规范化：DSH fs 服务 workspace-write 模式只许写会话工作区内
    //（3080 桥实测：读放行、写报 file access denied）——给出可操作指引而非裸错误。
    function writeHint(e) {
      const m = String(e && e.message || e)
      return m.indexOf('workspace-write') >= 0
        ? m + '（DSH fs 服务 workspace-write 模式：仅会话工作区内可写——请改用工作区内输出路径，或由拉取/CLI 产物先在工作区生成副本再编辑）'
        : m
    }
    async function editWriteFc(outPath, fc) {
      try {
        const target = await fs.resolve(outPath)
        await fs.writeText(target, JSON.stringify(fc))
        return null
      } catch (e) { return writeHint(e) }
    }
    // 顶点编辑画布数据源：原样几何（顶点下标必须与文件一致——scene3d.data
    // 有抽稀预算不可用），上限 200 要素防巨型图层卡画布。
    function walkCoords(c, fn) {
      if (!Array.isArray(c)) return
      if (typeof c[0] === 'number') { fn(c); return }
      for (const s of c) walkCoords(s, fn)
    }
    async function editGeometry(path, maxFeatures) {
      const p = await procPath(path)
      const r = await editReadFc(p)
      if (r.error) return { ok: false, error: r.error }
      const cap = Math.min(Number(maxFeatures) || 200, 1000)
      const feats = r.fc.features.slice(0, cap)
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const f of feats) walkCoords(f && f.geometry && f.geometry.coordinates, (xy) => {
        const x = Number(xy[0]), y = Number(xy[1])
        if (!isFinite(x) || !isFinite(y)) return
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      })
      return { ok: true, source: p, count: feats.length, total: r.fc.features.length,
        bbox: isFinite(minX) ? [minX, minY, maxX, maxY] : null, features: feats }
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
      const werr = await editWriteFc(outPath, fc)
      if (werr) return { ok: false, error: '写回失败: ' + werr }
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
      const werr2 = await editWriteFc(rec.outPath, r.fc)
      if (werr2) { stack.push(rec); return { ok: false, error: '写回失败: ' + werr2 } }
      // undo：记录移入 redo 栈；redo：重算新鲜逆操作后移回 undo 栈
      if (dir === 'undo') h.redo.push(rec)
      else h.undo.push({ op: rec.op, args: rec.args, inverse: m.inverse, outPath: rec.outPath, label: rec.label })
      return { ok: true, summary: (dir === 'undo' ? '已撤销: ' : '已重做: ') + rec.label, output: rec.outPath,
        history: { undo: h.undo.length, redo: h.redo.length } }
    }

    // ------ 能力 7：3D 地理（挤出体数据制备，Client canvas 软件 3D 管线绘制） ------
    async function scene3dData(path, heightField, maxFeatures, colorField, symbology) {
      if (!fs) return { ok: false, error: 'fs service 不可用' }
      const p = await procPath(path)
      let text
      try {
        const target = await fs.resolve(p)
        text = await fs.readText(target)
      } catch (e) { return { ok: false, error: '读取失败（3D 数据源目前支持 GeoJSON）: ' + String(e && e.message || e) } }
      let fc
      try { fc = JSON.parse(text) } catch (e) { return { ok: false, error: 'GeoJSON 解析失败' } }
      // 符号化编辑模型着色（第五十四轮）：symbology 经 symToRule 投影后逐要素
      // 派生 hex 色（categorical 命中色/default；graduated 按 stops 末档命中，
      // 内核 color_for 同语义）；categorical 自带字段时接管 colorField。
      const rule = symbology && typeof symbology === 'object' ? symToRule(symbology) : null
      if (rule && rule.type === 'categorical' && rule.field) colorField = rule.field
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
        const feat = {
          ring: pts,
          geom: g.type,
          height: isFinite(h) ? h : 10,
          name: props.name || props.Name || props.NAME || null,
        }
        // 分类着色（壳层 symbology 唯一值语义的 3D 轻量投影）：colorField 给
        // 字段名时逐要素带类别值，响应带去重 categories 清单（上限 12 类，
        // 超出归入「其他」），配色由 Client 按类别哈希 HSL 取色。
        if (colorField) {
          const cv = props[colorField]
          if (cv !== undefined && cv !== null) feat.cat = String(cv)
        }
        // 逐要素符号化取色（rule 存在时优先于 Client 类别哈希色）
        if (rule) {
          if (rule.type === 'categorical') {
            const key = rule.field ? String(props[rule.field] != null ? props[rule.field] : '') : ''
            feat.color = (rule.field && rule.colors[key]) || rule.default || null
          } else if (rule.type === 'graduated') {
            const v = Number(props[rule.field])
            if (isFinite(v)) {
              for (const st of rule.stops) { if (v >= st[0]) feat.color = st[1] }
            }
          }
          if (feat.color == null) delete feat.color
        }
        out.push(feat)
      }
      let categories = null
      if (colorField) {
        const seen = []
        for (const f of out) {
          if (f.cat === undefined) continue
          if (!seen.includes(f.cat)) {
            if (seen.length >= 12) { f.cat = '其他' } else seen.push(f.cat)
          }
        }
        if (seen.length >= 12 && !seen.includes('其他')) seen.push('其他')
        categories = seen
      }
      // 类别色映射（符号化 categorical 时图例/棱柱用模型色而非哈希色）
      let catColors = null
      if (rule && rule.type === 'categorical' && categories) {
        catColors = {}
        for (const c of categories) catColors[c] = rule.colors[c] || rule.default || '#888888'
      }
      // 高度范围（挤出量级摘要）：逐要素 height 已归一（缺字段取 10），顺手累积
      let minH = Infinity, maxH = -Infinity
      for (const f of out) { if (f.height < minH) minH = f.height; if (f.height > maxH) maxH = f.height }
      return {
        ok: true, source: p, heightField: hf,
        colorField: colorField || null, categories, catColors,
        symbologyMode: rule && symbology.mode ? String(symbology.mode) : null,
        heightRange: out.length ? [minH, maxH] : null,
        count: out.length, total: feats.length,
        bbox: isFinite(minX) ? [minX, minY, maxX, maxY] : null,
        features: out,
      }
    }

    // ------ 能力 4 延伸：服务链接（WFS GetCapabilities 图层发现，对齐壳层 services.rs） ------
    // parseCapabilities 为壳层同名纯函数的 JS 移植：`<FeatureType>` 块内首个
    // Name/Title 文本提取 + 实体反转义 + 命名空间前缀剥离（不引 XML 库——
    // 目标文档结构扁平，主流 WFS 1.1/2.0 足够；完整解析无收益）。
    function xmlUnescape(s) {
      return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    }
    function extractBlocks(xml, local) {
      const out = []
      const re = new RegExp('<(?:[\\w.-]+:)?' + local + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?' + local + '>', 'g')
      let m
      while ((m = re.exec(xml))) out.push(m[1])
      return out
    }
    function parseCapabilities(xml) {
      const out = []
      for (const block of extractBlocks(xml, 'FeatureType')) {
        const names = extractBlocks(block, 'Name')
        if (!names.length) continue
        const name = xmlUnescape(names[0].trim())
        if (!name) continue
        const titles = extractBlocks(block, 'Title')
        out.push({ name, title: titles.length ? xmlUnescape(titles[0].trim()) : null })
      }
      return out
    }
    async function servicesDiscover(url, xml) {
      // 离线解析路径（测试/调试）：直接给 capabilities XML 文本，不触网
      if (xml) {
        const layers = parseCapabilities(xml)
        return layers.length
          ? { ok: true, source: '(inline xml)', count: layers.length, layers }
          : { ok: false, error: '未在 XML 中发现任何图层（FeatureType）' }
      }
      if (!url || !/^https?:\/\//.test(url)) return { ok: false, error: '服务基址须为 http(s) URL' }
      const sep = url.indexOf('?') >= 0 ? '&' : '?'
      const capsUrl = url + sep + 'service=WFS&request=GetCapabilities&acceptVersions=2.0.0,1.1.0'
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 10000) // 壳层契约：10s 超时
        const resp = await fetch(capsUrl, { signal: ctrl.signal, redirect: 'follow' })
        clearTimeout(timer)
        const layers = parseCapabilities(await resp.text())
        if (!layers.length) return { ok: false, error: '未在响应中发现任何图层（FeatureType）——请核对基址为 WFS 服务' }
        return { ok: true, source: capsUrl, count: layers.length, layers }
      } catch (e) {
        return { ok: false, error: 'GetCapabilities 拉取失败: ' + (e && e.message || e) }
      }
    }

    // buildGetFeatureUrl 对齐壳层 services.rs：join_query（基址去尾 ?/& 后补
    // ? 或 &）+ typeNames 原样拼接 + GeoJSON 输出优先。
    function joinQuery(base) {
      const b = String(base).trim().replace(/[?&]+$/, '')
      return b + (b.indexOf('?') >= 0 ? '&' : '?')
    }
    function buildGetFeatureUrl(base, typeName) {
      return joinQuery(base) + 'service=WFS&request=GetFeature&version=2.0.0&typeNames='
        + String(typeName || '').trim() + '&outputFormat=application/json'
    }
    // WFS GetFeature 拉取落 GeoJSON 图层（壳层 v1 语义）；`data` 参数为离线
    // 路径（测试/调试直接给 GeoJSON 文本，不触网）。输出缺省落 output/ 下。
    async function servicesFetch(url, layer, output, data) {
      if (!fs) return { ok: false, error: 'fs service 不可用' }
      if (!layer || !String(layer).trim()) return { ok: false, error: '缺少图层名（typeNames）' }
      const typeName = String(layer).trim()
      const reqUrl = data ? '(inline geojson)' : buildGetFeatureUrl(url || '', typeName)
      let text
      if (data) {
        text = data
      } else {
        if (!url || !/^https?:\/\//.test(url)) return { ok: false, error: '服务基址须为 http(s) URL' }
        try {
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 10000) // 壳层契约：10s 超时
          const resp = await fetch(reqUrl, { signal: ctrl.signal, redirect: 'follow' })
          clearTimeout(timer)
          text = await resp.text()
        } catch (e) {
          return { ok: false, error: 'GetFeature 拉取失败: ' + (e && e.message || e) }
        }
      }
      let fc
      try {
        fc = JSON.parse(text)
        if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) throw new Error('根不是 FeatureCollection')
      } catch (e) {
        return { ok: false, error: 'GetFeature 响应不是 GeoJSON FeatureCollection: ' + String(e && e.message || e) }
      }
      const out = output || ('output/wfs_' + typeName.replace(/[^\w.-]+/g, '_') + '.geojson')
      if (!output) await ensureOutDir()
      try {
        const target = await fs.resolve(out, { cwd: WORKSPACE })
        await fs.writeText(target, JSON.stringify(fc))
        return { ok: true, source: reqUrl, output: fs.processPath ? fs.processPath(target) : out,
          count: fc.features.length }
      } catch (e) {
        return { ok: false, error: '落盘失败: ' + writeHint(e) }
      }
    }

    // buildGetmapUrl 对齐壳层 services.rs build_getmap_url（WMS 1.3.0 +
    // CRS=EPSG:4326，bbox 经度/纬度序六位小数——宽限服务器通用；严格 1.3.0
    // 轴序服务器属壳层已声明的已知边界）。
    function buildGetmapUrl(base, layer, bbox, w, h) {
      const bb = (bbox && bbox.length === 4 ? bbox : [-180, -90, 180, 90]).map((v) => Number(v).toFixed(6))
      return joinQuery(base) + 'service=WMS&request=GetMap&version=1.3.0&layers='
        + String(layer || '').trim() + '&styles=&format=image/png&transparent=false&crs=EPSG:4326&bbox='
        + bb.join(',') + '&width=' + (w || 640) + '&height=' + (h || 320)
    }
    // WMS GetMap 底图（壳层 v2 语义）；urlOnly 为离线契约路径（只构造地址
    // 不触网）。联机路径拉 PNG → base64 回传 Client 内联预览。
    async function servicesWms(url, layer, bbox, width, height, urlOnly) {
      if (!layer || !String(layer).trim()) return { ok: false, error: '缺少图层名（layers）' }
      if (!url || !/^https?:\/\//.test(url)) return { ok: false, error: '服务基址须为 http(s) URL' }
      const reqUrl = buildGetmapUrl(url, layer, bbox, width, height)
      if (urlOnly) return { ok: true, source: reqUrl }
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 10000) // 壳层契约：10s 超时
        const resp = await fetch(reqUrl, { signal: ctrl.signal, redirect: 'follow' })
        clearTimeout(timer)
        const buf = Buffer.from(await resp.arrayBuffer())
        const ct = String(resp.headers.get('content-type') || '')
        if (!ct.includes('image')) return { ok: false, error: 'GetMap 响应非图像（' + (ct || '未知 content-type') + '）——请核对图层名' }
        return { ok: true, source: reqUrl, png: buf.toString('base64'), bytes: buf.length }
      } catch (e) {
        return { ok: false, error: 'GetMap 拉取失败: ' + (e && e.message || e) }
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
    harness.handle('services.discover', async (a) => servicesDiscover(a && a.url, a && a.xml))
    harness.handle('services.fetch', async (a) => servicesFetch(a && a.url, a && a.layer, a && a.output, a && a.data))
    harness.handle('services.wms', async (a) => servicesWms(a && a.url, a && a.layer, a && a.bbox, a && a.width, a && a.height, !!(a && a.urlOnly)))
    harness.handle('data.info', async (a) => dataInfo(a && a.path))
    harness.handle('data.query', async (a) => dataQuery(a && a.path, a && a.filter, a && a.output))
    harness.handle('data.validate', async (a) => dataValidate(a && a.path))
    harness.handle('data.preview', async (a) => dataPreview(a && a.path, a && a.limit))
    harness.handle('data.calc', async (a) => dataCalc(a && a.path, a && a.target, a && a.expr, a && a.output))
    harness.handle('render.map', async (a) => renderMap(a && a.path, a && a.theme, a && a.width, a && a.height, a && a.style, a && a.symbology))
    harness.handle('render.layout', async (a) => layoutPreview(a))
    harness.handle('catalog.readImage', async (a) => readImagePng(a && a.path))
    harness.handle('style.get', async (a) => styleGet(a && a.kyu, a && a.layerId))
    harness.handle('style.set', async (a) => styleSet(a && a.kyu, a && a.layerId, a && a.style))
    harness.handle('style.list', async (a) => styleList(a && a.kyu))
    harness.handle('crs.presets', async () => ({ ok: true, presets: CRS_PRESETS }))
    harness.handle('crs.reproject', async (a) => crsReproject(a && a.path, a && a.from, a && a.to, a && a.output))
    harness.handle('crs.search', async (a) => crsSearch(a && a.query, a && a.limit))
    harness.handle('geoprocess.list', async () => ({ ok: true, tools: GP_TOOLS }))
    harness.handle('toolbox.list', async () => toolboxList())
    harness.handle('toolbox.run', async (a) => toolboxRun(a && a.id, a && a.params, a && a.output))
    harness.handle('geoprocess.run', async (a) => geoprocessRun(a && a.tool, a && a.input, a && a.input2, a && a.output, a && a.params))
    harness.handle('edit.ops', async () => ({ ok: true, ops: EDIT_OPS }))
    harness.handle('edit.geometry', async (a) => editGeometry(a && a.path, a && a.maxFeatures))
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
    harness.handle('scene3d.data', async (a) => scene3dData(a && a.path, a && a.heightField, a && a.maxFeatures, a && a.colorField, a && a.symbology))

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
      description: '扫描目录下的 GIS 数据文件（geojson/shp/kml/dxf/dwg/fgb/parquet/kdb/kyu 等，对齐内核格式注册表），返回五分类计数与路径/类型/大小清单；给出 url 时走服务链接：仅 url 为 WFS GetCapabilities 图层发现，url+layer 为 GetFeature 拉取落 GeoJSON 图层；xml/data 为离线调试直通（给文本不触网）。',
      parameters: {
        dir: { type: 'string', description: '起始目录（缺省为会话工作区根）' },
        depth: { type: 'number', description: '递归深度（默认 3）' },
        url: { type: 'string', description: 'WFS/WMS 服务基址（给出时忽略 dir/depth）' },
        layer: { type: 'string', description: '服务图层名（WFS typeNames / WMS layers）' },
        kind: { type: 'string', description: '服务类型：wfs（默认）/ wms（url+layer 时拉 GetMap 底图）' },
        output: { type: 'string', description: 'WFS 拉取输出路径（缺省 output/wfs_<图层>.geojson）' },
        xml: { type: 'string', description: '离线调试：直接给 GetCapabilities XML 文本（不触网，url 可省）' },
        data: { type: 'string', description: '离线调试：直接给 GetFeature GeoJSON 文本（不触网，url 可省）' },
        bbox: { type: 'array', items: { type: 'number' }, description: 'WMS 底图范围 [minx,miny,maxx,maxy]（缺省全球；可据 kanyu_data info 的 extent 给真实范围）' },
        width: { type: 'number', description: 'WMS 底图宽像素（默认 640）' },
        height: { type: 'number', description: 'WMS 底图高像素（默认 320）' },
        urlOnly: { type: 'boolean', description: 'WMS 只构造 GetMap 地址不拉取（离线契约路径）' },
      },
      async execute(args) {
        if (args.url && args.layer && args.kind === 'wms') {
          const w = await servicesWms(args.url, args.layer, args.bbox, args.width, args.height, !!args.urlOnly)
          if (!w.ok) return 'WMS 底图拉取失败: ' + w.error
          if (args.urlOnly) return 'WMS GetMap 地址（' + args.layer + '，仅构造未拉取）：' + w.source
          return 'WMS 底图 ' + args.layer + ' GetMap 拉取成功：' + w.bytes + ' 字节 PNG（' + (args.width || 640) + '×' + (args.height || 320) + '，EPSG:4326；来源：' + w.source + '；内联预览在工作台目录页签服务链接区）'
        }
        if ((args.url || args.data) && args.layer) {
          const f = await servicesFetch(args.url, args.layer, args.output, args.data)
          if (!f.ok) return 'WFS 图层拉取失败: ' + f.error
          return 'WFS 图层 ' + args.layer + ' 已拉取 ' + f.count + ' 个要素 → ' + f.output + '（来源：' + f.source + '；可继续作为 kanyu_data/kanyu_render/kanyu_edit 的 path 接力检视/渲染/编辑）'
        }
        if (args.url || args.xml) {
          const d = await servicesDiscover(args.url, args.xml)
          if (!d.ok) return 'WFS 图层发现失败: ' + d.error
          const lines = d.layers.slice(0, 60).map(l => l.name + (l.title ? '  —— ' + l.title : ''))
          return 'WFS 服务 ' + d.source + ' 发现 ' + d.count + ' 个图层' + (d.count > 60 ? '（前 60 条）' : '') + ':\n' + lines.join('\n')
            + '\n拉取图层：本工具 url + layer=<名称>（WMS 底图加 kind=wms）'
        }
        const r = await catalogList(args.dir, args.depth)
        if (!r.ok) return '目录扫描失败: ' + r.error
        const lines = r.items.slice(0, 80).map(i => i.ext.toUpperCase().padEnd(8) + ' ' + (i.size === null ? '-' : Math.round(i.size / 1024) + 'KB').padStart(9) + '  ' + shortPath(i.path))
        const catLine = (r.categories || []).map(c => c.name + ' ' + c.count).join(' · ')
        return '目录 ' + r.root + ' 共 ' + r.count + ' 个 GIS 数据文件（五分类：' + catLine + '）' + (r.count > 80 ? '（前 80 条）' : '') + ':\n' + lines.join('\n')
      },
    })

    textTool({
      name: 'kanyu_data',
      description: '读取 GIS 数据：action=info 检视（格式/要素数/字段清单）、query 属性查询（filter 如 "height > 50"；带 output 则结果落盘 GeoJSON 并返回命中计数确认，产出可继续作为 path 传给本工具/kanyu_render/kanyu_edit）、validate 宗地 TXT 质检、preview 属性表预览（字段并集 + 前 N 行，纯读面不经 CLI）、calc 字段计算器（attrcalc 内核：expr 表达式逐要素求值写入 target 字段，不存在则新建；支持 +-*/%、比较、and/or/not、round/upper/concat/coalesce 等函数与 $area/$length/$x/$y 几何虚列）。',
      parameters: {
        action: { type: 'string', required: true, description: 'info | query | validate | preview | calc' },
        path: { type: 'string', required: true, description: '数据文件路径' },
        filter: { type: 'string', description: 'query 时的过滤表达式："field op value"，op ∈ == != > >= < <=' },
        output: { type: 'string', description: 'query/calc 结果输出路径（GeoJSON，可选；给出则落盘并回执要素数，缺省打印结果）' },
        limit: { type: 'number', description: 'preview 时的行数上限（默认 50，最大 200）' },
        target: { type: 'string', description: 'calc 时的目标字段（不存在则新建，存在则覆盖）' },
        expr: { type: 'string', description: 'calc 时的表达式（如 "[height] * 2" 或 "$area / 10000"）' },
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
          : args.action === 'calc' ? await dataCalc(args.path, args.target || '', args.expr || '', args.output)
          : args.action === 'validate' ? await dataValidate(args.path)
          : await dataInfo(args.path)
        // query/calc 落盘分支：stdout 为空，要素数在 stderr「已写出 N 个要素 → path」，
        // 模型侧须拿到确认文本而非空串（对齐客户端 runQuery 语义）
        if ((args.action === 'query' || args.action === 'calc') && args.output && r.ok) {
          const m = /已写出 (\d+) 个要素 → (.+)/.exec(r.stderr || '')
          const what = args.action === 'calc' ? '字段计算完成（' + (args.target || '?') + '）：' : '查询完成：命中 '
          return m ? what + m[1] + ' 要素 → 已写出: ' + m[2].trim() + '（可继续作为 path 检视/渲染/编辑）'
            : what + '已写出: ' + args.output
        }
        const j = parseJsonLoose(r.stdout)
        if (j) return JSON.stringify(j).slice(0, 6000)
        return r.ok ? r.stdout.slice(0, 6000) : '失败(exit ' + r.exitCode + '): ' + r.stderr.slice(0, 2000)
      },
    })

    textTool({
      name: 'kanyu_render',
      description: '离屏渲染 GIS 数据为地图 PNG（晨山 light/夜观星 dark 主题，支持属性驱动符号化）；layout=true 时走布局排版（A4 页面 + 标题/图例/比例尺/指北针，SVG 或 PNG）。返回图片落盘路径，可用 read_image 查看。',
      parameters: {
        path: { type: 'string', required: true, description: '数据文件路径' },
        theme: { type: 'string', description: 'light（晨山）| dark（夜观星），默认 light' },
        width: { type: 'number', description: '宽度像素（默认 800，layout 模式忽略）' },
        height: { type: 'number', description: '高度像素（默认 600，layout 模式忽略）' },
        style: { type: 'object', description: '属性驱动符号化（StyleRule）：分级 {"type":"graduated","field":"height","stops":[[阈值,"#RRGGBB"],…]（严格升序）}；唯一值 {"type":"categorical","field":"usage","colors":{"类别":"#RRGGBB"},"default":"#888888"}' },
        symbology: { type: 'object', description: '符号化编辑模型（LayerSymbology，.kyu 工程持久化格式，Host 投影为 StyleRule；style 优先于本参数）：单色 {"mode":"single","color":[R,G,B]}；唯一值 {"mode":"categorical","field":"usage","colors":[["类别",[R,G,B]],…],"other":[R,G,B]}；分级 {"mode":"graduated","field":"h","breaks":[断点,…]（严格升序）,"ramp":"Jade|Amber|Slate"}' },
        layout: { type: 'boolean', description: 'true 走布局排版（kanyu render layout）：A4 页面 + 标题/图例/比例尺/指北针' },
        title: { type: 'string', description: 'layout 模式标题（默认「堪舆布局」）' },
        page: { type: 'string', description: 'layout 页面：a4l（横，默认）| a4p（竖）' },
        dpi: { type: 'number', description: 'layout PNG 分辨率（默认 96；输出 .png 时生效）' },
        out: { type: 'string', description: 'layout 输出路径（可选；.svg/.png 按扩展名，缺省落 dsh/output/*.svg）' },
      },
      async execute(args) {
        if (args.layout) {
          const r = await renderLayout(args.path, args.out, args.title, args.page, args.dpi,
            { noLegend: args.noLegend, noScalebar: args.noScalebar, noNorth: args.noNorth, theme: args.theme }, args.style, args.symbology)
          if (!r.run.ok) return '排版失败(exit ' + r.run.exitCode + '): ' + r.run.stderr.slice(0, 2000)
          return '排版完成: ' + r.out + '（可 read_image 查看）'
        }
        const r = await renderMap(args.path, args.theme, args.width, args.height, args.style, args.symbology)
        if (!r.run.ok) return '渲染失败(exit ' + r.run.exitCode + '): ' + r.run.stderr.slice(0, 2000)
        return '渲染完成: ' + r.out + (r.pngBase64 ? '（PNG ' + Math.round(r.pngBase64.length * 3 / 4 / 1024) + 'KB，可 read_image 查看）' : '（图片读取失败）')
      },
    })

    textTool({
      name: 'kanyu_crs',
      description: '坐标框架：action=search EPSG 全库检索（7507 条，按代码/名称匹配）；action=presets 列出常用坐标系；action=reproject 执行投影变换（EPSG:xxxx ↔ EPSG:xxxx）。',
      parameters: {
        action: { type: 'string', required: true, description: 'search | presets | reproject' },
        query: { type: 'string', description: 'search 时的检索词（代码子串如 4547，或名称片段如 CGCS2000；缺省返回常用精选）' },
        limit: { type: 'number', description: 'search 结果上限（默认 20）' },
        path: { type: 'string', description: 'reproject 时的数据文件路径' },
        from: { type: 'string', description: '源 CRS（如 EPSG:4326）' },
        to: { type: 'string', description: '目标 CRS（如 EPSG:4547）' },
        output: { type: 'string', description: 'reproject 输出路径（可选；给出则落盘 GeoJSON 并回执要素数，缺省打印）' },
      },
      async execute(args) {
        if (args.action === 'search') {
          const s = await crsSearch(args.query, args.limit)
          if (!s.results.length) return '无匹配坐标系（' + s.source + '）'
          return '坐标系检索（' + s.source + '）:\n'
            + s.results.map(c => c.code + '  ' + c.name + '（' + c.kind + (c.unit ? '，' + c.unit : '') + '）').join('\n')
        }
        if (args.action === 'presets') {
          return '常用坐标系:\n' + CRS_PRESETS.map(c => c.code + '  ' + c.name + '（' + c.kind + '）').join('\n')
        }
        const r = await crsReproject(args.path, args.from, args.to, args.output)
        const j = parseJsonLoose(r.stdout)
        if (j) return JSON.stringify(j).slice(0, 4000)
        // 落盘分支：stdout 为空，要素数在 stderr「已写出 N 个要素 → path」，
        // 模型侧回执带计数（对齐客户端 runReproject 语义）
        if (r.ok && args.output) {
          const m = /已写出 (\d+) 个要素 → (.+)/.exec(r.stderr || '')
          return '投影变换完成：' + (args.from || '?') + ' → ' + (args.to || '?') + '，'
            + (m ? m[1] : '?') + ' 要素 → 已写出: ' + (m ? m[2].trim() : args.output)
            + '（可继续作为 path 检视/渲染/编辑）'
        }
        return r.ok ? r.stdout.slice(0, 4000) : '失败: ' + r.stderr.slice(0, 2000)
      },
    })

    textTool({
      name: 'kanyu_geoprocess',
      description: '地理处理工具箱（对齐 QGIS/ArcGIS 语义）：精选 13 工具 buffer/dissolve/simplify/centroid/convexhull/deleteholes/explode/overlay/sjoin/zonal/stats/measure/topology（kanyu analysis 出口）；tool 给注册表 id 则走 core::tooldef 37 工具全库（kanyu tool 出口，注册表参数经 params 键值透传，键名以 toolbox.list/`kanyu tool list --json` 参数表为准，如 mean_coordinates/bounding_boxes/merge/split_by_field/create_grid）。',
      parameters: {
        tool: { type: 'string', required: true, description: '工具 id：精选 ' + GP_TOOLS.map(t => t.id).join('/') + '；或 tooldef 注册表全库 id' },
        input: { type: 'string', required: true, description: '输入图层路径（注册表分支自动映射为 layer 参数）' },
        input2: { type: 'string', description: '第二输入图层（精选面 overlay/sjoin/zonal 必填；注册表分支请经 params 给具名键）' },
        output: { type: 'string', description: '输出路径（可选，缺省落 dsh/output/）' },
        params: { type: 'object', additionalProperties: true, description: '工具参数键值（如 {"distance": 100}；注册表分支按参数表键名，如 {"predicate":"intersects"}）' },
      },
      async execute(args) {
        // 双轨分流：精选 13 白名单走 GP_TOOLS（参数形状对齐 kanyu analysis）；
        // 其余 id 走 tooldef 注册表全库（toolbox.run → kanyu tool run）。
        // 产出回执：stderr「已写出 N 个要素 → path」共用契约（与客户端 tbRun
        // 同源）——产图层工具回执附写出清单，模型可拿路径继续接力。
        const writesSummary = (stderr) => {
          const writes = [...String(stderr || '').matchAll(/已写出 (\d+) 个要素 → (.+)/g)]
          if (!writes.length) return ''
          return '\n产出: ' + writes.map(w => w[1] + ' 要素 → ' + w[2].trim()).join('；')
            + '（可继续作为 input/path 接力检视/渲染/编辑）'
        }
        if (!GP_TOOLS.some(t => t.id === args.tool)) {
          const params = Object.assign({}, args.params)
          // 便捷映射：input → layer（params 未显式给 layer 时）；第二输入
          // 注册表键名各异（overlay/join/values/points/layer2），不猜——
          // 引导模型按参数表具名传 params。
          if (args.input && params.layer === undefined) params.layer = args.input
          const r = await toolboxRun(args.tool, params, args.output)
          const j = parseJsonLoose(r.stdout)
          const head = r.ok ? '工具 ' + args.tool + ' 完成（注册表全库）' : '工具 ' + args.tool + ' 失败(exit ' + r.exitCode + ')'
          return head + writesSummary(r.ok ? r.stderr : '') + '\n' + (j ? JSON.stringify(j).slice(0, 4000) : (r.ok ? r.stdout.slice(0, 4000) : r.stderr.slice(0, 2000)))
        }
        const r = await geoprocessRun(args.tool, args.input, args.input2, args.output, args.params)
        const j = parseJsonLoose(r.stdout)
        const head = r.ok ? '工具 ' + args.tool + ' 完成' : '工具 ' + args.tool + ' 失败(exit ' + r.exitCode + ')'
        return head + writesSummary(r.ok ? r.stderr : '') + '\n' + (j ? JSON.stringify(j).slice(0, 4000) : (r.ok ? r.stdout.slice(0, 4000) : r.stderr.slice(0, 2000)))
      },
    })

    textTool({
      name: 'kanyu_edit',
      description: '地理编辑（GeoJSON 在线编辑内核，对齐 kanyu-edit 命令逆操作双栈）：feature-count/feature-delete/feature-add/feature-move/attribute-set/attribute-delete/attributes-replace/vertex-move/hole-add；vertex-move 的 ringPath 缺省按几何类型分派（面[0]/多面与多线[0,0]/线与点[]，Point 无需 vertex 下标），仅覆写 x/y、保留 Z/M；attributes-replace 整行属性替换（对齐 kanyu-edit UpdateProperties：properties 整体覆写，null 清空属性表，自逆操作）；hole-add 面内挖洞（对齐 kanyu-edit AddHole：ring 未闭合自动闭合，洞环须完全位于面内且不与外环/既有洞边界相接，part 单面恒 0）；默认写出 .edited.geojson，inPlace=true 原地修改；变更入 undo 栈，撤销/重做经 edit.undo/edit.redo RPC（工作台编辑页签有按钮）；回执附撤销/重做栈深度，可据此提示模型侧回滚步数。',
      parameters: {
        path: { type: 'string', required: true, description: 'GeoJSON 文件路径' },
        op: { type: 'string', required: true, description: '编辑算子：' + EDIT_OPS.join('/') },
        args: { type: 'object', additionalProperties: true, description: '算子参数（如 {"index":0}、{"index":0,"dx":100,"dy":50}、{"field":"height","value":30}、{"feature":0,"ringPath":[0],"vertex":2,"x":113.5,"y":34.2}、{"index":0,"properties":{"name":"改"}}、{"index":0,"ring":[[2,2],[4,2],[4,4],[2,4]]}）' },
        inPlace: { type: 'boolean', description: 'true 原地覆盖（默认 false 写 .edited.geojson）' },
      },
      async execute(args) {
        const r = await editApply(args.path, args.op, args.args, !!args.inPlace)
        if (!r.ok) return '编辑失败: ' + r.error
        const hist = r.history ? '\n撤销栈 ' + r.history.undo + ' 步 / 重做栈 ' + r.history.redo + ' 步（可经 edit.undo/edit.redo RPC 或工作台编辑页签回滚）' : ''
        return r.summary + (r.output ? '\n输出: ' + r.output : '') + hist
      },
    })

    textTool({
      name: 'kanyu_scene3d',
      description: '3D 地理：从 GeoJSON 制备挤出体场景数据（按高度字段拉伸棱柱，yaw/pitch 斜投影 + 背面剔除 + 纵深排序，对齐内核 scene3d.rs 软件管线），返回场景摘要；完整交互式 3D 视图在组件 Client 面板。',
      parameters: {
        path: { type: 'string', required: true, description: 'GeoJSON 文件路径' },
        heightField: { type: 'string', description: '高度字段名（默认 height，无该字段取 10）' },
        maxFeatures: { type: 'number', description: '最大要素数（默认 300）' },
        colorField: { type: 'string', description: '分类着色字段（可选；逐要素带类别值 + 响应带 categories 清单，上限 12 类，Client 3D 视图按类别着色）' },
        symbology: { type: 'object', description: '符号化编辑模型着色（LayerSymbology，同 kanyu_render symbology 语义）：single 全要素同色 / categorical 按字段命中色（自带字段时接管 colorField，响应带 catColors 类别色映射）/ graduated 按 breaks+ramp 色带逐要素取色' },
      },
      async execute(args) {
        const r = await scene3dData(args.path, args.heightField, args.maxFeatures, args.colorField, args.symbology)
        if (!r.ok) return '3D 数据制备失败: ' + r.error
        return '3D 场景: ' + r.count + '/' + r.total + ' 要素，高度字段 ' + r.heightField
          + (r.heightRange ? '，高度范围 ' + r.heightRange[0] + '~' + r.heightRange[1] : '') + '，bbox=' + JSON.stringify(r.bbox)
          + (r.categories ? '，着色字段 ' + r.colorField + '（' + r.categories.length + ' 类: ' + r.categories.join('/') + '）' : '')
          + (r.symbologyMode ? '，符号化 ' + r.symbologyMode + ' 逐要素取色' : '')
          + '；交互式 3D 视图：工作台 3D 页签（该数据为当前图层时联动加载）'
      },
    })

    console.log('kanyu-gis Host 半已激活：7 大能力 RPC + 8 动态工具，工作区 ' + WORKSPACE)
  },
}

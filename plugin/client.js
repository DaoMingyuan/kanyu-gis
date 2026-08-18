// ============================================================================
// 堪舆 GIS × DeepSeek Harness 组件 —— Client 半（浏览器侧）
// ----------------------------------------------------------------------------
// 职责：DSH Web GUI 中的「堪舆 GIS 工作台」——
//   · 会话头部动作行注册「🧭 堪舆GIS」开关按钮（conversation.session.header.actions）
//   · 全局浮层注册工作台窗口（shell.overlay），七页签对应七大能力域：
//       目录 / 数据 / 地图 / 坐标 / 处理 / 编辑 / 3D
//   · cordis_run 卡片注册组件状态条（tool.view.cordis, key=self）
//   所有业务调用经 host.call（Package 私有 JSON RPC）到 Host 半的 kanyu CLI 后端。
//
// 运行环境约束：纯 JavaScript + React.createElement（无 JSX/import）；
// 可用内建：ctx / React（createElement/useState/useEffect）/ host / styles / console。
// ============================================================================

const CSS = `
.kyg-panel{position:fixed;right:16px;top:56px;width:580px;max-height:78vh;display:flex;flex-direction:column;
  background:rgba(21,26,36,.97);color:#e8ecf4;border:1px solid rgba(200,97,74,.45);border-radius:12px;
  box-shadow:0 12px 40px rgba(0,0,0,.5);z-index:1200;pointer-events:auto;font-size:13px;overflow:hidden}
.kyg-head{display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(200,97,74,.16);
  border-bottom:1px solid rgba(255,255,255,.08);font-weight:600}
.kyg-head .kyg-title{flex:1}
.kyg-close{background:none;border:none;color:#9aa4b8;cursor:pointer;font-size:15px;padding:2px 6px;border-radius:6px}
.kyg-close:hover{background:rgba(255,255,255,.1);color:#fff}
.kyg-tabs{display:flex;gap:2px;padding:6px 10px 0;border-bottom:1px solid rgba(255,255,255,.08);flex-wrap:wrap}
.kyg-tab{background:none;border:none;color:#9aa4b8;padding:6px 10px;cursor:pointer;font-size:12px;
  border-radius:8px 8px 0 0;border-bottom:2px solid transparent}
.kyg-tab:hover{color:#dfe5f0}
.kyg-tab-active{color:#f0b7a4;border-bottom:2px solid #c8614a;background:rgba(200,97,74,.1)}
.kyg-body{padding:12px 14px;overflow-y:auto;flex:1}
.kyg-row{display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
.kyg-label{color:#9aa4b8;min-width:52px;font-size:12px}
.kyg-input{flex:1;min-width:120px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);
  color:#e8ecf4;border-radius:8px;padding:5px 8px;font-size:12px}
.kyg-input:focus{outline:none;border-color:#c8614a}
.kyg-btn{background:#c8614a;border:none;color:#fff;border-radius:8px;padding:5px 12px;cursor:pointer;font-size:12px}
.kyg-btn:hover{background:#d97a5f}
.kyg-btn:disabled{opacity:.5;cursor:default}
.kyg-btn-sub{background:rgba(255,255,255,.1);color:#dfe5f0}
.kyg-btn-sub:hover{background:rgba(255,255,255,.18)}
.kyg-pre{background:rgba(0,0,0,.35);border-radius:8px;padding:8px 10px;font-size:11px;line-height:1.5;
  white-space:pre-wrap;word-break:break-all;max-height:260px;overflow:auto;margin:6px 0;font-family:Consolas,monospace}
.kyg-img{max-width:100%;border-radius:8px;border:1px solid rgba(255,255,255,.12);margin-top:6px}
.kyg-canvas{width:100%;background:rgba(10,14,22,.9);border-radius:8px;border:1px solid rgba(255,255,255,.1);margin-top:6px}
.kyg-list-item{padding:5px 8px;border-radius:6px;cursor:pointer;display:flex;gap:8px;align-items:baseline}
.kyg-list-item:hover{background:rgba(255,255,255,.07)}
.kyg-list-item .ext{color:#f0b7a4;font-size:11px;min-width:52px}
.kyg-list-item .sz{color:#6b7489;font-size:11px;margin-left:auto}
.kyg-hint{color:#6b7489;font-size:11px;margin:4px 0}
.kyg-sel{color:#7fd4a8;font-size:11px}
.kyg-header-btn{display:inline-flex;align-items:center;gap:4px;background:none;border:1px solid rgba(200,97,74,.5);
  color:inherit;border-radius:8px;padding:3px 10px;cursor:pointer;font-size:12px}
.kyg-header-btn:hover{background:rgba(200,97,74,.15)}
.kyg-card{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(200,97,74,.4);
  border-radius:10px;background:rgba(200,97,74,.08);font-size:12px}
.kyg-badge{background:#c8614a;color:#fff;border-radius:6px;padding:1px 7px;font-size:11px}
`

// ---------- 小组件 ----------

function h(type, props) {
  const children = Array.prototype.slice.call(arguments, 2)
  return React.createElement.apply(null, [type, props].concat(children))
}

function Field(label, input) {
  return h('div', { className: 'kyg-row' }, h('span', { className: 'kyg-label' }, label), input)
}

function ResultPre(props) {
  if (!props.text) return null
  return h('pre', { className: 'kyg-pre' }, props.text)
}

function fmtJson(v, cap) {
  let s
  try { s = JSON.stringify(v, null, 1) } catch (e) { s = String(v) }
  const n = cap || 4000
  return s.length > n ? s.slice(0, n) + '\n…（截断）' : s
}

// ---------- 七页签 ----------

// 目录：GIS 数据目录读取 + 工程目录
function TabCatalog(props) {
  const store = props.store
  const [dir, setDir] = React.useState('')
  const [items, setItems] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState('')
  async function scan() {
    setBusy(true); setMsg('扫描中…')
    try {
      const r = await host.call('catalog.list', { dir: dir || undefined, depth: 3 })
      if (r && r.ok) { setItems(r.items); setMsg('共 ' + r.count + ' 个 GIS 数据文件（根：' + r.root + '）') }
      else { setItems(null); setMsg('失败: ' + (r && r.error || '未知')) }
    } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  return h('div', null,
    Field('目录', h('input', { className: 'kyg-input', value: dir, placeholder: '缺省 = 会话工作区根', onChange: e => setDir(e.target.value) })),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn', disabled: busy, onClick: scan }, '扫描'),
      store.path ? h('span', { className: 'kyg-sel' }, '当前图层: ' + store.path) : null),
    h('div', { className: 'kyg-hint' }, msg),
    items && items.map((it, i) => h('div', {
      key: i, className: 'kyg-list-item',
      onClick: () => { store.path = it.path; props.notify() },
    },
      h('span', { className: 'ext' }, it.ext.toUpperCase()),
      h('span', null, it.name),
      h('span', { className: 'sz' }, it.size === null ? '' : Math.round(it.size / 1024) + 'KB'))),
  )
}

// 数据：info / query / validate
function TabData(props) {
  const store = props.store
  const [path, setPath] = React.useState(store.path)
  const [filter, setFilter] = React.useState('')
  const [out, setOut] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
  async function call(method, args) {
    setBusy(true); setOut('执行中…')
    try {
      const r = await host.call(method, args)
      setOut(fmtJson(r))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  return h('div', null,
    Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: () => call('data.info', { path }) }, '检视'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path, onClick: () => call('data.validate', { path }) }, '质检')),
    Field('过滤', h('input', { className: 'kyg-input', value: filter, placeholder: '如 height > 50', onChange: e => setFilter(e.target.value) })),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn', disabled: busy || !path || !filter, onClick: () => call('data.query', { path, filter }) }, '查询')),
    h(ResultPre, { text: out }),
  )
}

// 地图：离屏渲染面板（含属性驱动符号化，StyleRule 直通 kanyu render --style）
// 符号化规则构建：graduated stops 文本格式「阈值:#RRGGBB,…」（严格升序）；
// categorical colors 文本格式「类别:#RRGGBB,…」+ 可选默认色「*:#888888」。
function buildStyle(method, field, spec) {
  if (method === 'none' || !field.trim()) return null
  const pairs = spec.split(',').map(s => s.trim()).filter(Boolean)
    .map(s => { const i = s.lastIndexOf(':'); return i > 0 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : null })
    .filter(Boolean)
  if (method === 'graduated') {
    const stops = pairs.map(p => [Number(p[0]), p[1]]).filter(p => isFinite(p[0]))
    return stops.length ? { type: 'graduated', field: field.trim(), stops } : null
  }
  const colors = {}; let def = null
  pairs.forEach(p => { if (p[0] === '*') def = p[1]; else colors[p[0]] = p[1] })
  const rule = { type: 'categorical', field: field.trim(), colors }
  if (def) rule.default = def
  return Object.keys(colors).length ? rule : null
}

function TabMap(props) {
  const store = props.store
  const [path, setPath] = React.useState(store.path)
  const [theme, setTheme] = React.useState('light')
  const [symMethod, setSymMethod] = React.useState('none')
  const [symField, setSymField] = React.useState('')
  const [symSpec, setSymSpec] = React.useState('')
  const [img, setImg] = React.useState(null)
  const [msg, setMsg] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
  async function render2d() {
    setBusy(true); setMsg('渲染中（kanyu render map）…'); setImg(null)
    try {
      const style = buildStyle(symMethod, symField, symSpec)
      const r = await host.call('render.map', { path, theme, width: 760, height: 520, style })
      if (r && r.pngBase64) { setImg('data:image/png;base64,' + r.pngBase64); setMsg('落盘: ' + r.out + (style ? ' · 符号化: ' + style.type + '(' + style.field + ')' : '')) }
      else setMsg(fmtJson(r && r.run ? { ok: r.run.ok, exit: r.run.exitCode, stderr: String(r.run.stderr).slice(0, 500) } : r))
    } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  return h('div', null,
    Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
    h('div', { className: 'kyg-row' },
      h('span', { className: 'kyg-label' }, '主题'),
      h('select', { className: 'kyg-input', value: theme, onChange: e => setTheme(e.target.value) },
        h('option', { value: 'light' }, '晨山 (light)'), h('option', { value: 'dark' }, '夜观星 (dark)')),
      h('span', { className: 'kyg-label' }, '符号化'),
      h('select', { className: 'kyg-input', value: symMethod, onChange: e => setSymMethod(e.target.value) },
        h('option', { value: 'none' }, '单色（默认）'),
        h('option', { value: 'graduated' }, '分级 (graduated)'),
        h('option', { value: 'categorical' }, '唯一值 (categorical)')),
      h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: render2d }, '渲染')),
    symMethod !== 'none' ? h('div', { className: 'kyg-row' },
      h('input', { className: 'kyg-input', style: { width: '110px' }, placeholder: '字段名', value: symField, onChange: e => setSymField(e.target.value) }),
      h('input', { className: 'kyg-input', style: { flex: 1 }, value: symSpec, onChange: e => setSymSpec(e.target.value),
        placeholder: symMethod === 'graduated' ? '阈值:#RRGGBB,…（严格升序，如 10:#D85C4A,20:#E8A33D）' : '类别:#RRGGBB,…（*:#888888 为默认色）' })) : null,
    h('div', { className: 'kyg-hint' }, msg),
    img ? h('img', { className: 'kyg-img', src: img, alt: '地图渲染' }) : null,
  )
}

// 坐标：坐标框架
function TabCrs(props) {
  const store = props.store
  const [presets, setPresets] = React.useState([])
  const [path, setPath] = React.useState(store.path)
  const [from, setFrom] = React.useState('EPSG:4326')
  const [to, setTo] = React.useState('EPSG:4547')
  const [out, setOut] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    host.call('crs.presets', {}).then(r => { if (r && r.ok) setPresets(r.presets) }).catch(() => {})
  }, [])
  React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
  async function run() {
    setBusy(true); setOut('投影变换中…')
    try {
      const r = await host.call('crs.reproject', { path, from, to })
      setOut(fmtJson(r && r.stdout !== undefined ? { ok: r.ok, exit: r.exitCode, stdout: String(r.stdout).slice(0, 1200), stderr: String(r.stderr).slice(0, 400) } : r))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  const sel = (v, set) => h('select', { className: 'kyg-input', value: v, onChange: e => set(e.target.value) },
    presets.map(c => h('option', { key: c.code, value: c.code }, c.code + ' ' + c.name)))
  return h('div', null,
    h('div', { className: 'kyg-hint' }, '坐标框架：常用坐标系速查 + EPSG 全库投影变换（kanyu data reproject）'),
    Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
    Field('源 CRS', sel(from, setFrom)),
    Field('目标', sel(to, setTo)),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: run }, '投影变换')),
    h(ResultPre, { text: out }),
  )
}

// 处理：地理处理工具箱
function TabGp(props) {
  const store = props.store
  const [tools, setTools] = React.useState([])
  const [toolId, setToolId] = React.useState('buffer')
  const [input, setInput] = React.useState(store.path)
  const [input2, setInput2] = React.useState('')
  const [kv, setKv] = React.useState({})
  const [out, setOut] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    host.call('geoprocess.list', {}).then(r => { if (r && r.ok) setTools(r.tools) }).catch(() => {})
  }, [])
  React.useEffect(() => { if (store.path) setInput(store.path) }, [store.path])
  const def = tools.find(t => t.id === toolId)
  async function run() {
    setBusy(true); setOut('运行中…')
    try {
      const r = await host.call('geoprocess.run', { tool: toolId, input, input2: input2 || undefined, params: kv })
      setOut(fmtJson(r && r.stdout !== undefined
        ? { ok: r.ok, exit: r.exitCode, stdout: String(r.stdout).slice(0, 1600), stderr: String(r.stderr).slice(0, 400), error: r.error }
        : r))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  return h('div', null,
    Field('工具', h('select', { className: 'kyg-input', value: toolId, onChange: e => { setToolId(e.target.value); setKv({}) } },
      tools.map(t => h('option', { key: t.id, value: t.id }, t.name + ' (' + t.id + ')')),
      tools.length === 0 ? h('option', { value: 'buffer' }, '缓冲区 (buffer)') : null)),
    Field('输入', h('input', { className: 'kyg-input', value: input, onChange: e => setInput(e.target.value) })),
    def && def.two ? Field('输入2', h('input', { className: 'kyg-input', value: input2, onChange: e => setInput2(e.target.value) })) : null,
    def && def.params.map(p => Field(p.label, h('input', {
      key: p.k, className: 'kyg-input', value: kv[p.k] || '', placeholder: p.required ? '必填' : '可选',
      onChange: e => setKv(Object.assign({}, kv, { [p.k]: e.target.value })),
    }))),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn', disabled: busy || !input, onClick: run }, '运行')),
    h(ResultPre, { text: out }),
  )
}

// 编辑：地理编辑
function TabEdit(props) {
  const store = props.store
  const [path, setPath] = React.useState(store.path)
  const [op, setOp] = React.useState('feature-count')
  const [argsText, setArgsText] = React.useState('{}')
  const [inPlace, setInPlace] = React.useState(false)
  const [out, setOut] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
  const OPS = ['feature-count', 'feature-delete', 'feature-add', 'attribute-set', 'attribute-delete', 'vertex-move']
  const HINTS = {
    'feature-count': '{}', 'feature-delete': '{"index":0}',
    'feature-add': '{"geometry":{"type":"Point","coordinates":[113.6,34.8]},"properties":{"name":"新点","height":20}}',
    'attribute-set': '{"index":-1,"field":"height","value":30}（index=-1 为全部要素）',
    'attribute-delete': '{"field":"temp"}',
    'vertex-move': '{"feature":0,"ringPath":[0],"vertex":2,"x":113.5,"y":34.2}',
  }
  async function apply2() {
    let args
    try { args = JSON.parse(argsText || '{}') } catch (e) { setOut('参数 JSON 解析失败: ' + e.message); return }
    setBusy(true); setOut('应用中…')
    try {
      const r = await host.call('edit.apply', { path, op, args, inPlace })
      setOut(fmtJson(r))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  async function undoRedo(dir) {
    setBusy(true); setOut((dir === 'undo' ? '撤销' : '重做') + '中…')
    try {
      // 显式方法名（不做字符串拼接）：两半漂移锁静态可查
      const r = await host.call(dir === 'undo' ? 'edit.undo' : 'edit.redo', { path })
      setOut(fmtJson(r))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  return h('div', null,
    Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
    Field('算子', h('select', { className: 'kyg-input', value: op, onChange: e => { setOp(e.target.value); setArgsText(HINTS[e.target.value] || '{}') } },
      OPS.map(o => h('option', { key: o, value: o }, o)))),
    h('div', { className: 'kyg-hint' }, '参数示例: ' + (HINTS[op] || '{}')),
    h('textarea', { className: 'kyg-input', rows: 3, value: argsText, onChange: e => setArgsText(e.target.value) }),
    h('div', { className: 'kyg-row' },
      h('label', { className: 'kyg-hint' },
        h('input', { type: 'checkbox', checked: inPlace, onChange: e => setInPlace(e.target.checked) }), ' 原地覆盖（默认写 .edited.geojson）'),
      h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: apply2 }, '应用'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path, onClick: () => undoRedo('undo') }, '撤销'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path, onClick: () => undoRedo('redo') }, '重做')),
    h('div', { className: 'kyg-hint' }, '编辑历史对齐 kanyu-edit 双栈：变更入 undo 栈（容量 64），新变更清空 redo'),
    h(ResultPre, { text: out }),
  )
}

// 3D：挤出体场景——投影链对齐内核 scene3d.rs 软件管线：
// 数据→画布线性映射（view.rs 同式）→ 绕画布中心 yaw 旋转 → sin(pitch) 俯仰压缩
// → 高度向上抬升；背面剔除 + 质心纵深排序（远先绘）+ 侧面两档明暗（0.55/0.75）；
// 高度归一化 = 画布高 × 0.25 / 最大高度（内核 MAX_HEIGHT_FRAC）；左键拖拽旋转
// （yaw += dx*0.01；pitch ∓ 0.3°/px，钳制 30°–45°；默认 yaw=-0.5、pitch=35°）。
function drawScene3d(cv, data, view) {
  const g = cv.getContext('2d')
  const W = cv.width, H = cv.height
  const yaw = view && typeof view.yaw === 'number' ? view.yaw : -0.5
  const pitchDeg = view && typeof view.pitch === 'number' ? view.pitch : 35
  const pitch = Math.min(45, Math.max(30, pitchDeg)) * Math.PI / 180
  g.clearRect(0, 0, W, H)
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H) // 内核约束：地图框背景纯白
  if (!data || !data.bbox || !data.features || data.features.length === 0) {
    g.fillStyle = '#6b7489'; g.font = '12px sans-serif'
    g.fillText('无场景数据（加载 GeoJSON 后绘制挤出体）', 16, 24)
    return
  }
  const b = data.bbox
  const minx = b[0], miny = b[1], maxx = b[2], maxy = b[3]
  const spanX = Math.max(maxx - minx, 1e-9), spanY = Math.max(maxy - miny, 1e-9)
  // 数据 → 画布 2D（view.rs 线性映射，y 轴翻转，留边距居中）
  const fit = Math.min(W / spanX, H / spanY) * 0.84
  const offX = (W - spanX * fit) / 2, offY = (H - spanY * fit) / 2
  const toCanvas = (x, y) => [offX + (x - minx) * fit, offY + (maxy - y) * fit]
  const cx = W / 2, cy = H / 2
  // 高度归一化（内核 height_scale：最大高度锚定画布 1/4 高）
  let maxH = 0
  data.features.forEach(f => { if (f.height > maxH) maxH = f.height })
  const zScale = maxH > 0 ? H * 0.25 / maxH : 0
  const sY = Math.sin(yaw), cY = Math.cos(yaw), sP = Math.sin(pitch)
  const rotate = (gx, gy) => { // 绕画布中心（x 右 y 下）
    const dx = gx - cx, dy = gy - cy
    return [cx + dx * cY - dy * sY, cy + dx * sY + dy * cY]
  }
  const proj = (x, y, z) => { // 数据坐标 + 高度 → 屏幕点
    const c0 = toCanvas(x, y), r = rotate(c0[0], c0[1])
    return [r[0], cy + (r[1] - cy) * sP - z * zScale]
  }
  const faceVisible = (a, bq) => { // 背面剔除：旋转后外法线 ny < 0 才朝观众
    const dx = bq[0] - a[0], dy = -(bq[1] - a[1])
    return dy * sY + (-dx) * cY < 0
  }
  const BASE = [216, 120, 86] // 组件基色（无图层符号化通道，取堪舆暖色）
  const shade = (k, a) => 'rgba(' + Math.round(BASE[0] * k) + ',' + Math.round(BASE[1] * k) + ',' + Math.round(BASE[2] * k) + ',' + a + ')'
  // 装配：棱柱（顶面 + 已剔除侧面 + 明暗档）/ 贴地线 / 贴地点
  const prisms = [], gLines = [], gPoints = []
  for (const f of data.features) {
    const ring = f.ring
    if (!ring || ring.length === 0) continue
    if (f.geom === 'Point') { gPoints.push(proj(ring[0][0], ring[0][1], 0)); continue }
    if (f.geom === 'LineString') { gLines.push(ring.map(p => proj(p[0], p[1], 0))); continue }
    if (ring.length < 3) continue
    const ground = ring.map(p => toCanvas(p[0], p[1]))
    const top = ring.map(p => proj(p[0], p[1], f.height))
    const sides = []
    for (let i = 0; i < ground.length - 1; i++) {
      const a = ground[i], b2 = ground[i + 1]
      if (!faceVisible(a, b2)) continue
      // 明暗两档：按边方向的旋转后 x 分量分档（内核 collect_polygon 同式）
      const dark = ((b2[0] - a[0]) * cY - (b2[1] - a[1]) * sY) > 0
      sides.push({ q: [proj(ring[i][0], ring[i][1], 0), proj(ring[i + 1][0], ring[i + 1][1], 0), top[i + 1], top[i]], dark })
    }
    let mx = 0, my = 0
    ground.forEach(p => { mx += p[0]; my += p[1] })
    prisms.push({ depth: rotate(mx / ground.length, my / ground.length)[1], top, sides })
  }
  prisms.sort((p1, p2) => p2.depth - p1.depth) // 质心纵深：远 → 近
  const fillPoly = pts => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill() }
  for (const pr of prisms) {
    for (const s of pr.sides) { g.fillStyle = shade(s.dark ? 0.55 : 0.75, 0.92); fillPoly(s.q) }
    if (pr.top.length >= 3) {
      g.fillStyle = shade(1, 0.95); g.strokeStyle = 'rgba(60,40,36,.7)'; g.lineWidth = 0.6
      fillPoly(pr.top); g.stroke()
    }
  }
  g.strokeStyle = shade(0.85, 0.9); g.lineWidth = 1.5
  for (const ln of gLines) { g.beginPath(); ln.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke() }
  g.fillStyle = shade(0.85, 0.95)
  for (const p of gPoints) { g.beginPath(); g.arc(p[0], p[1], 3, 0, 6.2832); g.fill() }
  g.fillStyle = '#6b7489'; g.font = '11px sans-serif'
  g.fillText('堪舆 3D · ' + data.count + ' 要素 · 高度字段 ' + data.heightField +
    ' · 方位角 ' + Math.round(yaw * 180 / Math.PI) + '° 俯仰 ' + Math.round(pitchDeg) + '° · 拖拽旋转', 10, 16)
}

function Tab3d(props) {
  const store = props.store
  const [path, setPath] = React.useState(store.path)
  const [hf, setHf] = React.useState('height')
  const [data, setData] = React.useState(null)
  const [msg, setMsg] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [cv, setCv] = React.useState(null)
  // 视角状态（对齐内核 Scene3D：yaw 弧度 / pitch 角度制，拖拽调节）
  const [view, setView] = React.useState({ yaw: -0.5, pitch: 35 })
  const dragRef = React.useRef(null)
  React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
  React.useEffect(() => { if (cv && data) drawScene3d(cv, data, view) }, [cv, data, view])
  function onDown(e) { dragRef.current = { x: e.clientX, y: e.clientY } }
  function onMove(e) {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.x, dy = e.clientY - d.y
    d.x = e.clientX; d.y = e.clientY
    // 内核交互契约：yaw += dx*0.01；pitch 钳制 30°–45°
    setView(v => ({ yaw: v.yaw + dx * 0.01, pitch: Math.min(45, Math.max(30, v.pitch - dy * 0.3)) }))
  }
  function onUp() { dragRef.current = null }
  async function load() {
    setBusy(true); setMsg('制备场景数据中…')
    try {
      const r = await host.call('scene3d.data', { path, heightField: hf, maxFeatures: 300 })
      if (r && r.ok) { setData(r); setMsg(r.count + '/' + r.total + ' 要素 · bbox ' + fmtJson(r.bbox, 200)) }
      else setMsg('失败: ' + (r && r.error || '未知'))
    } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  return h('div', null,
    Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
    Field('高度字段', h('input', { className: 'kyg-input', value: hf, onChange: e => setHf(e.target.value) })),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: load }, '加载 3D 场景')),
    h('div', { className: 'kyg-hint' }, msg),
    h('canvas', {
      ref: setCv, className: 'kyg-canvas', width: 540, height: 360,
      style: { cursor: 'grab', touchAction: 'none' },
      onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: onUp,
    }),
  )
}

// 关于：组件状态
function TabAbout() {
  const [info, setInfo] = React.useState(null)
  React.useEffect(() => { host.call('ping', {}).then(setInfo).catch(e => setInfo({ error: String(e && e.message || e) })) }, [])
  return h('div', null,
    h('div', { className: 'kyg-hint' }, '堪舆 GIS × DeepSeek Harness 组件 —— 七大能力域经 kanyu CLI 内核驱动；模型侧能力由 8 个 kanyu_* 动态工具承接（Harness function-calling）。'),
    info ? h(ResultPre, { text: fmtJson(info, 3000) }) : h('div', { className: 'kyg-hint' }, '连接中…'),
  )
}

// ---------- 工作台主窗口 ----------

const TABS = [
  { id: 'catalog', name: '目录', C: TabCatalog },
  { id: 'data', name: '数据', C: TabData },
  { id: 'map', name: '地图', C: TabMap },
  { id: 'crs', name: '坐标', C: TabCrs },
  { id: 'gp', name: '处理', C: TabGp },
  { id: 'edit', name: '编辑', C: TabEdit },
  { id: 'scene3d', name: '3D', C: Tab3d },
  { id: 'about', name: '关于', C: TabAbout },
]

return {
  name: 'kanyu-gis-client',

  apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) {
      console.error('kanyu-gis: slots service 不可用，Client 半停用')
      return
    }
    styles.insert(CSS)

    // ------ 包级共享状态（头部按钮 ↔ 浮层窗口 ↔ cordis 卡片） ------
    const store = { open: false, path: '' }
    const listeners = new Set()
    function notify() { listeners.forEach(f => { try { f() } catch (e) { /* 忽略单监听器故障 */ } }) }
    function useStore() {
      const [, setTick] = React.useState(0)
      React.useEffect(() => {
        const f = () => setTick(t => t + 1)
        listeners.add(f)
        return () => { listeners.delete(f) }
      }, [])
      return store
    }

    function Workbench() {
      const s = useStore()
      const [tab, setTab] = React.useState('catalog')
      if (!s.open) return null
      const cur = TABS.find(t => t.id === tab) || TABS[0]
      return h('div', { className: 'kyg-panel' },
        h('div', { className: 'kyg-head' },
          h('span', null, '🧭'),
          h('span', { className: 'kyg-title' }, '堪舆 GIS 工作台'),
          h('span', { className: 'kyg-badge' }, 'kanyu 内核'),
          h('button', { className: 'kyg-close', onClick: () => { store.open = false; notify() } }, '✕')),
        h('div', { className: 'kyg-tabs' },
          TABS.map(t => h('button', {
            key: t.id, className: 'kyg-tab' + (t.id === tab ? ' kyg-tab-active' : ''),
            onClick: () => setTab(t.id),
          }, t.name))),
        h('div', { className: 'kyg-body' }, h(cur.C, { store: s, notify })),
      )
    }

    function HeaderButton() {
      const s = useStore()
      return h('button', {
        className: 'kyg-header-btn',
        title: '堪舆 GIS 工作台（kanyu 内核驱动）',
        onClick: () => { store.open = !s.open; notify() },
      }, '🧭 堪舆GIS')
    }

    function CordisCard(props) {
      const s = useStore()
      return h('div', { className: 'kyg-card' },
        h('span', { className: 'kyg-badge' }, '堪舆 GIS'),
        h('span', null, '组件已激活：目录/数据/地图/坐标/处理/编辑/3D 七大能力 + 8 个 kanyu_* 模型工具'),
        h('button', { className: 'kyg-btn', onClick: () => { store.open = !s.open; notify() } }, s.open ? '收起工作台' : '打开工作台'),
      )
    }

    // ------ Slot 注册（全部经 slots.inject 等待声明） ------
    slots.inject('conversation.session.header.actions', () => slots.register(
      { name: 'conversation.session.header.actions', id: 'kanyu-gis', order: 30, label: '堪舆GIS' },
      () => h(HeaderButton),
    ))
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'kanyu-gis-workbench', order: 0, label: '堪舆 GIS 工作台' },
      () => h(Workbench),
    ))
    slots.inject('tool.view.cordis', () => slots.register(
      { name: 'tool.view.cordis', key: 'self' },
      (props) => h(CordisCard, props),
    ))

    console.log('kanyu-gis Client 半已激活：会话头部按钮 + 工作台浮层 + cordis 卡片')
  },
}

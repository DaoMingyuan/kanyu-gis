// ============================================================================
// kanyu-gis 常驻静态插件 —— Client 半（浏览器侧，dsh.client 双面包约定）
// ----------------------------------------------------------------------------
// 本文件是手写工厂格式 bundle（classic script，无需构建）：
//   window.__ModuleLoader__.load({ id: <包名>, factory: (require) => … })
// id 必须等于 package.json 的 name（dsh-client-modules/lib/client.js:84 校验）。
// 模块导出形状 = 命名导出 inject（客户端 cordis 服务清单）+ apply(ctx)。
//
// 与动态包方言（dsh/plugin/client.js）的差异：
//   · React 由 require("react") 取（平台种子模块）；
//   · 无 styles 符号——document.createElement('style') 自管并挂 ctx.effect 清理；
//   · 无 host.call（动态包专利，cordis-client-runner 按 pluginRunId 桥接）——
//     改为同源 fetch POST /kanyu-gis/call，由 Host 半（pkg/index.js）经
//     webServer 前缀路由桥到同一张 RPC 表；
//   · 无 tool.view.cordis 卡片（key:'self' 改写只发生在动态 guard 里）；
//   · preset 门控：读 sessions 快照的 agentPreset 字段（一等字段，
//     SessionSummary.agentPreset），仅 kanyu-gis 会话渲染头部按钮与工作台——
//     「切换到 GIS 模式时面板联动加载」即此门控（切走即隐藏）。
// ============================================================================
window.__ModuleLoader__.load({
  id: 'kanyu-gis-dsh-plugin',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

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
.kyg-cat-head{padding:5px 8px;border-radius:6px;cursor:pointer;display:flex;gap:8px;align-items:baseline;font-weight:600}
.kyg-cat-head:hover{background:rgba(255,255,255,.07)}
.kyg-cat-head .arr{color:#6b7489;font-size:11px;min-width:12px}
.kyg-cat-head .ct{color:#6b7489;font-size:11px;margin-left:auto;border:1px solid rgba(128,128,128,.4);border-radius:8px;padding:0 6px}
.kyg-hint{color:#6b7489;font-size:11px;margin:4px 0}
.kyg-sel{color:#7fd4a8;font-size:11px}
.kyg-header-btn{display:inline-flex;align-items:center;gap:4px;background:none;border:1px solid rgba(200,97,74,.5);
  color:inherit;border-radius:8px;padding:3px 10px;cursor:pointer;font-size:12px}
.kyg-header-btn:hover{background:rgba(200,97,74,.15)}
`

    // ---------- Host 半 RPC 桥（静态形态：同源 HTTP 自定义路由） ----------

    async function hostCall(method, args) {
      const res = await fetch('/kanyu-gis/call', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ method, args: args || {} }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status))
      return data
    }

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
    // 目录：五分类对齐壳层 catalog.rs（地图框/布局框/数据库/服务链接/本机数据）
    function TabCatalog(props) {
      const store = props.store
      const [dir, setDir] = React.useState('')
      const [data, setData] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [msg, setMsg] = React.useState('')
      const [open, setOpen] = React.useState({})
      async function scan() {
        setBusy(true); setMsg('扫描中…')
        try {
          const r = await hostCall('catalog.list', { dir: dir || undefined, depth: 3 })
          if (r && r.ok) { setData(r); setMsg('共 ' + r.count + ' 个 GIS 数据文件（根：' + r.root + '）') }
          else { setData(null); setMsg('失败: ' + (r && r.error || '未知')) }
        } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
        setBusy(false)
      }
      // 服务链接分类：WFS GetCapabilities 图层发现（services.discover，对齐壳层 services.rs）
      const [svcUrl, setSvcUrl] = React.useState('')
      const [svcLayers, setSvcLayers] = React.useState(null)
      const [svcBusy, setSvcBusy] = React.useState(false)
      const [svcMsg, setSvcMsg] = React.useState('')
      async function discover() {
        setSvcBusy(true); setSvcMsg('拉取 GetCapabilities…'); setSvcLayers(null)
        try {
          const r = await hostCall('services.discover', { url: svcUrl })
          if (r && r.ok) { setSvcLayers(r.layers); setSvcMsg('发现 ' + r.count + ' 个图层') }
          else setSvcMsg('失败: ' + (r && r.error || '未知'))
        } catch (e) { setSvcMsg('RPC 失败: ' + (e && e.message || e)) }
        setSvcBusy(false)
      }
      // WFS GetFeature 拉取落 GeoJSON 图层（services.fetch），成功即设为当前图层
      async function fetchLayer(layerName) {
        setSvcBusy(true); setSvcMsg('拉取 ' + layerName + '…')
        try {
          const r = await hostCall('services.fetch', { url: svcUrl, layer: layerName })
          if (r && r.ok) { setSvcMsg('已拉取 ' + r.count + ' 个要素 → ' + r.output); store.path = r.output; props.notify() }
          else setSvcMsg('拉取失败: ' + (r && r.error || '未知'))
        } catch (e) { setSvcMsg('RPC 失败: ' + (e && e.message || e)) }
        setSvcBusy(false)
      }
      // WMS GetMap 底图预览（services.wms，壳层 v2 语义）
      const [wmsLayer, setWmsLayer] = React.useState('')
      const [wmsImg, setWmsImg] = React.useState(null)
      async function wmsPreview() {
        setSvcBusy(true); setSvcMsg('GetMap 拉取中…'); setWmsImg(null)
        try {
          const r = await hostCall('services.wms', { url: svcUrl, layer: wmsLayer, width: 640, height: 320 })
          if (r && r.ok) { setWmsImg('data:image/png;base64,' + r.png); setSvcMsg('底图 ' + r.bytes + ' 字节 PNG') }
          else setSvcMsg('底图失败: ' + (r && r.error || '未知'))
        } catch (e) { setSvcMsg('RPC 失败: ' + (e && e.message || e)) }
        setSvcBusy(false)
      }
      function svcSection() {
        return h('div', null,
          h('div', { className: 'kyg-row' },
            h('input', { className: 'kyg-input', value: svcUrl, placeholder: 'WFS/WMS 服务基址，如 https://example.com/wfs', onChange: e => setSvcUrl(e.target.value) }),
            h('button', { className: 'kyg-btn', disabled: svcBusy || !svcUrl, onClick: discover }, '发现图层')),
          h('div', { className: 'kyg-row' },
            h('input', { className: 'kyg-input', value: wmsLayer, placeholder: 'WMS 图层名（layers），基址同上', onChange: e => setWmsLayer(e.target.value) }),
            h('button', { className: 'kyg-btn', disabled: svcBusy || !svcUrl || !wmsLayer, onClick: wmsPreview }, '预览底图')),
          wmsImg ? h('img', { className: 'kyg-img', src: wmsImg }) : null,
          svcMsg ? h('div', { className: 'kyg-hint' }, svcMsg) : null,
          svcLayers ? svcLayers.map((l, i) => h('div', { key: i, className: 'kyg-list-item' },
            h('span', { className: 'ext' }, 'WFS'),
            h('span', null, l.name + (l.title ? ' —— ' + l.title : '')),
            h('button', { className: 'kyg-btn', style: { marginLeft: 'auto', padding: '1px 8px', fontSize: '11px' }, disabled: svcBusy, onClick: () => fetchLayer(l.name) }, '拉取')))
            : h('div', { className: 'kyg-hint' }, '暂无服务链接——输入基址点「发现图层」'))
      }
      function catRows(cat) {
        const pick = (it, ext, text, clickable) => ({ key: it.path || text, ext, text,
          size: it.size, onClick: clickable ? () => { store.path = it.path; props.notify() } : undefined })
        if (cat.name === '数据库') return (data.dbItems || []).map(it => pick(it, it.ext.toUpperCase(), it.name, true))
        if (cat.name === '本机数据') return (data.dataItems || []).map(it => pick(it, it.ext.toUpperCase(), it.name, true))
        if (cat.name === '地图框') return (data.mapItems || []).map(it => pick(it, 'PNG', it.name, false))
        if (cat.name === '布局框') return (data.layoutItems || []).map(it => ({ key: it.title + it.from, ext: 'KYU', text: it.title + ' —— ' + it.from, size: null }))
        return []
      }
      function catSection(cat) {
        const rows = catRows(cat)
        // 壳层契约：默认仅「本机数据」展开
        const isOpen = open[cat.name] !== undefined ? open[cat.name] : cat.name === '本机数据'
        return h('div', { key: cat.name },
          h('div', { className: 'kyg-cat-head', onClick: () => setOpen(Object.assign({}, open, { [cat.name]: !isOpen })) },
            h('span', { className: 'arr' }, isOpen ? '▾' : '▸'),
            h('span', null, cat.name),
            h('span', { className: 'ct' }, cat.count)),
          isOpen && (cat.name === '服务链接' ? svcSection()
            : rows.length ? rows.map((r, i) => h('div', {
                key: i, className: 'kyg-list-item',
                style: r.onClick ? undefined : { cursor: 'default' },
                onClick: r.onClick,
              },
                h('span', { className: 'ext' }, r.ext),
                h('span', null, r.text),
                h('span', { className: 'sz' }, r.size === null || r.size === undefined ? '' : Math.round(r.size / 1024) + 'KB')))
            : h('div', { className: 'kyg-hint' }, cat.placeholder || '（空）')))
      }
      return h('div', null,
        Field('目录', h('input', { className: 'kyg-input', value: dir, placeholder: '缺省 = 会话工作区根', onChange: e => setDir(e.target.value) })),
        h('div', { className: 'kyg-row' },
          h('button', { className: 'kyg-btn', disabled: busy, onClick: scan }, '扫描'),
          store.path ? h('span', { className: 'kyg-sel' }, '当前图层: ' + store.path) : null),
        h('div', { className: 'kyg-hint' }, msg),
        data && data.categories && data.categories.map(catSection),
      )
    }

    // 数据：info / query / validate
    function TabData(props) {
      const store = props.store
      const [path, setPath] = React.useState(store.path)
      const [filter, setFilter] = React.useState('')
      const [out, setOut] = React.useState('')
      const [table, setTable] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
      async function call(method, args) {
        setBusy(true); setOut('执行中…'); setTable(null)
        try {
          const r = await hostCall(method, args)
          setOut(fmtJson(r))
        } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
        setBusy(false)
      }
      // 属性表预览（data.preview，纯读面；对齐壳层 attrtable 语义）
      async function preview() {
        setBusy(true); setOut('读取属性表…'); setTable(null)
        try {
          const r = await hostCall('data.preview', { path, limit: 50 })
          if (r && r.ok) { setTable(r); setOut('属性表: ' + r.fields.length + ' 字段 · 前 ' + r.shown + '/' + r.total + ' 行') }
          else setOut('失败: ' + (r && r.error || '未知'))
        } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
        setBusy(false)
      }
      const thS = { textAlign: 'left', padding: '3px 8px', borderBottom: '1px solid rgba(128,128,128,.4)', position: 'sticky', top: 0, background: 'rgba(128,128,128,.12)', whiteSpace: 'nowrap' }
      const tdS = { padding: '2px 8px', borderBottom: '1px solid rgba(128,128,128,.15)', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }
      return h('div', null,
        Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
        h('div', { className: 'kyg-row' },
          h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: () => call('data.info', { path }) }, '检视'),
          h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path, onClick: () => call('data.validate', { path }) }, '质检'),
          h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path, onClick: preview }, '属性表')),
        Field('过滤', h('input', { className: 'kyg-input', value: filter, placeholder: '如 height > 50', onChange: e => setFilter(e.target.value) })),
        h('div', { className: 'kyg-row' },
          h('button', { className: 'kyg-btn', disabled: busy || !path || !filter, onClick: () => call('data.query', { path, filter }) }, '查询')),
        table ? h('div', { className: 'kyg-table-wrap', style: { overflow: 'auto', maxHeight: '220px', border: '1px solid rgba(128,128,128,.3)', borderRadius: '4px', margin: '6px 0' } },
          h('table', { style: { borderCollapse: 'collapse', fontSize: '11px', width: '100%' } },
            h('thead', null, h('tr', null, table.fields.map(f => h('th', { key: f, style: thS }, f)))),
            h('tbody', null, table.rows.map((row, i) => h('tr', { key: i }, row.map((c, j) => h('td', { key: j, style: tdS }, c))))))) : null,
        h(ResultPre, { text: out }),
      )
    }

    // 地图：离屏渲染面板
    // 符号化规则构建（StyleRule 直通 kanyu render --style）：
    // graduated stops 文本「阈值:#RRGGBB,…」（严格升序）；
    // categorical colors 文本「类别:#RRGGBB,…」+ 可选默认色「*:#888888」。
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
          const r = await hostCall('render.map', { path, theme, width: 760, height: 520, style })
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
        hostCall('crs.presets', {}).then(r => { if (r && r.ok) setPresets(r.presets) }).catch(() => {})
      }, [])
      React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
      async function run() {
        setBusy(true); setOut('投影变换中…')
        try {
          const r = await hostCall('crs.reproject', { path, from, to })
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
        hostCall('geoprocess.list', {}).then(r => { if (r && r.ok) setTools(r.tools) }).catch(() => {})
      }, [])
      React.useEffect(() => { if (store.path) setInput(store.path) }, [store.path])
      const def = tools.find(t => t.id === toolId)
      async function run() {
        setBusy(true); setOut('运行中…')
        try {
          const r = await hostCall('geoprocess.run', { tool: toolId, input, input2: input2 || undefined, params: kv })
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
    // 顶点编辑画布助手：枚举各几何类型的顶点（ringPath 对齐 host vertex-move 的
    // GeomPath 三级定位：LineString []、MultiLineString/Polygon [环/部件]、
    // MultiPolygon [部件, 环]；Point 无顶点编辑）。
    function enumVertices(geom, fi) {
      const t = geom && geom.type, c = geom && geom.coordinates
      const out = []
      if (!t || !Array.isArray(c)) return out
      if (t === 'LineString') c.forEach((p, vi) => out.push({ feature: fi, ringPath: [], vertex: vi, pos: p }))
      else if (t === 'MultiLineString' || t === 'Polygon') c.forEach((ring, ri) => Array.isArray(ring) && ring.forEach((p, vi) => out.push({ feature: fi, ringPath: [ri], vertex: vi, pos: p })))
      else if (t === 'MultiPolygon') c.forEach((poly, pi) => Array.isArray(poly) && poly.forEach((ring, ri) => Array.isArray(ring) && ring.forEach((p, vi) => out.push({ feature: fi, ringPath: [pi, ri], vertex: vi, pos: p }))))
      return out
    }
    // 2D 画布绘制：数据→画布线性映射（y 翻转），几何轮廓 + 顶点方块；
    // drag = {sel, px, py} 时拖拽顶点用拖拽位高亮预览。返回 {proj, unproj, verts}。
    function drawEdit2d(cv, data, drag) {
      const g = cv.getContext('2d')
      const W = cv.width, H = cv.height
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H) // 纯白画布对齐壳层 mapview 契约
      const bb = data.bbox
      if (!bb) { g.fillStyle = '#666'; g.font = '12px sans-serif'; g.fillText('（无几何）', 12, 20); return null }
      const pad = 16
      const s = Math.min((W - 2 * pad) / Math.max(1e-12, bb[2] - bb[0]), (H - 2 * pad) / Math.max(1e-12, bb[3] - bb[1]))
      const ox = pad + ((W - 2 * pad) - (bb[2] - bb[0]) * s) / 2
      const oy = pad + ((H - 2 * pad) - (bb[3] - bb[1]) * s) / 2
      const proj = (p) => [ox + (Number(p[0]) - bb[0]) * s, H - (oy + (Number(p[1]) - bb[1]) * s)]
      const unproj = (px, py) => [bb[0] + (px - ox) / s, bb[1] + (H - py - oy) / s]
      function strokeRing(ring, close) {
        if (!Array.isArray(ring) || !ring.length) return
        g.beginPath()
        ring.forEach((p, i) => { const q = proj(p); if (i === 0) g.moveTo(q[0], q[1]); else g.lineTo(q[0], q[1]) })
        if (close) g.closePath()
        g.stroke()
      }
      g.strokeStyle = '#c2614a'; g.lineWidth = 1.5
      data.features.forEach((f) => {
        const gm = f && f.geometry
        if (!gm) return
        const t = gm.type, c = gm.coordinates
        if (t === 'Point') { const q = proj(c); g.beginPath(); g.arc(q[0], q[1], 4, 0, 7); g.stroke() }
        else if (t === 'LineString') strokeRing(c, false)
        else if (t === 'MultiLineString' || t === 'Polygon') (c || []).forEach((r) => strokeRing(r, t === 'Polygon'))
        else if (t === 'MultiPolygon') (c || []).forEach((poly) => Array.isArray(poly) && poly.forEach((r) => strokeRing(r, true)))
      })
      const verts = []
      data.features.forEach((f, fi) => { for (const v of enumVertices(f && f.geometry, fi)) verts.push(v) })
      for (const v of verts) {
        const isDrag = drag && drag.sel && drag.sel.feature === v.feature && drag.sel.vertex === v.vertex
          && String(drag.sel.ringPath) === String(v.ringPath)
        const q = isDrag ? [drag.px, drag.py] : proj(v.pos)
        g.fillStyle = isDrag ? '#c2614a' : '#4a5a77'
        g.fillRect(q[0] - 3, q[1] - 3, 6, 6)
      }
      return { proj, unproj, verts }
    }

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
          const r = await hostCall('edit.apply', { path, op, args, inPlace })
          setOut(fmtJson(r))
        } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
        setBusy(false)
      }
      async function undoRedo(dir) {
        setBusy(true); setOut((dir === 'undo' ? '撤销' : '重做') + '中…')
        try {
          // 显式方法名（不做字符串拼接）：两半漂移锁静态可查
          const r = await hostCall(dir === 'undo' ? 'edit.undo' : 'edit.redo', { path })
          setOut(fmtJson(r))
        } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
        setBusy(false)
      }
      // 属性单元格编辑（壳层 attrtable.rs/edit.rs 语义）：data.preview 加载 →
      // 点选行 → 字段/新值 → edit.apply attribute-set
      const [attrs, setAttrs] = React.useState(null)
      const [attrIdx, setAttrIdx] = React.useState(-1)
      const [attrField, setAttrField] = React.useState('')
      const [attrValue, setAttrValue] = React.useState('')
      async function loadAttrs() {
        setBusy(true); setOut('加载属性表…')
        try {
          const r = await hostCall('data.preview', { path, limit: 50 })
          if (r && r.ok) { setAttrs(r); setAttrIdx(-1); setOut('属性表: ' + r.fields.length + ' 字段 · ' + r.total + ' 行（点选行后写单元格）') }
          else setOut('属性表加载失败: ' + (r && r.error || '未知'))
        } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
        setBusy(false)
      }
      async function applyAttr() {
        let v = attrValue
        try { v = JSON.parse(attrValue) } catch (e) { /* 非 JSON 按字符串写入 */ }
        setBusy(true); setOut('单元格写入中…')
        try {
          const r = await hostCall('edit.apply', { path, op: 'attribute-set', args: { index: attrIdx, field: attrField, value: v }, inPlace })
          setOut(fmtJson(r)); if (r && r.ok) setAttrs(null)
        } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
        setBusy(false)
      }
      const thS = { textAlign: 'left', padding: '3px 8px', borderBottom: '1px solid rgba(128,128,128,.4)', position: 'sticky', top: 0, background: 'rgba(128,128,128,.12)', whiteSpace: 'nowrap' }
      const tdS = { padding: '2px 8px', borderBottom: '1px solid rgba(128,128,128,.15)', whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }
      // 顶点编辑画布（壳层 edit.rs 顶点会话语义）：edit.geometry 原样几何 →
      // 点选/拖拽顶点方块 → 松开写 vertex-move（edit.apply），成功后重载几何
      const [geo, setGeo] = React.useState(null)
      const [cvE, setCvE] = React.useState(null)
      const vertDrag = React.useRef(null)
      const mapRef = React.useRef(null)
      React.useEffect(() => { if (cvE && geo) mapRef.current = drawEdit2d(cvE, geo, null) }, [cvE, geo])
      async function loadGeo() {
        setBusy(true); setOut('加载几何…')
        try {
          const r = await hostCall('edit.geometry', { path, maxFeatures: 200 })
          if (r && r.ok) { setGeo(r); setOut('顶点编辑: ' + r.count + '/' + r.total + ' 要素——拖拽顶点方块，松开写入 vertex-move') }
          else setOut('几何加载失败: ' + (r && r.error || '未知'))
        } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
        setBusy(false)
      }
      function vPos(e) {
        const rc = cvE.getBoundingClientRect()
        return [(e.clientX - rc.left) * (cvE.width / rc.width), (e.clientY - rc.top) * (cvE.height / rc.height)]
      }
      function vDown(e) {
        const m = mapRef.current
        if (!m) return
        const pq = vPos(e)
        let best = null, bd = 8 * 8
        for (const v of m.verts) {
          const qv = m.proj(v.pos)
          const d = (qv[0] - pq[0]) * (qv[0] - pq[0]) + (qv[1] - pq[1]) * (qv[1] - pq[1])
          if (d < bd) { bd = d; best = v }
        }
        if (best) { vertDrag.current = { sel: best, px: pq[0], py: pq[1] }; mapRef.current = drawEdit2d(cvE, geo, vertDrag.current) }
      }
      function vMove(e) {
        const d = vertDrag.current
        if (!d) return
        const pq = vPos(e)
        d.px = pq[0]; d.py = pq[1]
        mapRef.current = drawEdit2d(cvE, geo, d)
      }
      async function vUp() {
        const d = vertDrag.current
        if (!d) return
        vertDrag.current = null
        const m = mapRef.current
        if (!m) return
        const xy = m.unproj(d.px, d.py)
        const rx = Math.round(xy[0] * 1e6) / 1e6, ry = Math.round(xy[1] * 1e6) / 1e6
        setBusy(true); setOut('写入顶点 (' + rx + ', ' + ry + ')…')
        try {
          const r = await hostCall('edit.apply', { path, op: 'vertex-move',
            args: { feature: d.sel.feature, ringPath: d.sel.ringPath, vertex: d.sel.vertex, x: rx, y: ry }, inPlace })
          setOut(fmtJson(r))
          const nextPath = (r && r.ok && !inPlace && r.output) ? r.output : path
          if (r && r.ok && nextPath !== path) { store.path = nextPath; setPath(nextPath); props.notify() }
          if (r && r.ok) {
            const g2 = await hostCall('edit.geometry', { path: nextPath, maxFeatures: 200 })
            if (g2 && g2.ok) setGeo(g2)
          } else mapRef.current = drawEdit2d(cvE, geo, null)
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
        h('div', { className: 'kyg-hint' }, '—— 属性单元格编辑 ——'),
        h('div', { className: 'kyg-row' },
          h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path, onClick: loadAttrs }, '加载属性表'),
          attrs ? h('span', { className: 'kyg-sel' }, attrIdx >= 0 ? '选中要素 #' + attrIdx : '点选下方行') : null),
        attrs ? h('div', { className: 'kyg-table-wrap', style: { overflow: 'auto', maxHeight: '180px', border: '1px solid rgba(128,128,128,.3)', borderRadius: '4px', margin: '6px 0' } },
          h('table', { style: { borderCollapse: 'collapse', fontSize: '11px', width: '100%' } },
            h('thead', null, h('tr', null, [h('th', { key: '#', style: thS }, '#')].concat(attrs.fields.map(f => h('th', { key: f, style: thS }, f))))),
            h('tbody', null, attrs.rows.map((row, i) => h('tr', {
              key: i, onClick: () => setAttrIdx(i),
              style: { cursor: 'pointer', background: i === attrIdx ? 'rgba(127,212,168,.15)' : undefined },
            }, [h('td', { key: '#', style: tdS }, i)].concat(row.map((c, j) => h('td', { key: j, style: tdS }, c)))))))) : null,
        attrs ? h('div', { className: 'kyg-row' },
          h('input', { className: 'kyg-input', style: { maxWidth: '30%' }, value: attrField, placeholder: '字段名', onChange: e => setAttrField(e.target.value) }),
          h('input', { className: 'kyg-input', value: attrValue, placeholder: '新值（JSON 可解析则按类型写入）', onChange: e => setAttrValue(e.target.value) }),
          h('button', { className: 'kyg-btn', disabled: busy || attrIdx < 0 || !attrField, onClick: applyAttr }, '写入单元格')) : null,
        h('div', { className: 'kyg-hint' }, '—— 顶点编辑 ——'),
        h('div', { className: 'kyg-row' },
          h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path, onClick: loadGeo }, '加载几何'),
          geo ? h('span', { className: 'kyg-hint' }, '拖拽顶点方块，松开即写 vertex-move（撤销可回退）') : null),
        geo ? h('canvas', {
          ref: setCvE, className: 'kyg-canvas', width: 540, height: 300,
          style: { cursor: 'crosshair', touchAction: 'none', background: '#fff' },
          onMouseDown: vDown, onMouseMove: vMove, onMouseUp: vUp, onMouseLeave: vUp,
        }) : null,
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
          const r = await hostCall('scene3d.data', { path, heightField: hf, maxFeatures: 300 })
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
      React.useEffect(() => { hostCall('ping', {}).then(setInfo).catch(e => setInfo({ error: String(e && e.message || e) })) }, [])
      return h('div', null,
        h('div', { className: 'kyg-hint' }, '堪舆 GIS × DeepSeek Harness 组件 —— 七大能力域经 kanyu CLI 内核驱动；模型侧能力由 8 个 kanyu_* 工具承接（Harness function-calling）；面板随 kanyu-gis preset 联动显示。'),
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

    // 客户端 cordis 服务清单（fiber inject）：slots 注册、会话 preset 快照、
    // preset 切换转发事件。
    exports.inject = ['slots', 'sessions', 'remote']

    exports.apply = function apply(ctx) {
      const slots = ctx.get('slots')
      const sessions = ctx.get('sessions')
      if (slots === undefined) {
        console.error('kanyu-gis: slots service 不可用，Client 半停用')
        return
      }

      // 样式自管（无 styles 符号），挂 ctx.effect 随 fiber 清理
      const styleEl = document.createElement('style')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(() => () => { styleEl.remove() }, 'kanyu-gis: styles')

      // ------ 包级共享状态（头部按钮 ↔ 浮层窗口） ------
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

      // ------ preset 门控：仅 kanyu-gis 会话显示面板 ------
      // 会话 preset 是客户端快照一等字段（SessionSummary.agentPreset）；
      // 运行期切换经 remote 转发事件 'agent-preset/selected' 补记。
      function currentPreset() {
        try {
          const st = sessions.list.getSnapshot()
          const s = st.current === undefined ? undefined : st.byId[st.current]
          return s && s.agentPreset
        } catch (e) { return undefined }
      }
      function useGisMode() {
        const [gis, setGis] = React.useState(currentPreset() === 'kanyu-gis')
        React.useEffect(() => {
          const update = () => setGis(currentPreset() === 'kanyu-gis')
          update()
          const disposers = []
          if (sessions && sessions.list && typeof sessions.list.subscribe === 'function') {
            disposers.push(sessions.list.subscribe(update))
          }
          const remote = ctx.get('remote')
          if (remote && typeof remote.$on === 'function') {
            disposers.push(remote.$on('agent-preset/selected', (sessionId, preset) => {
              try { sessions.noteAgentPreset(sessionId, preset) } catch (e) { /* 快照服务缺该方法时忽略 */ }
              update()
            }))
          }
          return () => disposers.forEach(d => { try { d && d() } catch (e) { /* 清理容错 */ } })
        }, [])
        return gis
      }

      function Workbench() {
        const s = useStore()
        const gis = useGisMode()
        const [tab, setTab] = React.useState('catalog')
        if (!gis || !s.open) return null
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
        const gis = useGisMode()
        if (!gis) return null
        return h('button', {
          className: 'kyg-header-btn',
          title: '堪舆 GIS 工作台（kanyu 内核驱动）',
          onClick: () => { store.open = !s.open; notify() },
        }, '🧭 堪舆GIS')
      }

      // ------ Slot 注册（slots.inject 可用时等待声明，否则直接注册） ------
      function onSlot(name, fn) {
        if (typeof slots.inject === 'function') slots.inject(name, fn)
        else fn()
      }
      onSlot('conversation.session.header.actions', () => slots.register(
        { name: 'conversation.session.header.actions', id: 'kanyu-gis', order: 30, label: '堪舆GIS' },
        HeaderButton,
      ))
      onSlot('shell.overlay', () => slots.register(
        { name: 'shell.overlay', id: 'kanyu-gis-workbench', order: 0, label: '堪舆 GIS 工作台' },
        Workbench,
      ))

      console.log('kanyu-gis Client 半已激活：会话头部按钮 + 工作台浮层（随 kanyu-gis preset 联动显示）')
    }

    return module.exports
  },
})

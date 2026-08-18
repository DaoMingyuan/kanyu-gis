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
.kyg-cat-head{padding:5px 8px;border-radius:6px;cursor:pointer;display:flex;gap:8px;align-items:baseline;font-weight:600}
.kyg-cat-head:hover{background:rgba(255,255,255,.07)}
.kyg-cat-head .arr{color:#6b7489;font-size:11px;min-width:12px}
.kyg-cat-head .ct{color:#6b7489;font-size:11px;margin-left:auto;border:1px solid rgba(128,128,128,.4);border-radius:8px;padding:0 6px}
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
      const r = await host.call('catalog.list', { dir: dir || undefined, depth: 3 })
      if (r && r.ok) { setData(r); setMsg('共 ' + r.count + ' 个 GIS 数据文件（根：' + r.root + '）') }
      else { setData(null); setMsg('失败: ' + (r && r.error || '未知')) }
    } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // freshness 自动重扫（2026-08-18 第三十九轮）：当前图层变更为清单外新文件
  // （查询/编辑/服务拉取产出）时自动重扫一次，计数与清单不滞留；knownRef 防重复
  const knownRef = React.useRef('')
  React.useEffect(() => {
    if (!data || !store.path || store.path === knownRef.current) return
    const items = (data.dataItems || []).concat(data.dbItems || [], data.mapItems || [])
    if (items.some(it => it.path === store.path)) return
    knownRef.current = store.path
    scan()
  }, [store.path])
  // 服务链接分类：WFS GetCapabilities 图层发现（services.discover，对齐壳层 services.rs）
  const [svcUrl, setSvcUrl] = React.useState('')
  const [svcLayers, setSvcLayers] = React.useState(null)
  const [svcBusy, setSvcBusy] = React.useState(false)
  const [svcMsg, setSvcMsg] = React.useState('')
  async function discover() {
    setSvcBusy(true); setSvcMsg('拉取 GetCapabilities…'); setSvcLayers(null)
    try {
      const r = await host.call('services.discover', { url: svcUrl })
      if (r && r.ok) { setSvcLayers(r.layers); setSvcMsg('发现 ' + r.count + ' 个图层') }
      else setSvcMsg('失败: ' + (r && r.error || '未知'))
    } catch (e) { setSvcMsg('RPC 失败: ' + (e && e.message || e)) }
    setSvcBusy(false)
  }
  // WFS GetFeature 拉取落 GeoJSON 图层（services.fetch），成功即设为当前图层
  async function fetchLayer(layerName) {
    setSvcBusy(true); setSvcMsg('拉取 ' + layerName + '…')
    try {
      const r = await host.call('services.fetch', { url: svcUrl, layer: layerName })
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
      const r = await host.call('services.wms', { url: svcUrl, layer: wmsLayer, width: 640, height: 320 })
      if (r && r.ok) { setWmsImg('data:image/png;base64,' + r.png); setSvcMsg('底图 ' + r.bytes + ' 字节 PNG') }
      else setSvcMsg('底图失败: ' + (r && r.error || '未知'))
    } catch (e) { setSvcMsg('RPC 失败: ' + (e && e.message || e)) }
    setSvcBusy(false)
  }
  // 布局框：点击布局条目 → render.layout 排版出 SVG 内嵌预览（第四十八轮；
  // 布局规格 page/dpi/legend/scalebar/north 由 host 读 .kyu 工程清单解析）
  const [layMsg, setLayMsg] = React.useState('')
  const [laySvg, setLaySvg] = React.useState(null)
  const [layBusy, setLayBusy] = React.useState(false)
  async function previewLayout(it) {
    setLayBusy(true); setLayMsg('排版「' + it.title + '」…'); setLaySvg(null)
    try {
      const r = await host.call('render.layout', { kyu: it.kyu, title: it.title })
      if (r && r.ok && r.svg) { setLaySvg(r.svg); setLayMsg('布局预览: ' + r.title + ' → ' + r.out) }
      else setLayMsg('排版失败: ' + (r && (r.error || r.readError) || '未知'))
    } catch (e) { setLayMsg('RPC 失败: ' + (e && e.message || e)) }
    setLayBusy(false)
  }
  // 地图框：点击渲染产物条目 → catalog.readImage 读盘 base64 内嵌预览
  // （第五十轮；host 侧越界防护——仅限 dsh/output 产物目录内 .png）
  const [mapImg, setMapImg] = React.useState(null)
  const [mapImgMsg, setMapImgMsg] = React.useState('')
  async function previewMapImage(it) {
    setMapImgMsg('读取 ' + it.name + '…'); setMapImg(null)
    try {
      const r = await host.call('catalog.readImage', { path: it.path })
      if (r && r.ok) { setMapImg('data:image/png;base64,' + r.png); setMapImgMsg('渲染产物: ' + r.name + '（' + Math.round(r.bytes / 1024) + 'KB）') }
      else setMapImgMsg('读取失败: ' + (r && r.error || '未知'))
    } catch (e) { setMapImgMsg('RPC 失败: ' + (e && e.message || e)) }
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
  // .kyu 工程条目（数据库类）点击 → style.list 展开图层清单（第五十五轮）：
  // 图层行点击 → source 设为当前图层 + 样式/工程路径/图层 id 经 store 接力
  // 地图页签（symToForm 回填符号化表单）；色块为样式主色（壳层 Contents 同语义）
  const [kyuLayers, setKyuLayers] = React.useState(null)
  const [kyuMsg, setKyuMsg] = React.useState('')
  async function loadKyu(it) {
    setKyuMsg('读取工程 ' + it.name + '…'); setKyuLayers(null)
    try {
      const r = await host.call('style.list', { kyu: it.path })
      if (r && r.ok) { setKyuLayers({ kyu: it.path, name: r.name, layers: r.layers }); setKyuMsg('工程: ' + (r.name || it.name) + '（' + r.layers.length + ' 图层' + (r.crs ? ' · ' + r.crs : '') + '）') }
      else setKyuMsg('读取失败: ' + (r && r.error || '未知'))
    } catch (e) { setKyuMsg('RPC 失败: ' + (e && e.message || e)) }
  }
  function pickKyuLayer(l) {
    store.path = l.source
    store.sym = l.style
    store.kyu = kyuLayers.kyu
    store.layerId = l.id
    props.notify()
  }
  function catRows(cat) {
    const pick = (it, ext, text, clickable) => ({ key: it.path || text, ext, text,
      size: it.size, onClick: clickable ? () => { store.path = it.path; props.notify() } : undefined })
    if (cat.name === '数据库') return (data.dbItems || []).map(it => (/\.kyu$/i.test(it.path || it.name)
      ? { key: it.path || it.name, ext: 'KYU', text: it.name, size: it.size, onClick: () => loadKyu(it) }
      : pick(it, it.ext.toUpperCase(), it.name, true)))
    if (cat.name === '本机数据') return (data.dataItems || []).map(it => pick(it, it.ext.toUpperCase(), it.name, true))
    if (cat.name === '地图框') return (data.mapItems || []).map(it => ({ key: it.path || it.name, ext: 'PNG', text: it.name, size: it.size,
      onClick: () => previewMapImage(it) }))
    if (cat.name === '布局框') return (data.layoutItems || []).map(it => ({ key: it.title + it.from, ext: 'KYU', text: it.title + ' —— ' + it.from, size: null,
      onClick: layBusy ? undefined : () => previewLayout(it) }))
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
    kyuMsg ? h('div', { className: 'kyg-hint' }, kyuMsg) : null,
    // .kyu 工程图层清单展开（style.list；点击载入当前图层 + 样式接力地图页签）
    kyuLayers ? h('div', null,
      kyuLayers.layers.map((l, i) => h('div', { key: i, className: 'kyg-list-item', onClick: () => pickKyuLayer(l) },
        h('span', { className: 'ext' }, l.visible ? '图层' : '隐藏'),
        h('span', null, l.id + (l.styleMode ? ' · ' + l.styleMode : '')),
        symPrimaryColor(l.style) ? h('span', { style: { display: 'inline-block', width: '10px', height: '10px', marginLeft: '6px', borderRadius: '2px', background: symPrimaryColor(l.style) } }) : null)),
      h('div', { className: 'kyg-hint' }, '点击图层行：载入为当前图层，样式接力地图页签符号化表单')) : null,
    layMsg ? h('div', { className: 'kyg-hint' }, layMsg) : null,
    laySvg ? h('button', { className: 'kyg-btn', onClick: () => { setLaySvg(null); setLayMsg('') } }, '关闭布局预览') : null,
    // SVG 排版产物内嵌预览（host 侧 render.layout 出图，壳层 layoutview 同源排版器）
    laySvg ? h('div', { className: 'kyg-layout-preview',
      style: { overflow: 'auto', maxHeight: '480px', border: '1px solid rgba(127,127,127,0.4)', borderRadius: '4px', marginTop: '6px' },
      dangerouslySetInnerHTML: { __html: laySvg } }) : null,
    mapImgMsg ? h('div', { className: 'kyg-hint' }, mapImgMsg) : null,
    mapImg ? h('button', { className: 'kyg-btn', onClick: () => { setMapImg(null); setMapImgMsg('') } }, '关闭产物预览') : null,
    // 地图框渲染产物 PNG 内嵌预览（host 侧 catalog.readImage 读盘）
    mapImg ? h('img', { className: 'kyg-img', src: mapImg }) : null,
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
      const r = await host.call(method, args)
      setOut(fmtJson(r))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 属性表预览（data.preview，纯读面；对齐壳层 attrtable 语义）
  async function preview() {
    setBusy(true); setOut('读取属性表…'); setTable(null)
    try {
      const r = await host.call('data.preview', { path, limit: 50 })
      if (r && r.ok) { setTable(r); setOut('属性表: ' + r.fields.length + ' 字段 · 前 ' + r.shown + '/' + r.total + ' 行') }
      else setOut('失败: ' + (r && r.error || '未知'))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 查询联动：过滤 → 落盘 dsh/output/ → stderr 解析命中数 + data.preview 取总数
  // → 设为当前图层（store.path 广播，目录/地图/编辑等页签联动跟随）
  async function runQuery() {
    setBusy(true); setOut('查询中…'); setTable(null)
    try {
      const outPath = 'dsh/output/kanyu-query-' + Date.now() + '.geojson'
      const r = await host.call('data.query', { path, filter, output: outPath })
      if (!r || !r.ok) { setOut('查询失败: ' + ((r && (r.stderr || r.error)) || '未知')); setBusy(false); return }
      const m = /已写出 (\d+) 个要素/.exec(r.stderr || '')
      const hit = m ? Number(m[1]) : null
      let total = null
      try {
        const pv = await host.call('data.preview', { path, limit: 1 })
        if (pv && pv.ok) total = pv.total
      } catch (e) { /* 总数不可达时只报命中数 */ }
      store.path = outPath; setPath(outPath); props.notify()
      setOut('命中 ' + (hit === null ? '?' : hit) + (total === null ? '' : '/' + total) +
        ' 要素 → 已设为当前图层: ' + outPath)
      // 查询结果联动属性表：命中行即结果集，自动载入预览（免再点「属性表」）；
      // 预览不可达时降级仅保留计数回执
      try {
        const pv2 = await host.call('data.preview', { path: outPath, limit: 50 })
        if (pv2 && pv2.ok) setTable(pv2)
      } catch (e) { /* 结果预览不可达时仅保留计数回执 */ }
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
      h('button', { className: 'kyg-btn', disabled: busy || !path || !filter, onClick: runQuery }, '查询')),
    table ? h('div', { className: 'kyg-table-wrap', style: { overflow: 'auto', maxHeight: '220px', border: '1px solid rgba(128,128,128,.3)', borderRadius: '4px', margin: '6px 0' } },
      h('table', { style: { borderCollapse: 'collapse', fontSize: '11px', width: '100%' } },
        h('thead', null, h('tr', null, table.fields.map(f => h('th', { key: f, style: thS }, f)))),
        h('tbody', null, table.rows.map((row, i) => h('tr', { key: i }, row.map((c, j) => h('td', { key: j, style: tdS }, c))))))) : null,
    h(ResultPre, { text: out }),
  )
}

// 地图：离屏渲染面板（符号化编辑模型 LayerSymbology 直通 render.map symbology，
// Host 半 symToRule 投影为 StyleRule——对齐壳层 symbology.rs/.kyu 持久化格式，
// 第五十二轮由裸 StyleRule 文本切换为编辑模型，单色/唯一值/分级三模式齐备）。
// 颜色 hex ↔ RGB 数组转换；categorical 文本格式「类别:#RRGGBB,…」；
// graduated 断点文本格式「阈值,阈值,…」（严格升序，颜色由色带取样生成）。
function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function rgbToHex(c) {
  if (!Array.isArray(c) || c.length < 3) return '#888888'
  return '#' + c.slice(0, 3).map(v => Math.max(0, Math.min(255, Number(v) || 0)).toString(16).padStart(2, '0')).join('')
}
function buildSymbology(method, field, spec, singleColor, otherColor, ramp) {
  if (method === 'none') return null
  if (method === 'single') {
    const c = hexToRgb(singleColor)
    return c ? { mode: 'single', color: c } : { error: '单色颜色须为 #RRGGBB' }
  }
  const f = field.trim()
  if (!f) return { error: '符号化字段不能为空' }
  if (method === 'graduated') {
    const breaks = spec.split(',').map(s => Number(s.trim())).filter(isFinite)
    if (!breaks.length) return { error: '断点须为逗号分隔数字（如 10,20,40）' }
    for (let i = 1; i < breaks.length; i++) if (breaks[i] <= breaks[i - 1]) return { error: '断点须严格升序' }
    return { mode: 'graduated', field: f, breaks, ramp: ramp || 'Jade' }
  }
  const colors = spec.split(',').map(s => s.trim()).filter(Boolean)
    .map(s => { const i = s.lastIndexOf(':'); return i > 0 ? [s.slice(0, i).trim(), hexToRgb(s.slice(i + 1))] : null })
    .filter(p => p && p[0] && p[1])
  if (!colors.length) return { error: '类别色须为「类别:#RRGGBB,…」格式' }
  return { mode: 'categorical', field: f, colors, other: hexToRgb(otherColor) || [136, 136, 136] }
}
// 样式主色（一层一色取色，对齐壳层 symbology.rs primary_color 语义）：
// single 取该色；categorical 取首个类别色（无则 other）；graduated 取色带最深
function symPrimaryColor(sym) {
  if (!sym || typeof sym !== 'object') return null
  if (sym.mode === 'single') return rgbToHex(sym.color)
  if (sym.mode === 'categorical') return sym.colors && sym.colors.length ? rgbToHex(sym.colors[0][1]) : rgbToHex(sym.other)
  if (sym.mode === 'graduated') return ({ Jade: '#2d6a5e', Amber: '#b07818', Slate: '#3a6b8c' })[sym.ramp] || '#2d6a5e'
  return null
}
// 工程样式读回 → 表单回填（style.get 回执 LayerSymbology → 控件态）
function symToForm(sym) {
  if (!sym || typeof sym !== 'object') return null
  if (sym.mode === 'single') return { method: 'single', field: '', spec: '', singleColor: rgbToHex(sym.color) }
  if (sym.mode === 'categorical') return { method: 'categorical', field: sym.field || '',
    spec: (sym.colors || []).map(p => p[0] + ':' + rgbToHex(p[1])).join(','), otherColor: rgbToHex(sym.other) }
  if (sym.mode === 'graduated') return { method: 'graduated', field: sym.field || '',
    spec: (sym.breaks || []).join(','), ramp: sym.ramp || 'Jade' }
  return null
}

function TabMap(props) {
  const store = props.store
  const [path, setPath] = React.useState(store.path)
  const [theme, setTheme] = React.useState('light')
  const [symMethod, setSymMethod] = React.useState('none')
  const [symField, setSymField] = React.useState('')
  const [symSpec, setSymSpec] = React.useState('')
  const [singleColor, setSingleColor] = React.useState('#2D6A5E')
  const [otherColor, setOtherColor] = React.useState('#888888')
  const [ramp, setRamp] = React.useState('Jade')
  const [kyuPath, setKyuPath] = React.useState('')
  const [layerId, setLayerId] = React.useState('')
  const [img, setImg] = React.useState(null)
  const [msg, setMsg] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
  // 目录 .kyu 图层接力（第五十五轮）：store.sym 快照回填符号化表单 +
  // 工程路径/图层 id 回填写入区（闭环：目录→地图→写入工程）
  const symRef = React.useRef(null)
  React.useEffect(() => {
    if (!store.sym || store.sym === symRef.current) return
    symRef.current = store.sym
    const f = symToForm(store.sym)
    if (f) {
      setSymMethod(f.method); setSymField(f.field || ''); setSymSpec(f.spec || '')
      if (f.singleColor) setSingleColor(f.singleColor)
      if (f.otherColor) setOtherColor(f.otherColor)
      if (f.ramp) setRamp(f.ramp)
    }
    if (store.kyu) setKyuPath(store.kyu)
    if (store.layerId) setLayerId(store.layerId)
  }, [store.sym, store.kyu, store.layerId, store.path])
  async function render2d(p) {
    const usePath = p || path
    const sym = buildSymbology(symMethod, symField, symSpec, singleColor, otherColor, ramp)
    if (sym && sym.error) { setMsg('符号化参数: ' + sym.error); return }
    setBusy(true); setMsg('渲染中（kanyu render map）…'); setImg(null)
    try {
      const r = await host.call('render.map', { path: usePath, theme, width: 760, height: 520, symbology: sym })
      if (r && r.pngBase64) { setImg('data:image/png;base64,' + r.pngBase64); setMsg('落盘: ' + r.out + (sym ? ' · 符号化: ' + sym.mode + (sym.field ? '(' + sym.field + ')' : '') : '')) }
      else setMsg(fmtJson(r && r.run ? { ok: r.run.ok, exit: r.run.exitCode, stderr: String(r.run.stderr).slice(0, 500) } : r))
    } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 工程样式读写（style.get/style.set RPC，第五十二轮）：读取回填表单 /
  // 写入 .kyu 图层 style（LayerSymbology JSON，壳层工程属性页同语义）
  async function styleLoad() {
    setBusy(true)
    try {
      const r = await host.call('style.get', { kyu: kyuPath, layerId })
      if (r && r.ok) {
        const f = symToForm(r.style)
        if (f) {
          setSymMethod(f.method); setSymField(f.field || ''); setSymSpec(f.spec || '')
          if (f.singleColor) setSingleColor(f.singleColor)
          if (f.otherColor) setOtherColor(f.otherColor)
          if (f.ramp) setRamp(f.ramp)
          setMsg('已读取工程样式: ' + r.layerId + '（' + r.style.mode + '）')
        } else setMsg('图层 ' + r.layerId + ' 无样式（默认单色）')
      } else setMsg((r && r.error) || '读取失败')
    } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  async function styleSave() {
    const sym = buildSymbology(symMethod, symField, symSpec, singleColor, otherColor, ramp)
    if (!sym || sym.error) { setMsg('符号化参数: ' + (sym ? sym.error : '未配置')); return }
    setBusy(true)
    try {
      const r = await host.call('style.set', { kyu: kyuPath, layerId, style: sym })
      setMsg(r && r.ok ? '样式已写入工程: ' + r.layerId + '（' + sym.mode + '）' : (r && r.error) || '写入失败')
    } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 联动重渲染（2026-08-18 第四十轮）：已渲染过时，跟随当前图层切换
  // （store.path 变化）或同路径内容变更（store.rev 递增）自动重渲；未渲染过不自动出图
  const autoRef = React.useRef({ path: '', rev: -1 })
  React.useEffect(() => {
    const a = autoRef.current
    if (!img) { a.path = store.path; a.rev = store.rev; return }
    if (store.path === a.path && store.rev === a.rev) return
    a.path = store.path; a.rev = store.rev
    if (store.path) render2d(store.path)
  }, [store.path, store.rev, img])
  return h('div', null,
    Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
    h('div', { className: 'kyg-row' },
      h('span', { className: 'kyg-label' }, '主题'),
      h('select', { className: 'kyg-input', value: theme, onChange: e => setTheme(e.target.value) },
        h('option', { value: 'light' }, '晨山 (light)'), h('option', { value: 'dark' }, '夜观星 (dark)')),
      h('span', { className: 'kyg-label' }, '符号化'),
      h('select', { className: 'kyg-input', value: symMethod, onChange: e => setSymMethod(e.target.value) },
        h('option', { value: 'none' }, '默认'),
        h('option', { value: 'single' }, '单色 (single)'),
        h('option', { value: 'categorical' }, '唯一值 (categorical)'),
        h('option', { value: 'graduated' }, '分级 (graduated)')),
      h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: () => render2d() }, '渲染')),
    symMethod === 'single' ? h('div', { className: 'kyg-row' },
      h('span', { className: 'kyg-label' }, '颜色'),
      h('input', { type: 'color', className: 'kyg-input', value: singleColor, onChange: e => setSingleColor(e.target.value) })) : null,
    symMethod === 'categorical' || symMethod === 'graduated' ? h('div', { className: 'kyg-row' },
      h('input', { className: 'kyg-input', style: { width: '110px' }, placeholder: '字段名', value: symField, onChange: e => setSymField(e.target.value) }),
      h('input', { className: 'kyg-input', style: { flex: 1 }, value: symSpec, onChange: e => setSymSpec(e.target.value),
        placeholder: symMethod === 'graduated' ? '断点,…（严格升序数字，如 10,20,40；颜色由色带取样）' : '类别:#RRGGBB,…（如 办公:#2D6A5E,住宅:#D9A23C）' }),
      symMethod === 'graduated' ? h('select', { className: 'kyg-input', value: ramp, onChange: e => setRamp(e.target.value) },
        h('option', { value: 'Jade' }, '青玉'), h('option', { value: 'Amber' }, '琥珀'), h('option', { value: 'Slate' }, '蓝灰')) : null,
      symMethod === 'categorical' ? h('input', { type: 'color', className: 'kyg-input', title: '<其他> 色', value: otherColor, onChange: e => setOtherColor(e.target.value) }) : null) : null,
    h('div', { className: 'kyg-row' },
      h('input', { className: 'kyg-input', style: { flex: 1 }, placeholder: '.kyu 工程路径（符号化持久化）', value: kyuPath, onChange: e => setKyuPath(e.target.value) }),
      h('input', { className: 'kyg-input', style: { width: '110px' }, placeholder: '图层 id', value: layerId, onChange: e => setLayerId(e.target.value) }),
      h('button', { className: 'kyg-btn', disabled: busy || !kyuPath, onClick: styleLoad }, '读取样式'),
      h('button', { className: 'kyg-btn', disabled: busy || !kyuPath || !layerId || symMethod === 'none', onClick: styleSave }, '写入工程')),
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
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState(null)
  const [searchSrc, setSearchSrc] = React.useState('')
  React.useEffect(() => {
    host.call('crs.presets', {}).then(r => { if (r && r.ok) setPresets(r.presets) }).catch(() => {})
  }, [])
  React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
  // 投影变换联动：落盘 dsh/output/ → stderr 解析命中数 → 设为当前图层
  // （store.path 广播，目录/地图/数据等页签联动跟随；对齐数据页签 runQuery 语义）
  async function runReproject() {
    setBusy(true); setOut('投影变换中…')
    try {
      const outPath = 'dsh/output/kanyu-reproject-' + Date.now() + '.geojson'
      const r = await host.call('crs.reproject', { path, from, to, output: outPath })
      if (!r || !r.ok) { setOut('投影变换失败: ' + ((r && String(r.stderr || r.error || '').slice(0, 300)) || '未知')); setBusy(false); return }
      const m = /已写出 (\d+) 个要素/.exec(r.stderr || '')
      store.path = outPath; setPath(outPath); props.notify()
      setOut(from + ' → ' + to + '：变换 ' + (m ? m[1] : '?') + ' 要素 → 已设为当前图层: ' + outPath)
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  async function search() {
    setBusy(true)
    try {
      const r = await host.call('crs.search', { query, limit: 20 })
      if (r && r.ok) { setHits(r.results); setSearchSrc(r.source + (r.degraded ? '（兜底）' : '')) }
      else setHits([])
    } catch (e) { setHits([]); setSearchSrc('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  const sel = (v, set) => h('select', { className: 'kyg-input', value: v, onChange: e => set(e.target.value) },
    presets.map(c => h('option', { key: c.code, value: c.code }, c.code + ' ' + c.name)))
  return h('div', null,
    h('div', { className: 'kyg-hint' }, '坐标框架：EPSG 全库检索（7507 条）+ 常用速查 + 投影变换（kanyu crs/data reproject）'),
    h('div', { className: 'kyg-row' },
      h('input', { className: 'kyg-input', style: { flex: 1 }, placeholder: '检索 EPSG：代码或名称（如 4547 / CGCS2000）',
        value: query, onChange: e => setQuery(e.target.value),
        onKeyDown: e => { if (e.key === 'Enter') search() } }),
      h('button', { className: 'kyg-btn', disabled: busy, onClick: search }, '检索')),
    hits ? h('div', null,
      h('div', { className: 'kyg-hint' }, hits.length + ' 条结果 · ' + searchSrc + '（点击设为目标 CRS）'),
      hits.map(c => h('div', { key: c.code, className: 'kyg-row', style: { cursor: 'pointer' },
          onClick: () => setTo(c.code) },
        h('span', { style: { fontFamily: 'monospace', marginRight: '6px' } }, c.code),
        h('span', { style: { flex: 1 } }, c.name),
        h('span', { className: 'kyg-hint' }, c.kind + (c.unit ? ' · ' + c.unit : ''))))) : null,
    Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
    Field('源 CRS', sel(from, setFrom)),
    Field('目标', sel(to, setTo)),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: runReproject }, '投影变换')),
    h(ResultPre, { text: out }),
  )
}

// 处理：地理处理工具箱
// 工具箱全库面板（core::tooldef 37 工具注册表，经 toolbox.list/toolbox.run RPC；
// 参数表 ParamKind 驱动动态表单，与壳层工具箱面板同一单一事实来源）
const TB_CAT_ORDER = ['Analysis', 'Geometry', 'Selection', 'DataManagement', 'Statistics']
const TB_CAT_CN = { Analysis: '矢量分析', Geometry: '矢量几何', Selection: '矢量选择', DataManagement: '数据管理', Statistics: '统计度量' }
function tbKind(p) {
  const k = p.kind
  if (typeof k === 'string') return { t: k }
  if (k && typeof k === 'object') {
    if ('Enum' in k) return { t: 'Enum', options: k.Enum }
    if ('Field' in k) return { t: 'Field' }
  }
  return { t: 'Text' }
}
function ToolboxPanel(props) {
  const store = props.store
  const [tbTools, setTbTools] = React.useState([])
  const [tbErr, setTbErr] = React.useState('')
  const [tbId, setTbId] = React.useState('')
  const [tbKv, setTbKv] = React.useState({})
  const [tbOutPath, setTbOutPath] = React.useState('')
  const [tbOut, setTbOut] = React.useState('')
  const [tbBusy, setTbBusy] = React.useState(false)
  React.useEffect(() => {
    host.call('toolbox.list', {}).then(r => {
      if (r && r.ok) setTbTools(r.tools)
      else setTbErr(r && r.error || 'toolbox.list 失败')
    }).catch(e => setTbErr('RPC 失败: ' + (e && e.message || e)))
  }, [])
  const def = tbTools.find(t => t.id === tbId)
  function pick(id) {
    setTbId(id); setTbOut(''); setTbOutPath('')
    const d = tbTools.find(t => t.id === id)
    const kv = {}
    if (d) d.params.forEach(p => {
      const kk = tbKind(p)
      if (kk.t === 'Boolean') kv[p.key] = p.default || 'false'
      else if (kk.t === 'Layer') kv[p.key] = p.default || store.path || ''
      else kv[p.key] = p.default || ''
    })
    setTbKv(kv)
  }
  // 产图层工具联动：缺省落盘 dsh/output/ → stderr 解析写出清单 → 首产出设为当前图层
  // （split_by_field 为 toolrun.rs 唯一 NewLayers 多产出，output 视作目录；报告类直出原文）
  async function tbRun() {
    setTbBusy(true); setTbOut('运行中…')
    try {
      const producesLayer = def && !def.report && !hasOutFile
      const multi = tbId === 'split_by_field'
      let outArg = tbOutPath
      if (producesLayer && !outArg)
        outArg = 'dsh/output/kanyu-tool-' + tbId + '-' + Date.now() + (multi ? '' : '.geojson')
      const r = await host.call('toolbox.run', { id: tbId, params: tbKv, output: outArg || undefined })
      const writes = r && r.ok ? [...String(r.stderr || '').matchAll(/已写出 (\d+) 个要素 → (.+)/g)] : []
      if (producesLayer && writes.length) {
        const first = writes[0][2].trim()
        store.path = first; props.notify()
        setTbOut(def.name + ' 完成：' + writes.map(w => w[1] + ' 要素').join('、')
          + (writes.length === 1 ? ' → 已设为当前图层: ' + first
            : '（多产出 ' + writes.length + ' 个，首组已设为当前图层: ' + first + '）'))
      } else {
        setTbOut(fmtJson(r && r.stdout !== undefined
          ? { ok: r.ok, exit: r.exitCode, stdout: String(r.stdout).slice(0, 1600), stderr: String(r.stderr).slice(0, 400), error: r.error }
          : r))
      }
    } catch (e) { setTbOut('RPC 失败: ' + (e && e.message || e)) }
    setTbBusy(false)
  }
  function widget(p) {
    const kk = tbKind(p)
    const set = v => setTbKv(Object.assign({}, tbKv, { [p.key]: v }))
    if (kk.t === 'Enum') return h('select', { className: 'kyg-input', value: tbKv[p.key] || '', onChange: e => set(e.target.value) },
      h('option', { value: '' }, '（选择）'),
      kk.options.map(o => h('option', { key: o[0], value: o[0] }, o[1] + ' (' + o[0] + ')')))
    if (kk.t === 'Boolean') return h('input', { type: 'checkbox', checked: (tbKv[p.key] || 'false') === 'true', onChange: e => set(e.target.checked ? 'true' : 'false') })
    const ph = p.hint || (p.required ? '必填' : '可选')
      + (kk.t === 'LinearUnit' ? '（数值|单位，如 500|米）' : '')
      + (kk.t === 'MultiLayers' ? '（多路径逗号分隔，≥2）' : '')
      + (kk.t === 'Layer' ? '（数据文件绝对路径）' : '')
      + (kk.t === 'Extent' ? '（minx,miny,maxx,maxy）' : '')
    return h('input', { className: 'kyg-input', value: tbKv[p.key] || '', onChange: e => set(e.target.value), placeholder: ph })
  }
  const hasOutFile = def && def.params.some(p => tbKind(p).t === 'OutFile')
  return h('div', null,
    h('div', { className: 'kyg-hint', style: { marginTop: '10px', borderTop: '1px solid #e2e5ea', paddingTop: '8px' } },
      '工具箱全库（core::tooldef 注册表 ' + (tbTools.length || '…') + ' 工具 · kanyu tool 出口）'),
    tbErr ? h('div', { className: 'kyg-hint' }, tbErr) : null,
    tbTools.length ? Field('注册表', h('select', { className: 'kyg-input', value: tbId, onChange: e => pick(e.target.value) },
      h('option', { value: '' }, '（选择工具）'),
      TB_CAT_ORDER.map(cat => {
        const items = tbTools.filter(t => t.category === cat)
        return items.length ? h('optgroup', { key: cat, label: TB_CAT_CN[cat] },
          items.map(t => h('option', { key: t.id, value: t.id }, t.name + ' (' + t.id + ')'))) : null
      }))) : null,
    def ? h('div', { className: 'kyg-hint' }, def.desc) : null,
    def ? def.params.map(p => h('div', { key: p.key }, Field(p.label + (p.required ? ' *' : ''), widget(p)))) : null,
    def && !def.report && !hasOutFile ? Field('输出', h('input', { className: 'kyg-input', value: tbOutPath, onChange: e => setTbOutPath(e.target.value), placeholder: 'GeoJSON 路径（缺省落 dsh/output 并设为当前图层；多产出视作目录）' })) : null,
    def ? h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn', disabled: tbBusy, onClick: tbRun }, '运行 ' + def.name)) : null,
    h(ResultPre, { text: tbOut }),
  )
}

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
    h(ToolboxPanel, { store }),
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
// drag = {sel, px, py} 时拖拽顶点用拖拽位高亮预览；drag.batch 存在时
// 选择集内其余顶点按同一像素位移联动预览（框选批量移动）。
// opts = {rect:[x0,y0,x1,y1], sel:[verts]} 时叠加框选橡皮筋 + 选中顶点高亮。
// 返回 {proj, unproj, verts}。
function drawEdit2d(cv, data, drag, opts) {
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
  const selList = (opts && opts.sel) || []
  const inSel = (v) => selList.some(s2 => s2.feature === v.feature && s2.vertex === v.vertex && String(s2.ringPath) === String(v.ringPath))
  const dragOrg = drag && drag.batch && drag.sel ? proj(drag.sel.pos) : null
  const verts = []
  data.features.forEach((f, fi) => { for (const v of enumVertices(f && f.geometry, fi)) verts.push(v) })
  for (const v of verts) {
    const isDrag = drag && drag.sel && drag.sel.feature === v.feature && drag.sel.vertex === v.vertex
      && String(drag.sel.ringPath) === String(v.ringPath)
    let q
    if (isDrag) q = [drag.px, drag.py]
    else if (dragOrg && inSel(v)) { const q0 = proj(v.pos); q = [q0[0] + drag.px - dragOrg[0], q0[1] + drag.py - dragOrg[1]] }
    else q = proj(v.pos)
    g.fillStyle = isDrag ? '#c2614a' : inSel(v) ? '#d4a017' : '#4a5a77'
    g.fillRect(q[0] - 3, q[1] - 3, 6, 6)
  }
  if (opts && opts.rect) {
    const r = opts.rect
    g.strokeStyle = '#2D6A5E'; g.lineWidth = 1; g.setLineDash([4, 3])
    g.strokeRect(Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1]))
    g.setLineDash([])
  }
  return { proj, unproj, verts }
}

function TabEdit(props) {
  const store = props.store
  const [path, setPath] = React.useState(store.path)
  const [op, setOp] = React.useState('feature-count')
  const [argsText, setArgsText] = React.useState('{}')
  const [inPlace, setInPlace] = React.useState(false)
  const [topoMode, setTopoMode] = React.useState(false) // 拓扑模式：拖拽改写 topo-move（共享顶点一次同移）
  // 绘制挖洞/点选打断/绘制新要素（2026-08-18 第六十三/六十四轮）：画布点击
  // 攒点——挖洞=多点成环 hole-add（目标=属性表选中行，否则 #0），打断=单击
  // 落点 line-split，绘制点=单击即 feature-add Point，绘制线/面=攒点应用
  // feature-add LineString/Polygon（面自动闭合）；
  // drawRef 攒数据坐标（state 异步不可用于事件链，对齐 vertDrag ref 范式）
  const [drawMode, setDrawMode] = React.useState('') // '' | 'hole' | 'split' | 'addPoint' | 'addLine' | 'addPolygon' | 'cutPoly'
  const drawRef = React.useRef([])
  const [drawN, setDrawN] = React.useState(0)
  // 框选批量移动（2026-08-18 第六十五轮）：marquee 开时画布拖橡皮筋多选顶点
  // （selRef 选择集，ref 范式同 drawRef）；选择集 ≥2 时拖拽其中任一顶点 →
  // vertices-move 原子批量算子一次写入（单条 undo 整体回滚）
  const [marquee, setMarquee] = React.useState(false)
  const selRef = React.useRef([])
  const [selN, setSelN] = React.useState(0)
  const rectRef = React.useRef(null)
  const [out, setOut] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
  // 算子清单与 EDIT_OPS（host.js）保持一致——新增算子须双端同步入列
  const OPS = ['feature-count', 'feature-delete', 'feature-add', 'attribute-set', 'attribute-delete', 'attributes-replace', 'vertex-move', 'vertices-move', 'feature-move', 'hole-add', 'line-split', 'topo-move']
  const HINTS = {
    'feature-count': '{}', 'feature-delete': '{"index":0}',
    'feature-add': '{"geometry":{"type":"Point","coordinates":[113.6,34.8]},"properties":{"name":"新点","height":20}}',
    'attribute-set': '{"index":-1,"field":"height","value":30}（index=-1 为全部要素）',
    'attribute-delete': '{"field":"temp"}',
    'attributes-replace': '{"index":0,"properties":{"name":"改"}}（整行覆写，null 清空属性表）',
    'vertex-move': '{"feature":0,"ringPath":[0],"vertex":2,"x":113.5,"y":34.2}（ringPath 缺省按类型分派：面[0]/多面与多线[0,0]/线与点[]，保留 Z/M）',
    'vertices-move': '{"moves":[{"feature":0,"ringPath":[0],"vertex":2,"x":113.5,"y":34.2}]}（批量移动，单条 undo 整体回滚）',
    'feature-move': '{"index":0,"dx":100,"dy":50}（整要素平移，保留 Z/M）',
    'hole-add': '{"index":0,"ring":[[2,2],[4,2],[4,4],[2,4]]}（面内挖洞，自动闭合；part 多面子面下标）',
    'line-split': '{"index":0,"x":2.5,"y":4}（线按点打断，投影最近线段吸附顶点）',
    'topo-move': '{"x":5,"y":0,"nx":6,"ny":1}（共享顶点一次同移，坐标精确匹配）',
  }
  async function apply2() {
    let args
    try { args = JSON.parse(argsText || '{}') } catch (e) { setOut('参数 JSON 解析失败: ' + e.message); return }
    setBusy(true); setOut('应用中…')
    try {
      const r = await host.call('edit.apply', { path, op, args, inPlace })
      setOut(fmtJson(r))
      // 联动刷新（对齐顶点编辑 vUp 语义）：非原地产出改用 r.output 为当前路径并广播；
      // 属性表作废待重载；顶点画布已加载则重载几何——此前应用后两区滞留旧数据
      if (r && r.ok) {
        const nextPath = (!inPlace && r.output) ? r.output : path
        if (nextPath !== path) { store.path = nextPath; setPath(nextPath) }
        setAttrs(null)
        if (geo) { const g2 = await host.call('edit.geometry', { path: nextPath, maxFeatures: 200 }); if (g2 && g2.ok) setGeo(g2) }
        store.rev++; props.notify()
      }
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  async function undoRedo(dir) {
    setBusy(true); setOut((dir === 'undo' ? '撤销' : '重做') + '中…')
    try {
      // 显式方法名（不做字符串拼接）：两半漂移锁静态可查
      const r = await host.call(dir === 'undo' ? 'edit.undo' : 'edit.redo', { path })
      setOut(fmtJson(r))
      // 联动刷新：撤销/重做改文件内容不改路径——属性表作废 + 顶点画布重载 + 广播
      if (r && r.ok) {
        setAttrs(null)
        if (geo) { const g2 = await host.call('edit.geometry', { path, maxFeatures: 200 }); if (g2 && g2.ok) setGeo(g2) }
        store.rev++; props.notify()
      }
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
      const r = await host.call('data.preview', { path, limit: 50 })
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
      const r = await host.call('edit.apply', { path, op: 'attribute-set', args: { index: attrIdx, field: attrField, value: v }, inPlace })
      setOut(fmtJson(r)); if (r && r.ok) { setAttrs(null); store.rev++; props.notify() }
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
  React.useEffect(() => {
    selRef.current = []; setSelN(0) // 几何重载后旧顶点定位失效，清空选择集
    if (cvE && geo) mapRef.current = drawEdit2d(cvE, geo, null, editOpts())
  }, [cvE, geo])
  async function loadGeo() {
    setBusy(true); setOut('加载几何…')
    try {
      const r = await host.call('edit.geometry', { path, maxFeatures: 200 })
      if (r && r.ok) { setGeo(r); setOut('顶点编辑: ' + r.count + '/' + r.total + ' 要素——拖拽顶点方块，松开写入 vertex-move') }
      else setOut('几何加载失败: ' + (r && r.error || '未知'))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  function vPos(e) {
    const rc = cvE.getBoundingClientRect()
    return [(e.clientX - rc.left) * (cvE.width / rc.width), (e.clientY - rc.top) * (cvE.height / rc.height)]
  }
  // 框选/选择集覆盖层参数（橡皮筋矩形 + 选中顶点高亮，供全部重绘点复用）
  function editOpts() {
    const r = rectRef.current
    return { rect: r ? [r.x0, r.y0, r.x1, r.y1] : null, sel: selRef.current }
  }
  function vDown(e) {
    const m = mapRef.current
    if (!m) return
    const pq = vPos(e)
    // 绘制模式分派：挖洞/线面攒点，打断单击落点，绘制点单击即成（跳过顶点拖拽拾取）
    if (drawMode) {
      const xy = m.unproj(pq[0], pq[1])
      const rx = Math.round(xy[0] * 1e6) / 1e6, ry = Math.round(xy[1] * 1e6) / 1e6
      if (drawMode === 'split') { doSplitPoint(rx, ry); return }
      if (drawMode === 'addPoint') { doAddPoint(rx, ry); return }
      drawRef.current = drawRef.current.concat([[rx, ry]])
      setDrawN(drawRef.current.length)
      drawOverlay()
      return
    }
    // 框选模式：按下起橡皮筋矩形（松开收顶点入选择集；单击清空选择集）
    if (marquee) {
      rectRef.current = { x0: pq[0], y0: pq[1], x1: pq[0], y1: pq[1] }
      mapRef.current = drawEdit2d(cvE, geo, null, editOpts())
      return
    }
    let best = null, bd = 8 * 8
    for (const v of m.verts) {
      const qv = m.proj(v.pos)
      const d = (qv[0] - pq[0]) * (qv[0] - pq[0]) + (qv[1] - pq[1]) * (qv[1] - pq[1])
      if (d < bd) { bd = d; best = v }
    }
    if (best) {
      // 命中选择集且集内 ≥2 → 批量拖拽（松开写 vertices-move 原子批量算子）
      const hitSel = selRef.current.length > 1 && selRef.current.some(s2 => s2.feature === best.feature && s2.vertex === best.vertex && String(s2.ringPath) === String(best.ringPath))
      vertDrag.current = { sel: best, px: pq[0], py: pq[1], batch: hitSel ? selRef.current : null }
      mapRef.current = drawEdit2d(cvE, geo, vertDrag.current, editOpts())
    }
  }
  function vMove(e) {
    const pq = vPos(e)
    const rc = rectRef.current
    if (rc) { rc.x1 = pq[0]; rc.y1 = pq[1]; mapRef.current = drawEdit2d(cvE, geo, null, editOpts()); return }
    const d = vertDrag.current
    if (!d) return
    d.px = pq[0]; d.py = pq[1]
    mapRef.current = drawEdit2d(cvE, geo, d, editOpts())
  }
  async function vUp() {
    const m = mapRef.current
    // 框选松开：矩形 ≥4px 收顶点入选择集；视为单击则清空选择集
    const rc = rectRef.current
    if (rc) {
      rectRef.current = null
      if (!m) return
      if (Math.abs(rc.x1 - rc.x0) < 4 && Math.abs(rc.y1 - rc.y0) < 4) {
        selRef.current = []; setSelN(0)
      } else {
        const xa = Math.min(rc.x0, rc.x1), xb = Math.max(rc.x0, rc.x1)
        const ya = Math.min(rc.y0, rc.y1), yb = Math.max(rc.y0, rc.y1)
        selRef.current = m.verts.filter(v => { const q = m.proj(v.pos); return q[0] >= xa && q[0] <= xb && q[1] >= ya && q[1] <= yb })
        setSelN(selRef.current.length)
      }
      mapRef.current = drawEdit2d(cvE, geo, null, editOpts())
      return
    }
    const d = vertDrag.current
    if (!d) return
    vertDrag.current = null
    if (!m) return
    const xy = m.unproj(d.px, d.py)
    const rx = Math.round(xy[0] * 1e6) / 1e6, ry = Math.round(xy[1] * 1e6) / 1e6
    setBusy(true)
    try {
      let r
      if (d.batch) {
        // 批量拖拽：以被拖顶点位移增量换算全选择集目标坐标，写 vertices-move——
        // 单条 undo 整体回滚（批量优先于拓扑模式，二者语义互斥）
        const dx = rx - d.sel.pos[0], dy = ry - d.sel.pos[1]
        const moves = d.batch.map(v => ({ feature: v.feature, ringPath: v.ringPath, vertex: v.vertex,
          x: Math.round((v.pos[0] + dx) * 1e6) / 1e6, y: Math.round((v.pos[1] + dy) * 1e6) / 1e6 }))
        setOut('批量移动 ' + moves.length + ' 个顶点…')
        r = await host.call('edit.apply', { path, op: 'vertices-move', args: { moves }, inPlace })
      } else {
        setOut('写入顶点 (' + rx + ', ' + ry + ')…')
        // 拓扑模式（对齐壳层 Map Topology）：以被拖顶点的原坐标精确匹配，
        // 松开写 topo-move——共享该坐标的全部顶点（含环闭合首末点）一次同移；
        // 否则写 vertex-move 单点移动。两路均入 undo 栈一次撤销。
        r = topoMode
          ? await host.call('edit.apply', { path, op: 'topo-move',
              args: { x: d.sel.pos[0], y: d.sel.pos[1], nx: rx, ny: ry }, inPlace })
          : await host.call('edit.apply', { path, op: 'vertex-move',
              args: { feature: d.sel.feature, ringPath: d.sel.ringPath, vertex: d.sel.vertex, x: rx, y: ry }, inPlace })
      }
      setOut(fmtJson(r))
      const nextPath = (r && r.ok && !inPlace && r.output) ? r.output : path
      if (r && r.ok && nextPath !== path) { store.path = nextPath; setPath(nextPath) }
      if (r && r.ok) {
        store.rev++; props.notify() // 内容版本号递增广播（同路径变更地图页签亦可感知）
        const g2 = await host.call('edit.geometry', { path: nextPath, maxFeatures: 200 })
        if (g2 && g2.ok) setGeo(g2)
      } else mapRef.current = drawEdit2d(cvE, geo, null, editOpts())
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 绘制覆盖层：重绘几何后叠加攒点折线（挖洞模式 ≥3 点预闭合）
  function drawOverlay() {
    if (!cvE || !geo) return
    mapRef.current = drawEdit2d(cvE, geo, null, editOpts())
    const pts = drawRef.current
    if (!pts.length || !mapRef.current) return
    const gd = cvE.getContext('2d')
    gd.strokeStyle = '#2D6A5E'; gd.lineWidth = 2; gd.beginPath()
    pts.forEach((p, i2) => { const q = mapRef.current.proj(p); if (i2 === 0) gd.moveTo(q[0], q[1]); else gd.lineTo(q[0], q[1]) })
    if ((drawMode === 'hole' || drawMode === 'addPolygon') && pts.length > 2) gd.closePath()
    gd.stroke()
    for (const p of pts) { const q = mapRef.current.proj(p); gd.fillStyle = '#2D6A5E'; gd.fillRect(q[0] - 3, q[1] - 3, 6, 6) }
  }
  // 绘制新要素（feature-add 画布化，壳层 edit.rs 绘制会话语义）：点单击即成，
  // 线 ≥2 点 / 面 ≥3 点（自动闭合）攒点应用；属性空表待属性页签补录
  async function doAddPoint(rx, ry) {
    setBusy(true); setOut('绘制点 (' + rx + ', ' + ry + ')…')
    try {
      const r = await host.call('edit.apply', { path, op: 'feature-add',
        args: { geometry: { type: 'Point', coordinates: [rx, ry] } }, inPlace })
      setOut(fmtJson(r))
      await afterEdit(r)
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  async function applyDrawNew() {
    const pts = drawRef.current
    const isPoly = drawMode === 'addPolygon'
    const minN = isPoly ? 3 : 2
    if (pts.length < minN) { setOut((isPoly ? '面' : '线') + '至少需要 ' + minN + ' 个顶点（当前 ' + pts.length + '）'); return }
    const geometry = isPoly
      ? { type: 'Polygon', coordinates: [pts.concat([pts[0]])] }
      : { type: 'LineString', coordinates: pts }
    setBusy(true); setOut('绘制' + (isPoly ? '面' : '线') + '应用中（' + pts.length + ' 点）…')
    try {
      const r = await host.call('edit.apply', { path, op: 'feature-add', args: { geometry }, inPlace })
      setOut(fmtJson(r))
      if (r && r.ok) { drawRef.current = []; setDrawN(0) }
      await afterEdit(r)
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 面切割（WASM 技能通道，2026-08-18 第六十六轮）：画布攒切割线（≥2 点），
  // host 注入 _role="cut" 后走 split_polygons.wasm（kanyu skill run CLI 出口，
  // 内核 geo Buffer+BooleanOps 差集劈分）；产出落 dsh/output 接力为当前图层
  // （对齐 tbRun 产图层联动语义），撤销由编辑栈外副本语义承担（原数据不动）
  async function applyCutPoly() {
    const pts = drawRef.current
    if (pts.length < 2) { setOut('切割线至少需要 2 个顶点（当前 ' + pts.length + '）'); return }
    const outPath = 'dsh/output/kanyu-split-' + Date.now() + '.geojson'
    setBusy(true); setOut('面切割应用中（' + pts.length + ' 点切割线）…')
    try {
      const r = await host.call('skill.run', { skill: 'dsh/skills/split_polygons.wasm', input: path, output: outPath, cutLine: pts })
      if (r && r.ok) {
        drawRef.current = []; setDrawN(0)
        store.path = outPath; setPath(outPath)
        store.rev++; props.notify() // 版本号广播（同 afterEdit 语义）
        setAttrs(null)
        setOut('面切割完成 → 已设为当前图层: ' + outPath)
        const g2 = await host.call('edit.geometry', { path: outPath, maxFeatures: 200 })
        if (g2 && g2.ok) setGeo(g2)
      } else {
        setOut('面切割失败: ' + String(r && (r.stderr || r.error) || '未知').slice(0, 400))
        drawOverlay()
      }
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 编辑写回联动刷新（与 vUp 同语义）：产出接力当前路径 + 版本号广播 + 几何重载
  async function afterEdit(r) {
    const nextPath = (r && r.ok && !inPlace && r.output) ? r.output : path
    if (r && r.ok && nextPath !== path) { store.path = nextPath; setPath(nextPath) }
    if (r && r.ok) {
      store.rev++; props.notify()
      setAttrs(null)
      const g2 = await host.call('edit.geometry', { path: nextPath, maxFeatures: 200 })
      if (g2 && g2.ok) setGeo(g2)
    } else if (mapRef.current) drawOverlay()
  }
  async function doSplitPoint(rx, ry) {
    const idx = attrIdx >= 0 ? attrIdx : 0
    setBusy(true); setOut('线打断 (' + rx + ', ' + ry + ') → 要素 #' + idx + '…')
    try {
      const r = await host.call('edit.apply', { path, op: 'line-split', args: { index: idx, x: rx, y: ry }, inPlace })
      setOut(fmtJson(r))
      await afterEdit(r)
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  async function applyHole() {
    const pts = drawRef.current
    if (pts.length < 3) { setOut('挖洞至少需要 3 个顶点（当前 ' + pts.length + '）'); return }
    const idx = attrIdx >= 0 ? attrIdx : 0
    setBusy(true); setOut('挖洞应用中（#' + idx + '，' + pts.length + ' 点）…')
    try {
      const r = await host.call('edit.apply', { path, op: 'hole-add', args: { index: idx, ring: pts }, inPlace })
      setOut(fmtJson(r))
      if (r && r.ok) { drawRef.current = []; setDrawN(0) }
      await afterEdit(r)
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  function toggleDraw(mode) {
    const next = drawMode === mode ? '' : mode
    setDrawMode(next)
    drawRef.current = []; setDrawN(0)
    if (cvE && geo) mapRef.current = drawEdit2d(cvE, geo, null, editOpts()) // 退出/切换清覆盖层
  }
  // 字段计算器（壳层 attrtable.rs preview_calc 语义：前 5 行求值预览；应用走
  // data.calc RPC → kanyu data calc 出口；inPlace 原地覆盖，否则写 .edited.geojson）
  const [calcTarget, setCalcTarget] = React.useState('')
  const [calcExpr, setCalcExpr] = React.useState('')
  const [calcPrev, setCalcPrev] = React.useState('')
  async function calcPreview() {
    setBusy(true); setOut('计算预览…')
    try {
      const r = await host.call('data.calc', { path, target: calcTarget, expr: calcExpr })
      if (r && r.ok) {
        const fc = JSON.parse(r.stdout.slice(r.stdout.search(/[{[]/)))
        const vals = fc.features.slice(0, 5).map(f => String((f.properties && f.properties[calcTarget]) ?? 'null'))
        setCalcPrev(vals.join(' | '))
        setOut('预览就绪（共 ' + fc.features.length + ' 要素，应用后全量写入 ' + calcTarget + '）')
      } else { setCalcPrev(''); setOut('表达式错误: ' + String((r && r.stderr) || '未知').slice(0, 300)) }
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  async function calcApply() {
    const nextPath = inPlace ? path : path.replace(/\.geojson$/i, '') + '.edited.geojson'
    setBusy(true); setOut('字段计算应用中…')
    try {
      const r = await host.call('data.calc', { path, target: calcTarget, expr: calcExpr, output: nextPath })
      if (r && r.ok) {
        const m = /已写出 (\d+) 个要素/.exec(r.stderr || '')
        setOut('字段计算完成（' + calcTarget + '）：' + (m ? m[1] : '?') + ' 要素 → ' + nextPath)
        if (nextPath !== path) { store.path = nextPath; setPath(nextPath) }
        setAttrs(null)
        if (geo) { const g2 = await host.call('edit.geometry', { path: nextPath, maxFeatures: 200 }); if (g2 && g2.ok) setGeo(g2) }
        store.rev++; props.notify()
      } else setOut('字段计算失败: ' + String((r && r.stderr) || '未知').slice(0, 300))
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 技能分析对话框（WASM 沙箱，2026-08-19 第七十轮）：缓冲区（buffer_zones
  // _distance）/ 叠加分析（overlay_ops _op + 第二图层）；param/input2 注入通道，
  // 产出落 dsh/output 接力当前图层（同 applyCutPoly 产图层联动语义）
  const [bufDist, setBufDist] = React.useState('')
  const [ovlOp, setOvlOp] = React.useState('intersect')
  const [ovlPath2, setOvlPath2] = React.useState('')
  const [disField, setDisField] = React.useState('')
  async function skillRelay(r, outPath, label) {
    if (r && r.ok) {
      store.path = outPath; setPath(outPath)
      store.rev++; props.notify() // 版本号广播（同 afterEdit 语义）
      setAttrs(null)
      setOut(label + '完成 → 已设为当前图层: ' + outPath)
      const g2 = await host.call('edit.geometry', { path: outPath, maxFeatures: 200 })
      if (g2 && g2.ok) setGeo(g2)
    } else {
      setOut(label + '失败: ' + String(r && (r.stderr || r.error) || '未知').slice(0, 400))
      drawOverlay()
    }
    setBusy(false)
  }
  async function applyBuffer() {
    const d = parseFloat(bufDist)
    if (!(d > 0)) { setOut('缓冲距离须为正数（当前: ' + (bufDist || '空') + '）'); return }
    const outPath = 'dsh/output/kanyu-buffer-' + Date.now() + '.geojson'
    setBusy(true); setOut('缓冲区分析中（距离 ' + d + '）…')
    try {
      const r = await host.call('skill.run', { skill: 'dsh/skills/buffer_zones.wasm', input: path, output: outPath, param: { _distance: d } })
      await skillRelay(r, outPath, '缓冲区')
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)); setBusy(false) }
  }
  async function applyOverlay() {
    if (!ovlPath2) { setOut('叠加分析需要第二图层路径（叠加层）'); return }
    const outPath = 'dsh/output/kanyu-overlay-' + Date.now() + '.geojson'
    setBusy(true); setOut('叠加分析中（' + ovlOp + ' ← ' + ovlPath2 + '）…')
    try {
      const r = await host.call('skill.run', { skill: 'dsh/skills/overlay_ops.wasm', input: path, input2: ovlPath2, output: outPath, param: { _op: ovlOp } })
      await skillRelay(r, outPath, '叠加分析')
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)); setBusy(false) }
  }
  async function applyDissolve() {
    if (!disField) { setOut('融合需要分组字段名'); return }
    const outPath = 'dsh/output/kanyu-dissolve-' + Date.now() + '.geojson'
    setBusy(true); setOut('融合分析中（按 ' + disField + ' 分组合并）…')
    try {
      const r = await host.call('skill.run', { skill: 'dsh/skills/dissolve_field.wasm', input: path, output: outPath, param: { _field: disField } })
      await skillRelay(r, outPath, '融合')
    } catch (e) { setOut('RPC 失败: ' + (e && e.message || e)); setBusy(false) }
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
    h('div', { className: 'kyg-hint' }, '编辑历史对齐 kanyu-edit 双栈：变更入 undo 栈（容量 100），新变更清空 redo'),
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
    h('div', { className: 'kyg-hint' }, '—— 字段计算器（attrcalc 内核，含前 5 行预览）——'),
    h('div', { className: 'kyg-row' },
      h('input', { className: 'kyg-input', style: { maxWidth: '30%' }, value: calcTarget, placeholder: '目标字段（不存在则新建）', onChange: e => setCalcTarget(e.target.value) }),
      h('input', { className: 'kyg-input', value: calcExpr, placeholder: '表达式：如 [height] * 2 或 $area / 10000', onChange: e => setCalcExpr(e.target.value) })),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path || !calcTarget || !calcExpr, onClick: calcPreview }, '预览前 5 行'),
      h('button', { className: 'kyg-btn', disabled: busy || !path || !calcTarget || !calcExpr, onClick: calcApply }, '应用')),
    calcPrev ? h('div', { className: 'kyg-hint' }, '预览（前 5 行）: ' + calcPrev) : null,
    h('div', { className: 'kyg-hint' }, '—— 顶点编辑 ——'),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy || !path, onClick: loadGeo }, '加载几何'),
      h('label', { className: 'kyg-hint' },
        h('input', { type: 'checkbox', checked: topoMode, onChange: e => setTopoMode(e.target.checked) }), ' 拓扑模式（共享顶点一次同移）'),
      h('label', { className: 'kyg-hint' },
        h('input', { type: 'checkbox', checked: marquee, onChange: e => {
          setMarquee(e.target.checked)
          if (!e.target.checked) { selRef.current = []; setSelN(0); if (cvE && geo) mapRef.current = drawEdit2d(cvE, geo, null, editOpts()) }
        } }), ' 框选'),
      selN > 0 ? h('span', { className: 'kyg-sel' }, '已选 ' + selN + ' 顶点') : null,
      geo ? h('span', { className: 'kyg-hint' }, marquee
        ? '拖橡皮筋框选顶点（单击清空）；关掉框选后拖拽任一选中顶点，整组批量移动（vertices-move 单条撤销）'
        : topoMode ? '拖拽顶点方块，松开写 topo-move（共享坐标全要素同移，撤销可回退）' : '拖拽顶点方块，松开即写 vertex-move（撤销可回退）') : null),
    geo ? h('canvas', {
      ref: setCvE, className: 'kyg-canvas', width: 540, height: 300,
      style: { cursor: 'crosshair', touchAction: 'none', background: '#fff' },
      onMouseDown: vDown, onMouseMove: vMove, onMouseUp: vUp, onMouseLeave: vUp,
    }) : null,
    geo ? h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy, onClick: () => toggleDraw('hole') },
        drawMode === 'hole' ? '退出挖洞绘制' : '绘制挖洞'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy, onClick: () => toggleDraw('split') },
        drawMode === 'split' ? '退出点选打断' : '点选打断'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy, onClick: () => toggleDraw('addPoint') },
        drawMode === 'addPoint' ? '退出绘制点' : '绘制点'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy, onClick: () => toggleDraw('addLine') },
        drawMode === 'addLine' ? '退出绘制线' : '绘制线'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy, onClick: () => toggleDraw('addPolygon') },
        drawMode === 'addPolygon' ? '退出绘制面' : '绘制面'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy, onClick: () => toggleDraw('cutPoly') },
        drawMode === 'cutPoly' ? '退出面切割' : '面切割'),
      drawMode === 'hole' && drawN >= 3
        ? h('button', { className: 'kyg-btn', disabled: busy, onClick: applyHole }, '应用挖洞（' + drawN + ' 点）') : null,
      drawMode === 'cutPoly' && drawN >= 2
        ? h('button', { className: 'kyg-btn', disabled: busy, onClick: applyCutPoly }, '应用面切割（' + drawN + ' 点）') : null,
      (drawMode === 'addLine' && drawN >= 2) || (drawMode === 'addPolygon' && drawN >= 3)
        ? h('button', { className: 'kyg-btn', disabled: busy, onClick: applyDrawNew },
            '应用绘制' + (drawMode === 'addPolygon' ? '面' : '线') + '（' + drawN + ' 点）') : null,
      drawMode && drawN > 0
        ? h('button', { className: 'kyg-btn kyg-btn-sub', disabled: busy,
            onClick: () => { drawRef.current = []; setDrawN(0); drawOverlay() } }, '清除攒点') : null) : null,
    drawMode ? h('div', { className: 'kyg-hint' }, drawMode === 'hole'
      ? '挖洞绘制：画布逐点点击 ≥3 点后「应用挖洞」（目标=属性表选中行，否则要素 #0；hole-add 自动闭合 + 面内校验）'
      : drawMode === 'split'
        ? '点选打断：单击线要素落点即 line-split（目标=属性表选中行，否则要素 #0；投影最近线段吸附顶点）'
        : drawMode === 'addPoint'
          ? '绘制点：单击画布落点即 feature-add Point（属性空表待属性页签补录）'
          : drawMode === 'addLine'
            ? '绘制线：逐点点击 ≥2 点后「应用绘制线」（feature-add LineString）'
            : drawMode === 'addPolygon'
              ? '绘制面：逐点点击 ≥3 点后「应用绘制面」（feature-add Polygon，自动闭合）'
              : '面切割：逐点点击 ≥2 点成切割线后「应用面切割」（split_polygons.wasm 技能劈开全部横贯面，产出新图层；原数据不动）') : null,
    h('div', { className: 'kyg-hint' }, '—— 技能分析（WASM 沙箱，产出接力当前图层）——'),
    h('div', { className: 'kyg-row' },
      h('input', { className: 'kyg-input', style: { maxWidth: '26%' }, value: bufDist, placeholder: '缓冲距离（地图单位，> 0）', onChange: e => setBufDist(e.target.value) }),
      h('button', { className: 'kyg-btn', disabled: busy || !path || !bufDist, onClick: applyBuffer }, '缓冲区')),
    h('div', { className: 'kyg-row' },
      h('select', { className: 'kyg-input', style: { maxWidth: '26%' }, value: ovlOp, onChange: e => setOvlOp(e.target.value) },
        h('option', { value: 'intersect' }, '相交 intersect'),
        h('option', { value: 'union' }, '合并 union'),
        h('option', { value: 'difference' }, '差集 difference')),
      h('input', { className: 'kyg-input', value: ovlPath2, placeholder: '第二图层路径（叠加层，GeoJSON）', onChange: e => setOvlPath2(e.target.value) }),
      h('button', { className: 'kyg-btn', disabled: busy || !path || !ovlPath2, onClick: applyOverlay }, '叠加分析')),
    h('div', { className: 'kyg-row' },
      h('input', { className: 'kyg-input', style: { maxWidth: '26%' }, value: disField, placeholder: '融合分组字段名（面要素按值合并）', onChange: e => setDisField(e.target.value) }),
      h('button', { className: 'kyg-btn', disabled: busy || !path || !disField, onClick: applyDissolve }, '融合')),
    h(ResultPre, { text: out }),
  )
}

// 3D：挤出体场景——投影链对齐内核 scene3d.rs 软件管线：
// 数据→画布线性映射（view.rs 同式）→ 绕画布中心 yaw 旋转 → sin(pitch) 俯仰压缩
// → 高度向上抬升；背面剔除 + 质心纵深排序（远先绘）+ 侧面两档明暗（0.55/0.75）；
// 高度归一化 = 画布高 × 0.25 / 最大高度（内核 MAX_HEIGHT_FRAC）；左键拖拽旋转
// （yaw += dx*0.01；pitch ∓ 0.3°/px，钳制 30°–45°；默认 yaw=-0.5、pitch=35°）。
// 类别色：字符串哈希 → HSL 稳定取色（同类别恒同色；壳层 symbology 唯一值
// 语义的 3D 轻量投影），返回 [r,g,b]
function catColor(cat) {
  let n = 0
  const s = String(cat)
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0
  const hue = (n % 360) / 360, sat = 0.52, lit = 0.58
  const q2 = lit < 0.5 ? lit * (1 + sat) : lit + sat - lit * sat
  const p2 = 2 * lit - q2
  const conv = t => {
    let tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t
    if (tt < 1 / 6) return p2 + (q2 - p2) * 6 * tt
    if (tt < 1 / 2) return q2
    if (tt < 2 / 3) return p2 + (q2 - p2) * (2 / 3 - tt) * 6
    return p2
  }
  return [Math.round(conv(hue + 1 / 3) * 255), Math.round(conv(hue) * 255), Math.round(conv(hue - 1 / 3) * 255)]
}
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
  const shade = (base, k, a) => 'rgba(' + Math.round(base[0] * k) + ',' + Math.round(base[1] * k) + ',' + Math.round(base[2] * k) + ',' + a + ')'
  // 装配：棱柱（顶面 + 已剔除侧面 + 明暗档，类别色按 f.cat 稳定取色）/ 贴地线 / 贴地点
  const prisms = [], gLines = [], gPoints = []
  for (const f of data.features) {
    const ring = f.ring
    if (!ring || ring.length === 0) continue
    if (f.geom === 'Point') { gPoints.push(proj(ring[0][0], ring[0][1], 0)); continue }
    if (f.geom === 'LineString') { gLines.push(ring.map(p => proj(p[0], p[1], 0))); continue }
    if (ring.length < 3) continue
    const fbase = f.color ? (hexToRgb(f.color) || BASE)
      : f.cat != null ? (data.catColors && data.catColors[f.cat] ? hexToRgb(data.catColors[f.cat]) || catColor(f.cat) : catColor(f.cat))
      : BASE
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
    prisms.push({ depth: rotate(mx / ground.length, my / ground.length)[1], top, sides, base: fbase })
  }
  prisms.sort((p1, p2) => p2.depth - p1.depth) // 质心纵深：远 → 近
  const fillPoly = pts => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill() }
  for (const pr of prisms) {
    for (const s of pr.sides) { g.fillStyle = shade(pr.base, s.dark ? 0.55 : 0.75, 0.92); fillPoly(s.q) }
    if (pr.top.length >= 3) {
      g.fillStyle = shade(pr.base, 1, 0.95); g.strokeStyle = 'rgba(60,40,36,.7)'; g.lineWidth = 0.6
      fillPoly(pr.top); g.stroke()
    }
  }
  g.strokeStyle = shade(BASE, 0.85, 0.9); g.lineWidth = 1.5
  for (const ln of gLines) { g.beginPath(); ln.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke() }
  g.fillStyle = shade(BASE, 0.85, 0.95)
  for (const p of gPoints) { g.beginPath(); g.arc(p[0], p[1], 3, 0, 6.2832); g.fill() }
  g.fillStyle = '#6b7489'; g.font = '11px sans-serif'
  g.fillText('堪舆 3D · ' + data.count + ' 要素 · 高度字段 ' + data.heightField +
    (data.colorField ? ' · 着色 ' + data.colorField + '（' + (data.categories || []).length + ' 类）' : '') +
    (data.symbologyMode ? ' · 符号化 ' + data.symbologyMode : '') +
    ' · 方位角 ' + Math.round(yaw * 180 / Math.PI) + '° 俯仰 ' + Math.round(pitchDeg) + '° · 拖拽旋转', 10, 16)
}

function Tab3d(props) {
  const store = props.store
  const [path, setPath] = React.useState(store.path)
  const [hf, setHf] = React.useState('height')
  const [cf, setCf] = React.useState('')
  // 符号化编辑模型（第五十四轮，与地图页签同 buildSymbology 语义）：
  // none=基色/着色字段哈希色；single/categorical/graduated 由 Host 逐要素取色
  const [symMethod, setSymMethod] = React.useState('none')
  const [symField, setSymField] = React.useState('')
  const [symSpec, setSymSpec] = React.useState('')
  const [singleColor, setSingleColor] = React.useState('#D9A23C')
  const [otherColor, setOtherColor] = React.useState('#888888')
  const [ramp, setRamp] = React.useState('Jade')
  const [data, setData] = React.useState(null)
  const [msg, setMsg] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [cv, setCv] = React.useState(null)
  // 视角状态（对齐内核 Scene3D：yaw 弧度 / pitch 角度制，拖拽调节）
  const [view, setView] = React.useState({ yaw: -0.5, pitch: 35 })
  // 视角书签 + PNG 导出（2026-08-19 第七十二轮）：书签存当前 yaw/pitch 点击恢复；
  // 导出取画布 toDataURL 触发浏览器下载。
  // 书签持久化（2026-08-19 第七十三轮）：localStorage 按图层路径键控
  // （kanyu-3d-views:<path>），跨会话留存 + 逐条删除
  const [views, setViews] = React.useState([])
  const [viewName, setViewName] = React.useState('')
  const viewsKey = 'kanyu-3d-views:' + path
  React.useEffect(() => {
    try { setViews(JSON.parse(localStorage.getItem(viewsKey) || '[]')) }
    catch { setViews([]) }
  }, [viewsKey])
  function persistViews(next) {
    setViews(next)
    try { localStorage.setItem(viewsKey, JSON.stringify(next)) } catch { /* 容量满静默 */ }
  }
  function saveView() {
    const name = viewName.trim() || ('视角 ' + (views.length + 1))
    persistViews(views.concat([{ name, yaw: view.yaw, pitch: view.pitch }]))
    setViewName('')
  }
  function delView(i) { persistViews(views.filter((_, j) => j !== i)) }
  function exportPng() {
    if (!cv) { setMsg('画布未就绪'); return }
    const a = document.createElement('a')
    a.href = cv.toDataURL('image/png')
    a.download = 'kanyu-scene3d-' + Date.now() + '.png'
    a.click()
    setMsg('已导出 PNG（浏览器下载）: ' + a.download)
  }
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
  async function load(p) {
    const usePath = p || path
    const sym = buildSymbology(symMethod, symField, symSpec, singleColor, otherColor, ramp)
    if (sym && sym.error) { setMsg('符号化参数: ' + sym.error); return }
    setBusy(true); setMsg('制备场景数据中…')
    try {
      const r = await host.call('scene3d.data', { path: usePath, heightField: hf, maxFeatures: 300, colorField: cf || undefined, symbology: sym || undefined })
      if (r && r.ok) { setData(r); setMsg(r.count + '/' + r.total + ' 要素 · bbox ' + fmtJson(r.bbox, 200) + (r.symbologyMode ? ' · 符号化 ' + r.symbologyMode : '')) }
      else setMsg('失败: ' + (r && r.error || '未知'))
    } catch (e) { setMsg('RPC 失败: ' + (e && e.message || e)) }
    setBusy(false)
  }
  // 联动重载（2026-08-18 第四十一轮）：已加载过时，跟随当前图层切换
  // （store.path 变化）或同路径内容变更（store.rev 递增）自动重载场景；未加载不自动制备
  const auto3dRef = React.useRef({ path: '', rev: -1 })
  React.useEffect(() => {
    const a = auto3dRef.current
    if (!data) { a.path = store.path; a.rev = store.rev; return }
    if (store.path === a.path && store.rev === a.rev) return
    a.path = store.path; a.rev = store.rev
    if (store.path) load(store.path)
  }, [store.path, store.rev, data])
  return h('div', null,
    Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
    Field('高度字段', h('input', { className: 'kyg-input', value: hf, onChange: e => setHf(e.target.value) })),
    Field('着色字段', h('input', { className: 'kyg-input', value: cf, onChange: e => setCf(e.target.value), placeholder: '可选：分类着色（如 usage）；留空单色基色' })),
    h('div', { className: 'kyg-row' },
      h('span', { className: 'kyg-label' }, '符号化'),
      h('select', { className: 'kyg-input', value: symMethod, onChange: e => setSymMethod(e.target.value) },
        h('option', { value: 'none' }, '默认'),
        h('option', { value: 'single' }, '单色 (single)'),
        h('option', { value: 'categorical' }, '唯一值 (categorical)'),
        h('option', { value: 'graduated' }, '分级 (graduated)')),
      symMethod === 'single' ? h('input', { type: 'color', className: 'kyg-input', value: singleColor, onChange: e => setSingleColor(e.target.value) }) : null,
      symMethod === 'categorical' || symMethod === 'graduated' ? h('input', { className: 'kyg-input', style: { width: '100px' }, placeholder: '字段名', value: symField, onChange: e => setSymField(e.target.value) }) : null,
      symMethod === 'categorical' || symMethod === 'graduated' ? h('input', { className: 'kyg-input', style: { flex: 1 }, value: symSpec, onChange: e => setSymSpec(e.target.value),
        placeholder: symMethod === 'graduated' ? '断点,…（严格升序，如 10,20,40）' : '类别:#RRGGBB,…' }) : null,
      symMethod === 'graduated' ? h('select', { className: 'kyg-input', value: ramp, onChange: e => setRamp(e.target.value) },
        h('option', { value: 'Jade' }, '青玉'), h('option', { value: 'Amber' }, '琥珀'), h('option', { value: 'Slate' }, '蓝灰')) : null,
      symMethod === 'categorical' ? h('input', { type: 'color', className: 'kyg-input', title: '<其他> 色', value: otherColor, onChange: e => setOtherColor(e.target.value) }) : null,
      h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: () => load() }, '加载 3D 场景')),
    h('div', { className: 'kyg-hint' }, msg),
    h('canvas', {
      ref: setCv, className: 'kyg-canvas', width: 540, height: 360,
      style: { cursor: 'grab', touchAction: 'none' },
      onMouseDown: onDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: onUp,
    }),
    h('div', { className: 'kyg-row' },
      h('button', { className: 'kyg-btn kyg-btn-sub', onClick: () => setView({ yaw: -0.5, pitch: 35 }) }, '复位视角'),
      h('input', { className: 'kyg-input', style: { maxWidth: '22%' }, value: viewName, placeholder: '书签名称（可选）', onChange: e => setViewName(e.target.value) }),
      h('button', { className: 'kyg-btn kyg-btn-sub', onClick: saveView }, '存视角书签'),
      h('button', { className: 'kyg-btn kyg-btn-sub', disabled: !data, onClick: exportPng }, '导出 PNG')),
    views.length ? h('div', { className: 'kyg-row', style: { flexWrap: 'wrap' } },
      views.map((v, i) => h('span', { key: i, style: { marginRight: '6px' } },
        h('button', { className: 'kyg-btn kyg-btn-sub',
          title: 'yaw ' + v.yaw.toFixed(2) + ' / pitch ' + v.pitch + '°',
          onClick: () => setView({ yaw: v.yaw, pitch: v.pitch }) }, '⌖ ' + v.name),
        h('button', { className: 'kyg-btn kyg-btn-sub', title: '删除书签',
          onClick: () => delView(i) }, '×')))) : null,
    // 类别图例（模型色 catColors 优先，缺省 catColor 哈希色，色块与棱柱同色）
    data && data.categories ? h('div', { className: 'kyg-row', style: { flexWrap: 'wrap' } },
      data.categories.map(c => h('span', { key: c, className: 'kyg-hint', style: { marginRight: '10px' } },
        h('span', { style: { display: 'inline-block', width: '10px', height: '10px', marginRight: '4px', borderRadius: '2px',
          background: (data.catColors && data.catColors[c]) || 'rgb(' + catColor(c).join(',') + ')' } }),
        c))) : null,
  )
}

// 关于：组件状态
function TabAbout() {
  const [info, setInfo] = React.useState(null)
  React.useEffect(() => { host.call('ping', {}).then(setInfo).catch(e => setInfo({ error: String(e && e.message || e) })) }, [])
  return h('div', null,
    h('div', { className: 'kyg-hint' }, '堪舆 GIS × DeepSeek Harness 组件 —— 七大能力域经 kanyu CLI 内核驱动；模型侧能力由 9 个 kanyu_* 动态工具承接（Harness function-calling）。'),
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
    const store = { open: false, path: '', rev: 0, sym: null, kyu: '', layerId: '' }
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
        h('span', null, '组件已激活：目录/数据/地图/坐标/处理/编辑/3D 七大能力 + 9 个 kanyu_* 模型工具'),
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

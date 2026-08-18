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
    function TabCatalog(props) {
      const store = props.store
      const [dir, setDir] = React.useState('')
      const [items, setItems] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [msg, setMsg] = React.useState('')
      async function scan() {
        setBusy(true); setMsg('扫描中…')
        try {
          const r = await hostCall('catalog.list', { dir: dir || undefined, depth: 3 })
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
          const r = await hostCall(method, args)
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

    // 地图：离屏渲染面板
    function TabMap(props) {
      const store = props.store
      const [path, setPath] = React.useState(store.path)
      const [theme, setTheme] = React.useState('light')
      const [img, setImg] = React.useState(null)
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
      async function render2d() {
        setBusy(true); setMsg('渲染中（kanyu render map）…'); setImg(null)
        try {
          const r = await hostCall('render.map', { path, theme, width: 760, height: 520 })
          if (r && r.pngBase64) { setImg('data:image/png;base64,' + r.pngBase64); setMsg('落盘: ' + r.out) }
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
          h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: render2d }, '渲染')),
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
      return h('div', null,
        Field('数据', h('input', { className: 'kyg-input', value: path, onChange: e => setPath(e.target.value) })),
        Field('算子', h('select', { className: 'kyg-input', value: op, onChange: e => { setOp(e.target.value); setArgsText(HINTS[e.target.value] || '{}') } },
          OPS.map(o => h('option', { key: o, value: o }, o)))),
        h('div', { className: 'kyg-hint' }, '参数示例: ' + (HINTS[op] || '{}')),
        h('textarea', { className: 'kyg-input', rows: 3, value: argsText, onChange: e => setArgsText(e.target.value) }),
        h('div', { className: 'kyg-row' },
          h('label', { className: 'kyg-hint' },
            h('input', { type: 'checkbox', checked: inPlace, onChange: e => setInPlace(e.target.checked) }), ' 原地覆盖（默认写 .edited.geojson）'),
          h('button', { className: 'kyg-btn', disabled: busy || !path, onClick: apply2 }, '应用')),
        h(ResultPre, { text: out }),
      )
    }

    // 3D：挤出体场景（canvas 等距投影）
    function drawScene3d(cv, data) {
      const g = cv.getContext('2d')
      const W = cv.width, H = cv.height
      g.clearRect(0, 0, W, H)
      g.fillStyle = 'rgba(10,14,22,1)'; g.fillRect(0, 0, W, H)
      if (!data || !data.bbox || !data.features || data.features.length === 0) {
        g.fillStyle = '#6b7489'; g.font = '12px sans-serif'
        g.fillText('无场景数据（加载 GeoJSON 后绘制挤出体）', 16, 24)
        return
      }
      const b = data.bbox
      const dx = Math.max(b[2] - b[0], 1e-9), dy = Math.max(b[3] - b[1], 1e-9)
      const scale = Math.min(W * 0.9 / (dx + dy), H * 1.4 / (dx + dy))
      let maxH = 1
      data.features.forEach(f => { if (f.height > maxH) maxH = f.height })
      const zPix = H * 0.38 / maxH
      function proj(x, y, z) {
        const nx = x - b[0] - dx / 2, ny = y - b[1] - dy / 2
        return [W / 2 + (nx - ny) * 0.7071 * scale, H * 0.78 - (nx + ny) * 0.5 * scale - z * zPix]
      }
      const feats = data.features.slice().sort((f1, f2) => {
        const c1 = f1.ring.reduce((s, p) => s + p[0] + p[1], 0)
        const c2 = f2.ring.reduce((s, p) => s + p[0] + p[1], 0)
        return c1 - c2
      })
      for (const f of feats) {
        const ring = f.ring
        const t = Math.min(1, f.height / maxH)
        const top = 'rgba(' + Math.round(214 - 60 * t) + ',' + Math.round(120 + 60 * t) + ',' + Math.round(90 + 40 * t) + ',.95)'
        const wall = 'rgba(120,72,56,.88)'
        if (f.geom === 'Point') {
          const p = proj(ring[0][0], ring[0][1], f.height)
          g.fillStyle = top; g.beginPath(); g.arc(p[0], p[1], 3.5, 0, 6.2832); g.fill()
          continue
        }
        if (f.geom === 'LineString') {
          g.strokeStyle = top; g.lineWidth = 1.6; g.beginPath()
          ring.forEach((p, i) => { const q = proj(p[0], p[1], f.height); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]) })
          g.stroke()
          continue
        }
        // 棱柱：先四壁后顶面
        g.fillStyle = wall
        for (let i = 0; i < ring.length - 1; i++) {
          const a0 = proj(ring[i][0], ring[i][1], 0), a1 = proj(ring[i + 1][0], ring[i + 1][1], 0)
          const b0 = proj(ring[i][0], ring[i][1], f.height), b1 = proj(ring[i + 1][0], ring[i + 1][1], f.height)
          g.beginPath(); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.lineTo(b1[0], b1[1]); g.lineTo(b0[0], b0[1]); g.closePath(); g.fill()
        }
        g.fillStyle = top; g.strokeStyle = 'rgba(60,30,24,.8)'; g.lineWidth = 0.6
        g.beginPath()
        ring.forEach((p, i) => { const q = proj(p[0], p[1], f.height); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]) })
        g.closePath(); g.fill(); g.stroke()
      }
      g.fillStyle = '#9aa4b8'; g.font = '11px sans-serif'
      g.fillText('堪舆 3D · ' + data.count + ' 要素 · 高度字段 ' + data.heightField, 10, 16)
    }

    function Tab3d(props) {
      const store = props.store
      const [path, setPath] = React.useState(store.path)
      const [hf, setHf] = React.useState('height')
      const [data, setData] = React.useState(null)
      const [msg, setMsg] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [cv, setCv] = React.useState(null)
      React.useEffect(() => { if (store.path) setPath(store.path) }, [store.path])
      React.useEffect(() => { if (cv && data) drawScene3d(cv, data) }, [cv, data])
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
        h('canvas', { ref: setCv, className: 'kyg-canvas', width: 540, height: 360 }),
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

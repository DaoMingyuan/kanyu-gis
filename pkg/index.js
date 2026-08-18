// ============================================================================
// kanyu-gis 常驻静态插件 —— dsh/plugin/host.js 的安装适配器
// ----------------------------------------------------------------------------
// 背景：DSH 动态包（cordis_define/cordis_run）是进程内存态——不落盘、重启不恢复
// （dsh-cordis-host-runner README「Storage stance」原文）。常驻安装只能走常规
// 插件工作流：本包作为 web profile 的普通本地插件（cordis.patch.yml insert 行
// + profile 内 file: 依赖），激活时读取**单一事实源** ../plugin/host.js 原文，
// 以 new Function 求值（host.js 为沙箱函数体、顶层 return），并注入 harness
//  façade：
//   - harness.registerTool → ctx.tools.register（dsh-tools 注册表；
//     parameters 从 defineTool 方言逐属性表折算为标准 JSON Schema 对象；
//     output.render 原样透传 ContentBlock[] 投影）
//   - harness.handle → 收集 RPC 表，经 webServer 前缀路由 `/kanyu-gis/call`
//     桥给浏览器 Client 半（静态形态无 host.call 通道——host.call 是动态包
//     专利，由 cordis-client-runner 按 pluginRunId 桥接；静态客户端的官方
//     等价物就是这条同源 HTTP 自定义路由，见 client.js 头注）
//   - ctx.get('shell'|'fs'|'sandboxPolicy') → 真实宿主服务（与动态沙箱同键）
//
// 导出形状：命名导出 name/apply、无 default（dsh 约定，postmortem 0001）。
// 依赖为零（不 import 任何 @deepseek-ai/* 包——file: 符号链接下向上解析
// 不可靠，全部经 ctx.get 延迟取服务）。
// ============================================================================

import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'kanyu-gis'

// 服务注入声明：Cordis 中未 inject 的服务经 ctx.get 取到 undefined
// （2026-08-18 首验实测：无 inject 时 tools 服务不可用、插件静默停用）。
// 五键在 web profile 均有提供方（pwsh/bash-sandbox → shell；fs-sandbox → fs；
// sandbox-policy；tools 注册表；dsh-host-webserver → webServer 路由注册表）。
export const inject = ['tools', 'shell', 'fs', 'sandboxPolicy', 'webServer']

// host.js 源定位：config.hostSource（安装侧组合行显式声明）优先；
// 缺省回退 realpath 相对解析（pnpm file: 符号链接 → 仓库 dsh/pkg/ → ../plugin/host.js）
function resolveHostSource(config) {
  if (config && typeof config.hostSource === 'string' && config.hostSource) {
    return config.hostSource
  }
  const here = path.dirname(realpathSync(fileURLToPath(import.meta.url)))
  return path.join(here, '..', 'plugin', 'host.js')
}

// host.js 的 defineTool 方言参数表 → 注册表标准 JSON Schema 对象
function toJsonSchema(params) {
  const properties = {}
  const required = []
  for (const [k, v] of Object.entries(params || {})) {
    const { required: req, ...rest } = v
    properties[k] = rest
    if (req) required.push(k)
  }
  const schema = { type: 'object', properties }
  if (required.length) schema.required = required
  return schema
}

export function apply(ctx, config) {
  const hostSrc = readFileSync(resolveHostSource(config), 'utf8')

  const tools = ctx.get('tools')
  if (!tools || typeof tools.register !== 'function') {
    console.error('kanyu-gis 静态插件：tools 服务不可用，停用（工具面未注册）')
    return
  }

  // harness façade（对齐动态沙箱的调用面）
  const rpcTable = new Map()
  let toolCount = 0
  const harness = {
    handle(name, fn) { rpcTable.set(name, fn) },
    defineTool(def) { return def },
    registerTool(_ctx, def) {
      tools.register({
        name: def.name,
        description: def.description,
        parameters: toJsonSchema(def.parameters),
        output: { schema: def.output.schema, render: def.output.render },
        execute: (args) => def.execute(args),
      })
      toolCount++
    },
  }

  // host.js 是 vm 沙箱函数体（顶层 return 导出插件对象），
  // new Function 与宿主 vm 求值语义等价（全局隔离、参数注入）。
  // skillDir：捆绑 WASM 技能目录（仓库 dsh/skills 绝对路径）——与 host.js 同源
  // 定位（config.hostSource 优先/realpath 回退；pnpm file: 安装形态 realpath
  // 可能滞留 node_modules 副本目录，故不可独立按 import.meta.url 推算）。
  // 生产实例会话工作区无 dsh/ 源码树，host.js skill.run 据此定位 split_polygons.wasm 等
  const skillDir = path.join(path.dirname(resolveHostSource(config)), '..', 'skills')
  const plugin = new Function(
    'ctx', 'harness', 'console', 'btoa', 'atob', 'TextEncoder', 'TextDecoder', 'skillDir',
    hostSrc,
  )(ctx, harness, console, btoa, atob, TextEncoder, TextDecoder, skillDir)

  if (!plugin || typeof plugin.apply !== 'function') {
    console.error('kanyu-gis 静态插件：host.js 未导出 apply，停用')
    return
  }
  plugin.apply(ctx)

  // ---- 浏览器 Client 半的 RPC 桥：/kanyu-gis 前缀路由 ----
  // 静态客户端没有动态包的 host.call 通道；官方等价物是 webServer 自定义
  // 路由（同源 fetch 直达，dsh-host-webserver 无鉴权包装——loopback 部署）。
  // handler 延迟查 rpcTable，注册先后与 host.js 填充顺序无关。
  const webServer = ctx.get('webServer')
  if (webServer && typeof webServer.register === 'function') {
    webServer.register({
      kind: 'prefix',
      path: '/kanyu-gis',
      handler: async (req, res) => {
        const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
        const send = (code, obj) => {
          res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(obj))
        }
        if (req.method === 'GET' && pathname === '/kanyu-gis/health') {
          send(200, { ok: true, tools: toolCount, rpc: rpcTable.size })
          return
        }
        if (req.method !== 'POST' || pathname !== '/kanyu-gis/call') {
          send(404, { error: 'not found: ' + req.method + ' ' + pathname })
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', async () => {
          try {
            const { method, args } = JSON.parse(body || '{}')
            const fn = rpcTable.get(method)
            if (!fn) { send(404, { error: 'unknown RPC method: ' + String(method) }); return }
            send(200, await fn(args || {}))
          } catch (e) {
            send(500, { error: String((e && e.message) || e) })
          }
        })
      },
    })
    console.log('kanyu-gis RPC 桥已注册：POST /kanyu-gis/call（' + rpcTable.size + ' 项）+ GET /kanyu-gis/health')
  } else {
    console.error('kanyu-gis 静态插件：webServer 服务不可用，Client 半 RPC 桥未注册')
  }

  console.log(`kanyu-gis 静态插件已激活：${toolCount} 个 kanyu_* 工具注册进工具注册表` +
    `（RPC 表 ${rpcTable.size} 项经 /kanyu-gis/call 桥给浏览器 Client 半）`)
}

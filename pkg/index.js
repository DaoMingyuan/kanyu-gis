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
//   - harness.handle → 收集 RPC 表（静态形态无浏览器 host.call 通道——
//     Web 工作台仍由动态包路线 cordis_run 提供；本适配器常驻的是模型工具面）
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
// 四键在 web profile 均有提供方（pwsh/bash-sandbox → shell；fs-sandbox → fs；
// sandbox-policy；tools 注册表）。
export const inject = ['tools', 'shell', 'fs', 'sandboxPolicy']

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
  const plugin = new Function(
    'ctx', 'harness', 'console', 'btoa', 'atob', 'TextEncoder', 'TextDecoder',
    hostSrc,
  )(ctx, harness, console, btoa, atob, TextEncoder, TextDecoder)

  if (!plugin || typeof plugin.apply !== 'function') {
    console.error('kanyu-gis 静态插件：host.js 未导出 apply，停用')
    return
  }
  plugin.apply(ctx)

  console.log(`kanyu-gis 静态插件已激活：${toolCount} 个 kanyu_* 工具注册进工具注册表` +
    `（RPC 表 ${rpcTable.size} 项静态形态下仅供未来桥接）`)
}

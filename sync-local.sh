#!/usr/bin/env bash
# dsh/sync-local.sh —— 一键本地同步：preset 回灌 + 静态插件重装。
#
# 契约（2026-08-18 用户指令）：dsh/ 组件源每次更新完成后，本地必须同步更新。
#   ① sync-preset.sh：preset → ~/.dsh/.agent-presets/kanyu-gis/ + 旁路校验
#   ② dsh plugin --profile web remove/add：pnpm file: 是副本非活链，
#      改 dsh/pkg/ 或 dsh/plugin/host.js 后必须重装刷新 profile 副本
#
# 边界：本脚本只同步文件与安装，不触碰运行中的 DSH 实例。
#   DSH web 的组合树与客户端 boot 图在启动时一次成型——
#   同步后须重启 `dsh web` 实例，面板/工具刷新方生效（2026-08-18 实测：
#   运行中实例不会热加载，boot 图无条目、bundle 404 即过期实例症状）。
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"

echo "== ① preset 同步（sync-preset.sh）=="
bash "$HERE/sync-preset.sh"

echo "== ② 静态插件重装（web profile，pnpm file: 副本刷新）=="
NPX_CACHE="$HOME/AppData/Local/npm-cache/_npx/1e7f6d9597241db0"
if [ -x "$NPX_CACHE/node_modules/.bin/dsh" ]; then
  DSH="$NPX_CACHE/node_modules/.bin/dsh"
elif command -v dsh >/dev/null 2>&1; then
  DSH="$(command -v dsh)"
else
  echo "✗ 未找到 dsh CLI（npx 缓存与 PATH 均无）" >&2
  exit 2
fi
WORK="$(cd "$NPX_CACHE" 2>/dev/null && pwd || echo "$ROOT")"
PKG_PATH="$(cygpath -m "$ROOT/dsh/pkg" 2>/dev/null || echo "$ROOT/dsh/pkg")"
PROFILE_NM="$HOME/.dsh/profiles/web/node_modules/kanyu-gis-dsh-plugin"
(cd "$WORK" && "$DSH" plugin --profile web remove kanyu-gis-dsh-plugin || true)
# remove 偶发部分失败（pnpm 报错但目录已删，或残留旧副本）——强制清残留，
# 否则紧随的 add 会命中缓存跳过拷贝，profile 副本滞留旧内容（2026-08-18 实测）
[ -d "$PROFILE_NM" ] && rm -rf "$PROFILE_NM"
(cd "$WORK" && "$DSH" plugin --profile web add "file:$PKG_PATH")
# 新鲜度校验：profile 副本与仓库源内容级一致（忽略 CRLF 差异），不一致即失败
if [ -f "$PROFILE_NM/client.js" ] && ! diff <(tr -d '\r' < "$PROFILE_NM/client.js") <(tr -d '\r' < "$ROOT/dsh/pkg/client.js") >/dev/null; then
  echo "✗ profile 副本与仓库源不一致（pnpm 缓存复用？）——请手工 remove 后删 $PROFILE_NM 再 add" >&2
  exit 1
fi

echo "== 完成。若 dsh web 正在运行，重启实例后组合树/boot 图刷新生效 =="

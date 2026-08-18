#!/usr/bin/env bash
# dsh/sync-preset.sh —— 把仓库内 GIS 模式 preset 源同步到本机 DSH 安装区。
#
# 用法（仓库根目录，Git Bash）：
#   bash dsh/sync-preset.sh [--clean]
#
# 行为：
#   1. 目标目录 = ${DSH_HOME:-$HOME/.dsh}/.agent-presets/kanyu-gis/
#      （用户私有安装区，DSH 升级不覆盖；缺省 --clean 先清空再全量复制，防残留）
#   2. 复制 dsh/presets/kanyu-gis/ 全量内容（preset.yml / agent.cordis.yml / skills/）
#   3. 复制后运行 dsh/tools/verify_preset.mjs 旁路校验（node 可用时）
#
# 本脚本替代早期文档中不可复现的 `kanyu dsh --preset ...` 虚写命令
# （kanyu CLI 无 dsh 子命令；同步职责属于本脚本，见 docs/GIS_MODE.md §2）。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/dsh/presets/kanyu-gis"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
DEST="$DSH_HOME_DIR/.agent-presets/kanyu-gis"

if [[ ! -f "$SRC/preset.yml" || ! -f "$SRC/agent.cordis.yml" ]]; then
  echo "错误：preset 源不完整（$SRC 缺 preset.yml 或 agent.cordis.yml）" >&2
  exit 1
fi

echo "源：$SRC"
echo "目标：$DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r "$SRC/." "$DEST/"

echo "已同步："
find "$DEST" -type f | sort

VERIFY="$REPO_ROOT/dsh/tools/verify_preset.mjs"
if command -v node >/dev/null 2>&1 && [[ -f "$VERIFY" ]]; then
  echo "运行旁路校验："
  node "$VERIFY" "$DEST/preset.yml" "$DEST/agent.cordis.yml"
else
  echo "提示：node 或 verify_preset.mjs 不可用，跳过旁路校验"
fi

echo "完成。重开 DSH 会话或 cordis_mount $DEST kanyu-gis 即可挂载 GIS 模式。"

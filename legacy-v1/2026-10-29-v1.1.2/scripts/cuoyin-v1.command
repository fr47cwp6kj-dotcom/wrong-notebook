#!/bin/zsh
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
APP_SCRIPT="$SCRIPT_DIR/../app/cuoyin_v1.py"

exec python3 "$APP_SCRIPT" "$@"

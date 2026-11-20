#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then source "$HOME/.nvm/nvm.sh"; fi
fi
node scripts/start-cuoyin.mjs
if [[ $? -ne 0 ]]; then
    read "?启动遇到问题，请保留窗口里的错误信息，按回车关闭。"
fi

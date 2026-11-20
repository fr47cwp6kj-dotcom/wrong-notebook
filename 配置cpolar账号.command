#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then source "$HOME/.nvm/nvm.sh"; fi
fi
print '请打开 cpolar 后台的“验证”页，复制自己的 Authtoken。'
print '粘贴时窗口不会显示内容，粘贴后按回车。'
IFS= read -r -s 'cuoyin_token?请粘贴令牌：'
print
printf '%s' "$cuoyin_token" | node scripts/cpolar-config.mjs --save-token
unset cuoyin_token
read '?按回车关闭。'

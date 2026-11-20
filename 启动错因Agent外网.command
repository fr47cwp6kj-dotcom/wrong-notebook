#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
    if [[ -s "$HOME/.nvm/nvm.sh" ]]; then source "$HOME/.nvm/nvm.sh"; fi
fi
if ! node scripts/cpolar-config.mjs; then
    read '?配置尚未完成，按回车关闭。'
    exit 1
fi
if [[ ! -x data/cpolar/cpolar ]]; then
    print '未找到 cpolar 客户端，请先完成安装。'
    read '?按回车关闭。'
    exit 1
fi
cuoyin_target=$(node scripts/cpolar-config.mjs --target) || exit 1
cuoyin_app=''
cuoyin_tunnel=''
cuoyin_awake=''
function stop_cuoyin() {
    trap - EXIT
    [[ -n "$cuoyin_tunnel" ]] && kill -TERM "$cuoyin_tunnel" 2>/dev/null
    [[ -n "$cuoyin_awake" ]] && kill -TERM "$cuoyin_awake" 2>/dev/null
    if [[ -n "$cuoyin_app" ]]; then
        kill -TERM "$cuoyin_app" 2>/dev/null
        wait "$cuoyin_app" 2>/dev/null
    fi
}
trap 'stop_cuoyin' EXIT
trap 'exit 0' INT TERM HUP
if [[ "$cuoyin_target" == '127.0.0.1:3334' ]]; then
    if curl --noproxy '*' --silent --max-time 1 --output /dev/null http://127.0.0.1:3334/; then
        print '3334 端口已有服务，请先关闭原来的正式版窗口，再用外网启动文件。'
        read '?按回车关闭。'
        exit 1
    fi
    node scripts/start-cuoyin-production.mjs &
    cuoyin_app=$!
    cuoyin_ready=0
    for cuoyin_attempt in {1..90}; do
        if ! kill -0 "$cuoyin_app" 2>/dev/null; then
            print '正式版启动失败，未开放外网。'
            read '?按回车关闭。'
            exit 1
        fi
        if curl --noproxy '*' --silent --fail --max-time 1 http://127.0.0.1:3334/api/cuoyin-status >/dev/null; then
            cuoyin_ready=1
            break
        fi
        sleep 1
    done
    if [[ "$cuoyin_ready" != 1 ]]; then
        print '正式版未按时启动，未开放外网。请先运行正式版检查。'
        read '?按回车关闭。'
        exit 1
    fi
else
    if ! curl --noproxy '*' --silent --fail --max-time 5 "http://$cuoyin_target/api/health" >/dev/null; then
        print '群晖错因 Agent 未响应，未开放外网。请检查 NAS 和局域网。'
        read '?按回车关闭。'
        exit 1
    fi
fi
data/cpolar/cpolar start -config="$PWD/data/cpolar/cpolar.yml" -log-level=INFO cuoyin &
cuoyin_tunnel=$!
caffeinate -i -w "$cuoyin_tunnel" &
cuoyin_awake=$!
print '正在连接固定网址。使用期间保留本窗口、保持联网；按 Ctrl+C 一起关闭。'
while kill -0 "$cuoyin_tunnel" 2>/dev/null && { [[ -z "$cuoyin_app" ]] || kill -0 "$cuoyin_app" 2>/dev/null; }; do
    sleep 2
done
stop_cuoyin
print '应用或穿透已停止，请检查上方提示。'
read '?按回车关闭。'

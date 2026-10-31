#!/bin/zsh

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=4173

page_is_running() {
  curl -fsS "http://127.0.0.1:${PORT}/" 2>/dev/null | grep -q "开始语音转文字"
}

if ! page_is_running; then
  while lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; do
    PORT=$((PORT + 1))
  done

  cd "$APP_DIR" || exit 1
  nohup python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/app-adhd-page.log 2>&1 &

  for _ in {1..20}; do
    page_is_running && break
    sleep 0.1
  done
fi

URL="http://127.0.0.1:${PORT}/?open=$(date +%s)"

if ! curl -fsS "http://127.0.0.1:4174/state" >/dev/null 2>&1; then
  open -gj "$APP_DIR/native/VoiceHelper.app"
  for _ in {1..30}; do
    curl -fsS "http://127.0.0.1:4174/state" >/dev/null 2>&1 && break
    sleep 0.1
  done
fi

if [[ -d "/Applications/Google Chrome.app" ]]; then
  open -a "Google Chrome" "$URL"
else
  open "$URL"
fi

#!/usr/bin/env bash
# Установка веб-версии «Английский в поездку» на VPS (Ubuntu 22.04/24.04).
#
# Запуск на сервере под root (у домена должны быть DNS-записи A/AAAA на сервер и CNAME www на сам домен):
#   curl -fsSL https://raw.githubusercontent.com/lenar95/English-for-turism/claude/relaxed-archimedes-kfq2pv/deploy/install.sh | bash -s -- engtrip.ru ваш@email
#
# Email нужен центрам сертификации: без него не работает запасной центр ZeroSSL,
# а Let's Encrypt может отказать, если на общий домен хостинга уже выпущено слишком много сертификатов.
#
# Что делает:
#   1. Ставит Caddy (веб-сервер с автоматическим HTTPS от Let's Encrypt) и git.
#   2. Скачивает готовую сборку сайта из ветки web-build репозитория.
#   3. Включает таймер, который раз в 2 минуты подтягивает свежую сборку.
#   4. Запускает сервис напоминаний (Node.js) — он получает запросы /api/* через Caddy.
# HTTPS обязателен: без него браузеры не дают доступ к микрофону.
set -euo pipefail

DOMAIN="${1:-${DOMAIN:-}}"
EMAIL="${2:-${EMAIL:-}}"
REPO="${REPO:-https://github.com/lenar95/English-for-turism.git}"
BRANCH="${BRANCH:-web-build}"
WEB_DIR=/var/www/english-for-tourism
DATA_DIR=/var/lib/english-for-tourism
PUSH_PORT=8787

if [[ $EUID -ne 0 ]]; then echo "Запустите под root (sudo)." >&2; exit 1; fi
if [[ -z "$DOMAIN" ]]; then echo "Укажите домен: bash install.sh example.com you@example.com" >&2; exit 1; fi
if [[ -z "$EMAIL" ]]; then echo "Предупреждение: email не указан, запасной центр сертификации ZeroSSL работать не будет." >&2; fi

echo "==> Устанавливаю пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q caddy git ca-certificates nodejs

echo "==> Скачиваю сборку сайта"
if [[ -d "$WEB_DIR/.git" ]]; then
  git -C "$WEB_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$WEB_DIR" reset --hard "origin/$BRANCH"
else
  rm -rf "$WEB_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$WEB_DIR"
fi

echo "==> Настраиваю автообновление"
cat > /usr/local/bin/english-for-tourism-update <<UPD
#!/usr/bin/env bash
set -e
cd "$WEB_DIR"
git fetch -q --depth 1 origin "$BRANCH"
if [[ "\$(git rev-parse HEAD)" != "\$(git rev-parse "origin/$BRANCH")" ]]; then
  before=\$(sha256sum .server/server.cjs 2>/dev/null || true)
  git reset -q --hard "origin/$BRANCH"
  git reflog expire --expire=now --all && git gc -q --prune=now
  echo "Сайт обновлён до \$(git rev-parse --short HEAD)"
  after=\$(sha256sum .server/server.cjs 2>/dev/null || true)
  if [[ "\$before" != "\$after" ]]; then
    systemctl restart english-for-tourism-push.service && echo "Сервис напоминаний перезапущен"
  fi
fi
UPD
chmod +x /usr/local/bin/english-for-tourism-update

cat > /etc/systemd/system/english-for-tourism-update.service <<UNIT
[Unit]
Description=Обновление сайта «Английский в поездку»
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/english-for-tourism-update
UNIT

cat > /etc/systemd/system/english-for-tourism-update.timer <<UNIT
[Unit]
Description=Проверять обновления сайта каждые 2 минуты

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now english-for-tourism-update.timer

echo "==> Настраиваю сервис напоминаний"
id -u eft-push >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin eft-push
mkdir -p "$DATA_DIR"
chown eft-push:eft-push "$DATA_DIR"
chmod 700 "$DATA_DIR"
cat > /etc/systemd/system/english-for-tourism-push.service <<UNIT
[Unit]
Description=Сервис напоминаний «Английский в поездку»
After=network-online.target
Wants=network-online.target

[Service]
User=eft-push
Environment=PORT=$PUSH_PORT
Environment=DATA_DIR=$DATA_DIR
Environment=VAPID_SUBJECT=https://$DOMAIN
ExecStart=/usr/bin/node $WEB_DIR/.server/server.cjs
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR
MemoryMax=200M

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
if [[ -f "$WEB_DIR/.server/server.cjs" ]]; then
  systemctl enable english-for-tourism-push.service
  systemctl restart english-for-tourism-push.service
else
  systemctl enable english-for-tourism-push.service
  echo "Сборка сервиса напоминаний ещё не опубликована — он запустится после следующего обновления."
fi

echo "==> Настраиваю Caddy для $DOMAIN"
GLOBAL=""
if [[ -n "$EMAIL" ]]; then GLOBAL=$'{\n\temail '"$EMAIL"$'\n}\n'; fi
cat > /etc/caddy/Caddyfile <<CADDY
$GLOBAL
$DOMAIN {
	root * $WEB_DIR
	encode zstd gzip

	@hidden path /.git /.git/* /.server /.server/*
	respond @hidden 404

	# Сервис напоминаний.
	reverse_proxy /api/* 127.0.0.1:$PUSH_PORT

	@html path / /index.html
	header @html Cache-Control "no-cache"
	header /assets/* Cache-Control "public, max-age=31536000, immutable"
	header /manifest.webmanifest Content-Type "application/manifest+json"
	header /sw.js Cache-Control "no-cache"
	header {
		Permissions-Policy "microphone=(self)"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
		Strict-Transport-Security "max-age=31536000"
	}

	file_server
}

# www.домен — на основной домен.
www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}

# Заход по IP перенаправляем на домен с HTTPS.
http:// {
	redir https://$DOMAIN{uri}
}
CADDY
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl enable caddy
systemctl reload caddy || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  echo "==> Открываю порты 80 и 443 в ufw"
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

echo
echo "Готово! Откройте https://$DOMAIN"
echo "Первый запуск может занять до минуты, пока выпускается сертификат."
echo "Логи веб-сервера: journalctl -u caddy -f"

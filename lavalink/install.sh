#!/usr/bin/env bash
# Serveur audio Lavalink perso pour le bot (Ubuntu, ex. VM gratuite Oracle Cloud « Always Free »).
# Usage sur le serveur : curl -fsSL https://raw.githubusercontent.com/zyko144/vercel-ia-/main/lavalink/install.sh | sudo bash
set -euo pipefail
DIR=/opt/lavalink
PORT=2333
mkdir -p "$DIR/plugins"
cd "$DIR"

# Docker
command -v docker >/dev/null || { apt-get update -q && apt-get install -yq docker.io; }
systemctl enable --now docker

# Mot de passe gardé entre deux installations
[ -f password ] || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 > password
PASS=$(cat password)

# Dernière version du plugin YouTube (YouTube change souvent : la version à jour évite les sons qui ne se lancent pas)
YT=$(curl -fsSL https://api.github.com/repos/lavalink-devs/youtube-source/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4)
[ -n "$YT" ] || { echo "Version du plugin YouTube introuvable"; exit 1; }

cat > application.yml <<EOF
server:
  port: $PORT
  address: 0.0.0.0
lavalink:
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:$YT"
      snapshot: false
  server:
    password: "$PASS"
    sources:
      youtube: false
      soundcloud: true
      bandcamp: true
      http: true
    bufferDurationMs: 400
    frameBufferDurationMs: 10000
    playerUpdateInterval: 2
    youtubePlaylistLoadLimit: 6
    trackStuckThresholdMs: 10000
    useSeekGhosting: true
plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients: ["MUSIC", "ANDROID_VR", "WEB", "WEBEMBEDDED", "TV"]
logging:
  level:
    root: INFO
    lavalink: INFO
EOF

docker rm -f lavalink >/dev/null 2>&1 || true
docker run -d --name lavalink --restart unless-stopped -p $PORT:$PORT \
  -e _JAVA_OPTIONS="-Xmx$(free -m | awk '/Mem/{print int($2/2)}')m" \
  -v "$DIR/application.yml:/opt/Lavalink/application.yml" -v "$DIR/plugins:/opt/Lavalink/plugins" \
  ghcr.io/lavalink-devs/lavalink:4

# Pare-feu Ubuntu d'Oracle (il bloque tout par défaut)
if command -v iptables >/dev/null && ! iptables -C INPUT -p tcp --dport $PORT -j ACCEPT 2>/dev/null; then
  iptables -I INPUT 1 -p tcp --dport $PORT -j ACCEPT
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi

IP=$(curl -fsS -4 https://ifconfig.me || hostname -I | cut -d' ' -f1)
echo "Démarrage (30 s)…"
for _ in $(seq 30); do curl -fsS -H "Authorization: $PASS" "http://127.0.0.1:$PORT/version" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS -H "Authorization: $PASS" "http://127.0.0.1:$PORT/version" && echo " ✓ Lavalink tourne (plugin YouTube $YT)" || echo "✗ Lavalink ne répond pas encore : docker logs lavalink"
echo
echo "À coller dans Render › Environment, variable LAVALINK_NODES :"
echo "[{\"name\":\"perso\",\"host\":\"$IP\",\"port\":$PORT,\"password\":\"$PASS\",\"secure\":false}]"

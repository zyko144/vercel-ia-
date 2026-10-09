#!/usr/bin/env bash
# Serveur audio Lavalink perso pour le bot (Ubuntu 22.04 / 24.04 : VPS Hetzner, OVH, Oracle…).
# Usage sur le serveur : curl -fsSL https://raw.githubusercontent.com/zyko144/vercel-ia-/main/lavalink/install.sh | sudo bash
# Si YouTube bloque le serveur (« requires login ») : relancer avec YT_OAUTH=1 (connexion à un compte Google jetable)
#   curl -fsSL https://raw.githubusercontent.com/zyko144/vercel-ia-/main/lavalink/install.sh | sudo YT_OAUTH=1 bash
set -euo pipefail
DIR=/opt/lavalink
PORT=2333
mkdir -p "$DIR/plugins"
cd "$DIR"

# Docker
command -v docker >/dev/null || { apt-get update -q && apt-get install -yq docker.io; }
systemctl enable --now docker

# Mot de passe (et jeton YouTube) gardés entre deux installations
[ -f password ] || tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32 > password
PASS=$(cat password)
[ "${YT_OAUTH:-0}" = 1 ] && touch oauth
TOKEN=$(cat youtube-token 2>/dev/null || true)

# Dernière version du plugin YouTube (YouTube change souvent : la version à jour évite les sons qui ne se lancent pas)
YT=$(curl -fsSL https://api.github.com/repos/lavalink-devs/youtube-source/releases/latest | grep -m1 '"tag_name"' | cut -d'"' -f4 || true)
[ -n "$YT" ] || { echo "Version du plugin YouTube introuvable"; exit 1; }

write_config() {
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
EOF
  if [ -f oauth ]; then
    printf '    oauth:\n      enabled: true\n' >> application.yml
    if [ -n "$TOKEN" ]; then printf '      refreshToken: "%s"\n' "$TOKEN" >> application.yml; fi
  fi
  printf 'logging:\n  level:\n    root: INFO\n    lavalink: INFO\n' >> application.yml
}

start() {
  docker rm -f lavalink >/dev/null 2>&1 || true
  docker run -d --name lavalink --restart unless-stopped -p $PORT:$PORT \
    -e _JAVA_OPTIONS="-Xmx$(free -m | awk '/Mem/{print int($2/2)}')m" \
    -v "$DIR/application.yml:/opt/Lavalink/application.yml" -v "$DIR/plugins:/opt/Lavalink/plugins" \
    ghcr.io/lavalink-devs/lavalink:4 >/dev/null
  echo "Démarrage du serveur audio (jusqu'à 2 min la 1re fois)…"
  for _ in $(seq 60); do curl -fsS -H "Authorization: $PASS" "http://127.0.0.1:$PORT/version" >/dev/null 2>&1 && return 0; sleep 2; done
  echo "✗ Lavalink ne démarre pas. Dernières lignes :"; docker logs --tail 30 lavalink; exit 1
}

echo "Téléchargement de Lavalink (1re fois : 1 à 2 min)…"
docker pull -q ghcr.io/lavalink-devs/lavalink:4 >/dev/null
write_config
start

# Connexion YouTube (YT_OAUTH=1) : code à entrer sur google.com/device avec un compte Google JETABLE, jeton gardé ensuite
if [ -f oauth ] && [ -z "$TOKEN" ]; then
  CODE=""
  for _ in $(seq 30); do CODE=$(docker logs lavalink 2>&1 | grep -oE '[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}' | tail -1 || true); [ -n "$CODE" ] && break; sleep 2; done
  if [ -n "$CODE" ]; then
    echo
    echo "👉 Va sur https://www.google.com/device avec un compte Google JETABLE (pas ton compte perso) et entre le code : $CODE"
    echo "   J'attends que ce soit fait (10 min max)…"
    for _ in $(seq 120); do TOKEN=$(docker logs lavalink 2>&1 | grep -oE '1//[0-9A-Za-z_-]{20,}' | tail -1 || true); [ -n "$TOKEN" ] && break; sleep 5; done
    if [ -n "$TOKEN" ]; then
      echo "$TOKEN" > youtube-token; chmod 600 youtube-token
      write_config; start
      echo "✓ YouTube connecté (jeton gardé pour les prochains redémarrages)"
    else
      echo "✗ Pas de connexion YouTube dans les 10 min : relance la même commande pour réessayer."
    fi
  else
    echo "✗ Code de connexion YouTube introuvable dans les logs : docker logs lavalink | grep -i oauth"
  fi
fi

# Pare-feu : port ouvert (Oracle bloque tout par défaut, ufw sur certains VPS)
if command -v iptables >/dev/null && ! iptables -C INPUT -p tcp --dport $PORT -j ACCEPT 2>/dev/null; then
  iptables -I INPUT 1 -p tcp --dport $PORT -j ACCEPT
  command -v netfilter-persistent >/dev/null && netfilter-persistent save || true
fi
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q "Status: active"; then ufw allow $PORT/tcp >/dev/null; fi

# Vérifications : YouTube et SoundCloud trouvent bien des sons
check() {
  local r; r=$(curl -fsS -G -H "Authorization: $PASS" "http://127.0.0.1:$PORT/v4/loadtracks" --data-urlencode "identifier=$2" 2>/dev/null || true)
  if echo "$r" | grep -q '"loadType":"search"'; then echo "✓ $1 répond"; else echo "✗ $1 ne répond pas ($(echo "$r" | head -c 160))"; fi
}
echo
check "YouTube Music" "ytmsearch:Daft Punk Get Lucky"
check "YouTube" "ytsearch:Daft Punk Get Lucky"
check "SoundCloud" "scsearch:Daft Punk Get Lucky"

IP=$(curl -fsS -4 https://ifconfig.me || hostname -I | cut -d' ' -f1)
echo
echo "✓ Lavalink tourne (plugin YouTube $YT), il redémarre tout seul avec le serveur."
echo "À coller dans Render › Environment, variable LAVALINK_NODES :"
echo "[{\"name\":\"perso\",\"host\":\"$IP\",\"port\":$PORT,\"password\":\"$PASS\",\"secure\":false}]"

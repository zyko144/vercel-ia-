# AI Vercel : bot Discord propulsé par Gemini

Assistant IA du serveur. Réponses claires et bien expliquées avec des liens utiles, lecture des images, PDF, fichiers et liens envoyés, aide en code, quiz, rappels, sondages et résumés de salon. En plus, il reste **24h/24 dans le vocal** `│・𝐃𝐢𝐜𝐭𝐚𝐭𝐮𝐫𝐞`.

- Il répond **uniquement dans le salon IA** (`1549523857252028538`), à chaque message, sauf ceux adressés à quelqu'un d'autre.
- **Réponses privées** : un message écrit dans le salon IA est déplacé dans le **fil privé** de la personne (seuls elle et les admins le voient). Toutes les commandes répondent en « visible seulement par toi », sauf `/sondage` et `/say`.
- **1 seul message par réponse** (jusqu'à ~6000 caractères), avec un bouton **📋 Copier le code** quand il y a du code.
- Quand il ne sait pas répondre (infos internes au serveur, décision humaine, bug…), il **ping le chef** (`1543726919168557087`), lui envoie un **MP avec le contexte** et dit au membre de contacter le chef directement.

---

## 1. Les clés

- **Gemini** : https://aistudio.google.com/apikey, puis **Create API key**.
- **Discord** : https://discord.com/developers/applications, puis ton app, **Bot**, **Reset Token**. Active **MESSAGE CONTENT INTENT**.

Lien d'invitation (remplace `TON_APP_ID`) :

```
https://discord.com/oauth2/authorize?client_id=TON_APP_ID&scope=bot+applications.commands&permissions=563224832494656
```

⚠️ **Ne mets jamais tes clés dans le repo.** Elles vont dans `.env` en local (ignoré par Git) et dans **Render > Environment** en ligne.

---

## 2. Offre gratuite Gemini

| Fonction | Gratuit ? | Réglage |
|---|---|---|
| Chat `gemini-3.8-flash` (+ secours `gemini-3.5-flash-lite`) | ✅ | par défaut |
| Lecture des liens envoyés | ✅ | par défaut |
| Recherche Google | ❌ bloquée (quota à 0) | `GEMINI_WEB_SEARCH=true` si facturation activée |
| Génération d'images (Nano Banana) | ❌ payant | `IMAGES_ENABLED=true` si facturation activée |

**Réflexion** (`GEMINI_THINKING_LEVEL`) : `medium` par défaut, soit environ 15 s par réponse. `/code`, `/quiz` et `/explique` en niveau expert passent automatiquement en `high`. Si le quota gratuit du modèle principal est dépassé, le bot bascule tout seul sur le modèle de secours.

---

## 3. Lancer en local

```bash
npm install
cp .env.example .env
npm start
```

⚠️ Coupe le bot local avant de lancer celui de Render, sinon il répondra 2 fois.

---

## 4. Déployer sur Render (24h/24)

1. Render → **New** → **Web Service** → repo `zyko144/vercel-ia-`
   - Build : `npm install` · Start : `npm start` · Plan : Free
2. **Environment** → ajoute `DISCORD_TOKEN` et `GEMINI_API_KEY`. Le reste (salons, vocal, chef, modèles) est déjà réglé par défaut dans `src/config.js`.
3. Deploy.

**Anti-veille** : Render gratuit endort le service après 15 min sans visite. Le bot se ping lui-même toutes les 10 min. Pour être sûr, crée un moniteur gratuit sur https://uptimerobot.com qui appelle `https://vercel-ia.onrender.com/health` toutes les 5 min.

---

## 5. Musique 🎶

- `/play` : nom du son (suggestions en tapant, les plus connus en premier, fautes de frappe acceptées) ou lien **Spotify, Apple Music, YouTube, SoundCloud, Deezer**.
- Panneau public « En cours de lecture » : pochette, titre cliquable vers le son, barre de progression, et boutons ⏮️ ⏸️ ⏭️ ⏹️ 🔀 🔉 🔊 🔁 🎧 8D 📜, menu des effets (8D, bass boost, nightcore, slowed + reverb, vaporwave, accéléré, karaoké, écho, tremolo, vibrato, surround), 🎤 paroles, ➕ ajouter, ❤️ favoris, ♾️ autoplay.
- `/playlist` : jouer un lien de playlist/album, **playlist générée par l'IA** selon une ambiance, et playlists perso (créer, ajouter, retirer, voir, lancer, supprimer).
- Le bot rejoint le vocal de la personne qui lance la musique, puis retourne dans son vocal habituel 3 min après la fin (ou tout de suite avec `/stop`). Il coupe tout seul si le vocal est vide depuis 2 min.
- Pour contrôler la musique, il faut être dans le même vocal que le bot (les admins et le chef peuvent toujours).

**Comment ça marche** : Spotify, Apple Music et Deezer ne donnent pas l'audio. Le bot lit les infos (titre, artiste, pochette), puis joue le son depuis YouTube Music. L'audio passe par [yt-dlp](https://github.com/yt-dlp/yt-dlp), téléchargé automatiquement au démarrage et mis à jour chaque jour, et par ffmpeg (effets). Les paroles viennent de lrclib.net.

**Playlists** : YouTube, Deezer, SoundCloud et Apple Music (albums) sont chargés en entier. Spotify ne donne que les 100 premiers titres d'une playlist sans compte développeur (limite de Spotify).

⚠️ **YouTube bloque les hébergeurs cloud** (message « YouTube bloque le serveur »). Le bot essaie déjà automatiquement d'autres modes de connexion YouTube, mais sur une IP de datacenter ça ne suffit pas toujours. Solutions, de la plus fiable à la moins fiable :
1. **Héberger le bot sur une connexion normale** (un PC allumé avec `pm2`) : YouTube marche sans rien faire.
2. **Proxy** : mets l'adresse d'un proxy HTTP dans `MUSIC_PROXY` (ex : `http://user:motdepasse@ip:port`). Les proxys « résidentiels » marchent, les proxys de datacenter rarement.
3. **Cookies YouTube** (marche un temps) : connecte un **compte Google secondaire** sur youtube.com, exporte `cookies.txt` avec l'extension « Get cookies.txt LOCALLY », encode-le en base64 (`base64 -w0 cookies.txt`) et colle le résultat dans `YTDLP_COOKIES`.

**Ce que coûte la musique en CPU** (mesuré) : trouver un son ≈ 1 s de CPU (donc ~10-15 s d'attente avec le 0,1 CPU de Render gratuit), jouer un son sans effet ≈ 0 (l'audio est recopié sans réencodage), avec effets ou volume modifié ≈ 1 % d'un processeur. Le son garde plusieurs minutes d'avance en mémoire et supporte jusqu'à 10 s de ralentissement sans couper.

---

## 6. Supabase (conseillé pour la musique)

Sur Render gratuit, le disque est effacé à chaque redémarrage : sans Supabase, **les playlists perso, les avertissements et les rappels sont perdus**. Tout le reste marche sans.

1. Crée un projet sur https://supabase.com.
2. **SQL Editor** : colle `supabase.sql`, puis **Run**.
3. **Project Settings → API** : copie l'URL et la clé **secret**.
4. Dans Render, ajoute `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`.

---

## Fonctionnalités

| Quoi | Comment |
|---|---|
| Discuter en privé (mémoire de la conv, lit images/PDF/fichiers/liens) | Écrire dans le salon IA → fil privé |
| Effacer sa conversation IA | `/clear` (sans nombre) |
| Question | `/ask` |
| Explication (ultra simple → expert) | `/explique` |
| Aide en code | `/code` |
| Correction orthographe | `/corriger` |
| Traduction | `/traduire` ou clic droit › Applications › *Traduire en français* |
| Expliquer un message | Clic droit › Applications › *Expliquer ce message* |
| Résumé du salon | `/resume-salon` |
| Quiz à boutons | `/quiz` |
| Rappel | `/rappel dans:2h message:...` |
| Sondage | `/sondage` |
| Contacter le chef | `/contacter-chef` |
| Effacer la mémoire | `/reset` |
| Images (si activées) | `/image`, `/modifier-image` |
| Stats / forcer le vocal (chef) | `/admin stats`, `/admin voc` |
| Modération | `/clear nombre`, `/kick`, `/ban`, `/unban`, `/mute`, `/unmute`, `/warn`, `/warns`, `/slowmode`, `/lock`, `/unlock`, `/role`, `/say` |
| Infos | `/userinfo`, `/serverinfo`, `/avatar`, `/ping` |
| Fun | `/pile-ou-face`, `/de`, `/choisir` |
| Musique | `/play`, `/playlist`, `/skip`, `/previous`, `/pause`, `/resume`, `/stop`, `/queue`, `/nowplaying`, `/volume`, `/loop`, `/shuffle`, `/seek`, `/remove`, `/move`, `/clearqueue`, `/filter`, `/autoplay`, `/lyrics`, `/join`, `/leave` |

Les commandes de modération, d'infos et de musique marchent dans tous les salons ; les commandes IA et fun seulement dans le salon IA.
⚠️ Pour que `/kick`, `/ban`, `/mute` et `/role` marchent, le **rôle du bot doit être au-dessus** des rôles des membres (Paramètres du serveur › Rôles › glisser « AI Vercel » vers le haut).

**Anti-abus** : 3 s entre deux messages, aucun @everyone possible, le chef ne peut être pingé qu'une fois toutes les 10 min par la même personne.

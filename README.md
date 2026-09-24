# AI Vercel : bot Discord propulsé par Gemini

Assistant IA du serveur. Réponses claires et bien expliquées avec des liens utiles, lecture des images, PDF, fichiers et liens envoyés, aide en code, quiz, rappels, sondages et résumés de salon. En plus, il reste **24h/24 dans le vocal** `│・𝐃𝐢𝐜𝐭𝐚𝐭𝐮𝐫𝐞`.

- Il marche dans **tous les salons** et tout le monde peut l'utiliser. Dans les **salons IA** (`1550195587922661607`, dans la catégorie VERCEL) il répond à chaque message ; ailleurs, il faut le mentionner.
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

**Réflexion** (`GEMINI_THINKING_LEVEL`) : `medium` par défaut, soit environ 15 s par réponse. `/code`, `/jeu-quiz` et `/explique` en niveau expert passent automatiquement en `high`. Si le quota gratuit du modèle principal est dépassé, le bot bascule tout seul sur le modèle de secours.

---

## 3. Lancer en local

```bash
npm install
cp .env.example .env
npm start
```

**Sur Windows**, sans taper de commande : double-clique sur **`demarrer.bat`**. La première fois, il installe
tout et ouvre le fichier `.env` à remplir (`DISCORD_TOKEN`, `GEMINI_API_KEY`) ; ensuite il lance le bot.
Il faut [Node.js](https://nodejs.org) (version LTS) et, pour récupérer le projet, [Git](https://git-scm.com) :

```bat
git clone -b claude/optimistic-edison-vv3m97 https://github.com/zyko144/vercel-ia- "C:\Users\noamb\Documents\AI vercel"
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
- `/playlist` : jouer un lien de playlist/album, **playlist générée par l'IA** selon une ambiance, et playlists perso.
- **Remplir une playlist vite fait** : `/playlist importer` (une playlist Spotify/YouTube/Apple/Deezer entière d'un coup), `/playlist ajouter-plusieurs` (une fenêtre s'ouvre : un son par ligne, jusqu'à 100), `/playlist ajouter-file` (toute la file d'attente), `/playlist creer` avec un lien, ou `/playlist ajouter` avec plusieurs sons séparés par `|`. Les sons introuvables sont listés dans la réponse.
- Le bot rejoint le vocal de la personne qui lance la musique, puis retourne dans son vocal habituel 3 min après la fin (ou tout de suite avec `/stop`). Il coupe tout seul si le vocal est vide depuis 2 min.
- Pour contrôler la musique, il faut être dans le même vocal que le bot (les admins et le chef peuvent toujours).
- **Paroles en direct** (`/lyrics` ou le bouton 🎤) : la ligne chantée est surlignée et suit la musique, comme sur Spotify. Le changement de ligne est calé sur l'horodatage exact de la parole, décalé de 0,9 s pour compenser le retard du son entendu (mise en mémoire tampon + lecteur Discord). Si c'est encore décalé, les boutons **⏪ Retarder / ⏩ Avancer** recalent par pas de 0,5 s, et le réglage est gardé pour les sons suivants (`LYRICS_OFFSET_MS` pour changer le réglage par défaut). Si le son n'a pas de paroles synchronisées, il affiche les paroles normales.
- **Barre de progression** : mise à jour toutes les 4 s (`MUSIC_PANEL_REFRESH_SECONDS`, 3 s minimum), plus une **minuterie de fin qui défile toute seule** chez chaque personne. Discord n'a pas de texte animé : chaque mouvement de la barre est une modification de message, et Discord limite ces modifications, donc un défilement seconde par seconde n'est pas possible.
- **Enchaînement fluide** : le son suivant est préparé pendant que le précédent joue, donc le passage est quasi instantané. (Un vrai fondu entre deux sons est impossible : Discord ne laisse qu'un seul flux audio à la fois.)
- **Le bot ne quitte plus le vocal** quand la musique démarre ou s'arrête : il garde sa place et se contente de changer de salon.
- Si un son ne peut pas être joué, le chef reçoit un **MP avec le détail** et un **ping** dans le salon (1 ping max toutes les 10 min).
- **`/jeu-blindtest`** : le bot joue des extraits, tout le monde devine dans le salon (titre = 2 pts, artiste = 1 pt), classement à la fin. Thèmes libres (`rap fr`, `années 2000`…) ou `serveur` pour vos propres sons.
- **`/radio`** : enchaînement non-stop d'un style, en boucle.
- **`/karaoke`** : le son sans la voix + les paroles qui défilent.
- **`/topsons`** : les sons et artistes les plus écoutés du serveur (ou de quelqu'un), ce mois-ci ou depuis le début.
- **Salon jukebox** : dans les salons listés dans `JUKEBOX_CHANNEL_IDS`, écrire un nom de son l'ajoute direct à la file (✅ quand c'est ajouté).
- **Vote pour passer** : `/skip` ou le bouton ⏭️ demandent la moitié des personnes du vocal. Le chef, les admins et celui qui a demandé le son passent direct.
- **Reprise après redémarrage** : la file est sauvegardée, et le bot reprend là où il s'était arrêté si des gens sont encore dans le vocal (nécessite Supabase sur Render).

**Comment ça marche** : la musique passe par des **serveurs audio publics gratuits (Lavalink)**. Le bot leur dit quoi jouer, et c'est eux qui récupèrent le son et l'envoient dans le vocal Discord. Résultat : YouTube ne voit pas l'adresse IP de l'hébergeur (donc pas de blocage), et l'hébergeur n'utilise presque pas de processeur.

- Plusieurs serveurs sont configurés : si l'un tombe ou n'arrive pas à lire un son, le bot **bascule tout seul** sur le suivant.
- Si aucun serveur ne répond, il repasse sur le **lecteur local** (yt-dlp + ffmpeg), qui marche bien depuis une connexion normale mais se fait bloquer par YouTube depuis un hébergeur.
- `/admin musique` (chef) affiche l'état des serveurs audio, le moteur utilisé et les derniers problèmes.
- Pour changer de serveurs : variable `LAVALINK_NODES` (du JSON), listes à jour sur [lavalink-list](https://lavalink.darrennathanael.com/). `MUSIC_ENGINE` accepte `auto` (défaut), `lavalink` ou `local`.

⚠️ Ces serveurs sont tenus par des bénévoles : ils peuvent tomber ou ralentir. Leurs propriétaires voient aussi ce qui est joué.

**Playlists** : YouTube, Deezer, SoundCloud et les albums Apple Music sont chargés en entier. Spotify est limité à 100 titres par playlist (limite de Spotify, même via les serveurs audio).

**Si tu préfères tout faire tourner sans serveur externe** (`MUSIC_ENGINE=local`), YouTube bloque les hébergeurs cloud. Il faut alors une connexion normale (ton PC), un proxy résidentiel (`MUSIC_PROXY`) ou des cookies d'un compte Google secondaire (`YTDLP_COOKIES`).

**Ce que coûte la musique en CPU** : avec les serveurs audio, presque rien (tout le travail est fait chez eux), donc le 0,1 CPU de Render gratuit suffit. Avec le lecteur local : trouver un son ≈ 1 s de CPU (~10-15 s d'attente sur Render gratuit), jouer sans effet ≈ 0 (audio recopié sans réencodage), avec effets ≈ 1 % d'un processeur.

---

## 6. Supabase (conseillé pour la musique)

Sur Render gratuit, le disque est effacé à chaque redémarrage : sans Supabase, **les playlists perso, les avertissements et les rappels sont perdus**. Tout le reste marche sans.

1. Crée un projet sur https://supabase.com.
2. **SQL Editor** : colle `supabase.sql`, puis **Run**.
3. **Project Settings → API** : copie l'URL et la clé **secret**.
4. Dans Render, ajoute `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`.

---

## 7. Casinho : le bot du casino 🎰

Un **deuxième bot**, avec son propre token et son propre serveur, qui tourne dans le même
processus. Sans token il reste simplement éteint : le bot principal n'est pas affecté.

1. Developer Portal › l'application **Casinho** › Bot › *Reset Token*, puis copie.
2. Ajoute `TOKEN_CASINHO` dans `.env` en local, **et** dans Render › Environment.
   La casse du nom n’a pas d’importance : `TOKEN_CASINHO` ou `token_casinho`, les deux marchent.
   ⚠️ Ce token est réservé au casino : l’IA vocale ne le prendra jamais. Si elle n’a pas
   le sien (`VOICE_BOT_TOKEN`, ou un 2e token dans `DISCORD_TOKEN=token1;token2`), elle reste éteinte.
3. Invite-le avec les scopes `bot` + `applications.commands`.
4. Au démarrage, les commandes sont enregistrées sur le serveur `CASINHO_GUILD_ID`
   (immédiat) ; sinon en global (jusqu'à une heure d'attente).

Les jetons sont **fictifs** : ils ne s'achètent pas, ne se retirent pas et ne valent rien
en dehors du serveur. Chaque table affiche son **TRJ** — ce que le jeu rend en moyenne sur
100 jetons misés — calculé à partir du code, jamais écrit à la main.

**Une commande, un embed, et tout se joue dedans** : la mise se règle avec les boutons
(10 · 50 · 100 · 500 · 1000, ÷2, ×2, Tout), le pari avec le menu déroulant, puis **Jouer**.
Aucune option à retenir. À la fin d'une manche, **Rejouer** relance avec la même mise.
Chaque table affiche son animation (`assets/casinho/*.gif`, servies par le bot sur `/casino/`).

| Quoi | Commandes |
|---|---|
| Ouvrir le casino | `/casino` — le hall, avec le choix de la table |
| Banque | `/solde`, `/quotidien`, `/secours`, `/donner`, `/classement`, `/stats` |
| Blackjack (tirer, rester, doubler, séparer) | `/blackjack` |
| Table | `/roulette`, `/rougenoir` |
| Rapides | `/machine`, `/des`, `/pileouface` |
| Encaissement | `/mines`, `/crash`, `/plusoumoins` |
| Joueur contre joueur | `/duel` |
| Règles et probabilités | `/casino-aide`, `/casino-gains` |
| Gérer les jetons (chef) | `/casino-admin` |

Les animations sont fabriquées une fois pour toutes par `node tools/make-casino-gifs.mjs`
(roue européenne, rouleaux, dés, pièce, cartes, fusée, grille) et commitées : rien n'est
encodé pendant une partie, l'offre gratuite de Render n'y survivrait pas.

**Réglages** (tous facultatifs) : `CASINHO_GUILD_ID`, `CASINHO_SITE_URL`, `CASINHO_START`,
`CASINHO_DAILY`, `CASINHO_DAILY_STREAK`, `CASINHO_RESCUE`, `CASINHO_RESCUE_UNDER`,
`CASINHO_MAX_BET`, `CASINHO_ADMINS`, `CASINHO_STATUS`.

**Taux de redistribution** : blackjack ≈ 99,5 % · roulette 97,3 % · pile ou face et rouge/noir
97,5 % · dés 95,8 à 96,7 % · mines, crash et plus ou moins 97 % · machine à sous 95,6 % ·
`/duel` 100 % (aucun prélèvement, c'est du joueur contre joueur).

---

## 8. Le site vitrine 🌐

Une page pour présenter et vendre le bot, racontée comme un conte : `site/index.html`.
Le bot la sert lui-même à son adresse principale (`https://vercel-ia.onrender.com/`), avec ses
images (`site/cartes/`, `site/images/`). `/health` ne change pas.

- **L'histoire** : un prologue où la nuit tombe sur un village au fil du défilement (72 images
  rendues dans Blender), puis un chapitre par fonction : l'IA, la musique Spotify, le loup-garou,
  l'imposteur, le casino, la modération, les autres jeux, et l'épilogue avec les offres.
- **De vrais messages Discord** reconstitués (salle d'attente, carte en MP, nuit, vote, panneau
  musique, partage Spotify, signalement) qui apparaissent un par un pendant le défilement (GSAP ScrollTrigger).
- **Sons** fabriqués en direct (Web Audio, aucun fichier) : page qui tourne, hurlement, grillons,
  cloche du matin… Le visiteur les active avec le bouton **Son**.
- **Nom, prix, contact** : tout est dans le bloc `CONFIG`, en haut du script de la page
  (`name`, `orderUrl`, `discordHandle`, `plans`, `plansNote`). Les prix sont des exemples, mets les tiens.
- Sans les bibliothèques (CDN bloqué) ou avec « réduire les animations », la page reste entière et lisible.
- **Bio du bot** : au démarrage, le lien du site est ajouté dans la bio (« À propos de moi ») du bot
  et de Casinho. `SITE_URL` pour un autre lien, `SITE_IN_BIO=false` pour ne pas toucher à la bio.

**Refaire les images** :

```bash
pip install bpy                                  # Blender en module Python (Python 3.11)
python tools/blender/village.py --mode seq  --out rendus/seq
python tools/blender/village.py --mode loup --out rendus
python tools/blender/village.py --mode aube --out rendus
node tools/make-site-images.mjs rendus           # -> site/images/*.webp
node tools/make-jeux-gifs.mjs --site             # cartes de rôle -> site/cartes/*.webp
```

---

## 9. Le tableau de bord de l'IA 📊

Une page d'administration, servie par le bot sur **`/dashboard`** (ex : `https://vercel-ia.onrender.com/dashboard`).

**Se connecter** : dans Discord, tape **`/admin dashboard`**. Le bot te répond (visible seulement par toi)
avec un lien valable **une seule fois, pendant 10 minutes**. On peut aussi recevoir ce lien en MP depuis
la page de connexion. Accès : le chef, plus les comptes listés dans `DASHBOARD_ADMINS`.

| Section | Ce qu'on y fait |
|---|---|
| Vue d'ensemble | Ce qui demande ton attention, réponses et erreurs du jour, temps de réponse, activité sur 24 h, état des services |
| IA | Usages du jour, 14 derniers jours, dernières erreurs, **tester l'IA**, et les **réglages** (modèle, réflexion, recherche Google, images, anti-spam, consignes du serveur, statut du bot, **pause de l'IA**, pastille du bot, **personnes privées d'IA**) |
| Écrire | Poster un message, une **annonce avec carte** (titre, couleur, image, aperçu façon Discord) ou un **sondage** dans n'importe quel salon, en tant que le bot |
| Modération | Chercher un membre, le **rendre muet**, l'**expulser**, le **bannir** / débannir (le chef est protégé), **nettoyer** un salon |
| Conversations | Qui a une conversation en mémoire (jamais le contenu), effacer une conversation ou tout |
| Jeux en cours | Parties de loup-garou et d'imposteur, arrêter une partie bloquée |
| Musique | **Lancer un son** ou une playlist dans le vocal choisi, pause / passer / précédent / boucle / arrêter, **volume**, file d'attente (retirer, mélanger, vider), serveurs audio |
| Rappels | Rappels en attente, en créer pour toi ou un membre, en supprimer |
| Casino | Classement de Casinho, **donner / retirer des jetons**, remettre un compte à zéro |
| Journaux | La console du bot en direct, filtrable, clés et tokens masqués |
| Sécurité | Sessions ouvertes (les fermer), comptes autorisés, journal de toutes les actions |

**Sécurité** : pas de mot de passe (lien à usage unique, jeton jamais envoyé dans l'adresse), cookie de
session HttpOnly + SameSite strict (+ Secure en HTTPS), 2 h d'inactivité ou 12 h maximum, requêtes
vérifiées (en-tête dédié + origine), tentatives limitées, en-têtes stricts (CSP sans script extérieur,
pas d'iframe), secrets jamais affichés, chaque modification notée au journal. Les réglages sont gardés
dans le stockage du bot (Supabase conseillé, sinon ils sont perdus au redémarrage sur Render).

Tests : `npm run test:dashboard` attaque les protections et les actions (19 vérifications, sans toucher à tes données).

**Render + PC en même temps** : avec Supabase (`SUPABASE_SERVICE_KEY` rempli), une seule copie du bot
répond. Le PC passe devant (pratique pour tester), Render attend et reprend tout seul 1 minute après la
fermeture du PC. Sans Supabase, les deux copies répondent au même clic et l'une affiche
« Unknown interaction » : coupe Render avant de lancer `demarrer.bat`. (`npm run test:instance`)

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
| Quiz à boutons | `/jeu-quiz` |
| Rappel | `/rappel dans:2h message:...` |
| Sondage | `/sondage` |
| Contacter le chef | `/contacter-chef` |
| Effacer la mémoire | `/reset` |
| Images (si activées) | `/image`, `/modifier-image` |
| Stats / vocal / serveurs audio (chef) | `/admin stats`, `/admin voc`, `/admin musique` |
| Tableau de bord (chef) | `/admin dashboard` |
| Modération | `/clear nombre`, `/kick`, `/ban`, `/unban`, `/mute`, `/unmute`, `/warn`, `/warns`, `/slowmode`, `/lock`, `/unlock`, `/role`, `/say` |
| Infos | `/userinfo`, `/serverinfo`, `/avatar`, `/ping` |
| Jeux | `/jeu-blindtest`, `/jeu-films`, `/jeu-disney`, `/jeu-series`, `/jeu-animes`, `/jeu-jeuxvideo`, `/jeu-devine`, `/jeu-quiz`, `/jeu-pile-ou-face`, `/jeu-des` |
| Fun | `/choisir` |
| Paroles en direct (surlignées, comme Spotify) | `/lyrics` ou bouton 🎤 |
| Signaler un message au staff (analysé par IA) | Clic droit › Applications › *Signaler au staff* |
| Musique | `/play`, `/playlist`, `/skip`, `/previous`, `/pause`, `/resume`, `/stop`, `/queue`, `/nowplaying`, `/volume`, `/loop`, `/shuffle`, `/seek`, `/remove`, `/move`, `/clearqueue`, `/filter`, `/autoplay`, `/lyrics`, `/radio`, `/karaoke`, `/blindtest`, `/topsons`, `/join`, `/leave` |

Toutes les commandes marchent dans tous les salons (variable `ALLOWED_CHANNEL_IDS` pour restreindre).
⚠️ Pour que `/kick`, `/ban`, `/mute` et `/role` marchent, le **rôle du bot doit être au-dessus** des rôles des membres (Paramètres du serveur › Rôles › glisser « AI Vercel » vers le haut).

**Anti-abus** : 3 s entre deux messages, aucun @everyone possible, le chef ne peut être pingé qu'une fois toutes les 10 min par la même personne.

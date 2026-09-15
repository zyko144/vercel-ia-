# AI Vercel : bot Discord propulsé par Gemini

Assistant IA du serveur. Réponses claires et bien expliquées avec des liens utiles, lecture des images, PDF, fichiers et liens envoyés, aide en code, quiz, rappels, sondages et résumés de salon. En plus, il reste **24h/24 dans le vocal** `│・𝐃𝐢𝐜𝐭𝐚𝐭𝐮𝐫𝐞`.

- Il répond **uniquement dans le salon IA** (`1549523857252028538`), à chaque message, sauf ceux adressés à quelqu'un d'autre.
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

## 5. Supabase (optionnel)

Sur Render gratuit, le disque est effacé à chaque redémarrage : sans Supabase, les rappels en attente sont perdus. Tout le reste marche sans.

1. Crée un projet sur https://supabase.com.
2. **SQL Editor** : colle `supabase.sql`, puis **Run**.
3. **Project Settings → API** : copie l'URL et la clé **secret**.
4. Dans Render, ajoute `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`.

---

## Fonctionnalités

| Quoi | Comment |
|---|---|
| Discuter (mémoire de la conv, lit images/PDF/fichiers/liens) | Écrire dans le salon IA |
| Question | `/ask` |
| Explication (ultra simple → expert) | `/explique` |
| Aide en code | `/code` |
| Correction orthographe | `/corriger` |
| Traduction | `/traduire` ou clic droit › Applications › *Traduire en français* |
| Expliquer un message | Clic droit › Applications › *Expliquer ce message* |
| Résumé du salon | `/resume` |
| Quiz à boutons | `/quiz` |
| Rappel | `/rappel dans:2h message:...` |
| Sondage | `/sondage` |
| Contacter le chef | `/contacter-chef` |
| Effacer la mémoire | `/reset` |
| Images (si activées) | `/image`, `/modifier-image` |
| Stats / forcer le vocal (chef) | `/admin stats`, `/admin voc` |

**Anti-abus** : 3 s entre deux messages, aucun @everyone possible, le chef ne peut être pingé qu'une fois toutes les 10 min par la même personne.

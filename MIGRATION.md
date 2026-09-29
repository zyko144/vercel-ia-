# Changer d'hébergeur (nouveau compte Render ou autre)

Les données du bot (comptes du launcher, amis, messages, niveaux, casino…) sont dans **Supabase**, pas chez Render :
changer de compte Render ne perd rien, tant que le nouveau service utilise les mêmes `SUPABASE_URL` et `SUPABASE_SERVICE_KEY`.

## 1. Sauvegarder avant (sur ton PC, dans le dossier du projet)

```
npm run backup:setup
```

- Complète ton `.env` local et crée une `BACKUP_KEY` si besoin (note-la, elle ne réapparaît pas).
- Écrit `backups/sauvegarde-AAAA-MM-JJ.json` chiffré : garde-le hors du dépôt (clé USB, drive…).
- Restaurer plus tard : `node tools/backup.mjs --restore backups/sauvegarde-….json --oui`

## 2. Copier les secrets de l'ancien Render

Ancien Render › service **vercel-ia** › **Environment** : recopie chaque valeur dans un fichier `.env` sur ton PC
(jamais dans le dépôt). La liste complète des variables, avec leur rôle, est dans **`.env.example`**.
Les indispensables :

| Variable | Sert à |
| --- | --- |
| `DISCORD_TOKEN` | bot History |
| `CLIPS_BOT_TOKEN` | bot History Clips |
| `TOKEN_CASINHO` | bot du casino |
| `GEMINI_API_KEY` | l'IA |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | toutes les données |
| `BREVO_API_KEY`, `BREVO_FROM` | e-mails de vérification du launcher |
| `DISCORD_CLIENT_SECRET` | connexion Discord du tableau de bord |
| `GITHUB_TOKEN` | annonces des versions sans limite GitHub |
| `PAYPAL_EMAIL` | paiements automatiques |
| `BACKUP_KEY` | sauvegardes chiffrées |

## 3. Créer le service sur le nouveau compte

1. Nouveau compte Render › **New › Blueprint** › choisis le dépôt `zyko144/vercel-ia-` (il lit `render.yaml`).
2. Render demande les secrets de la liste : colle les valeurs de l'étape 2 (Environment › **Add from .env** marche aussi).
3. Si le nom **vercel-ia** est libre, garde-le : l'adresse reste `https://vercel-ia.onrender.com` et il n'y a **rien d'autre à faire**.
   (Supprime d'abord l'ancien service pour libérer le nom.)

## 4. Si l'adresse change (ex. `https://vercel-ia-xyz.onrender.com`)

Remplace l'ancienne adresse par la nouvelle à ces 4 endroits :

1. **`launcher-site/api.json`** : `{ "api": "https://NOUVELLE-ADRESSE" }`
   → History Launcher (0.47.3+) et History Clips (0.6.4+) la lisent au démarrage : pas besoin de nouvelle version.
2. **`vercel.json`** : chercher/remplacer `https://vercel-ia.onrender.com` par la nouvelle adresse
   (site vercelia.vercel.app, tableau de bord, paiements, arcade).
3. **GitHub › Settings › Secrets and variables › Actions › Variables** : ajouter `API_URL` = nouvelle adresse
   (annonce Discord des nouvelles versions du launcher).
4. **Portail Discord** (bot History › OAuth2 › Redirects) : ajouter `https://NOUVELLE-ADRESSE/app/callback`.

Le serveur trouve sa propre adresse tout seul sur Render (`RENDER_EXTERNAL_URL`) : liens de partage, images de profil
et tableau de bord suivent sans rien changer. Ailleurs que sur Render, mets `PUBLIC_URL=https://NOUVELLE-ADRESSE`.

## 5. Vérifier

- `https://NOUVELLE-ADRESSE/health` répond `ok`.
- Les bots History, History Clips et Casinho sont en ligne sur Discord.
- Dans le launcher : Paramètres › Compte se connecte, les amis apparaissent.
- Ensuite seulement, supprime l'ancien service Render (sinon les deux bots répondent en double).

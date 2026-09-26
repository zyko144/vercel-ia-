# Sécurité de History IA

Ce document décrit les attaques possibles (modèle de menaces), ce qui les bloque, et les procédures à suivre en cas d'incident.

## 1. Modèle de menaces

| Qui attaque | Ce qu'il vise | Par où | Protection |
|---|---|---|---|
| Membre malveillant d'un serveur | Sanctionner, spammer, faire dire n'importe quoi au bot | Commandes `/`, `!!`, boutons, IA | Permissions Discord vérifiées à chaque action sensible, anti-spam par personne, IA qui ne fait que *proposer* un bouton (la permission est revérifiée au clic), aucune mention `@everyone` possible |
| Admin piraté / bot malveillant ajouté | Détruire le serveur (nuke) | Suppressions en masse | Anti-nuke : rôles retirés + exclusion 24 h + alerte, bot destructeur expulsé |
| Visiteur du site | Voler une session, agir à la place d'un admin | Tableaux de bord `/app`, `/dashboard` | OAuth2 avec `state`, cookies `HttpOnly` + `Secure` + `SameSite`, en-tête maison + origine vérifiée sur chaque écriture (CSRF), CSP stricte (XSS), limites de tentatives |
| Robot / script | Saturer le serveur, faire exploser la facture d'IA | Toutes les routes HTTP, arcade, voix | 600 requêtes/min par adresse, limites par route et par joueur, délais max (slowloris), corps de requête plafonnés |
| Attaquant réseau | Lire l'intérieur du serveur (SSRF) | Liens de musique, images | URL vérifiées : http(s) seulement, ports 80/443, aucune adresse interne ou privée (DNS vérifié), redirections revérifiées, taille et type bornés |
| Fraudeur | Obtenir le premium sans payer | Faux paiement, rejeu, remboursement | Vérification PayPal côté serveur (IPN renvoyé à PayPal), bon destinataire, bon montant, en euros, `txn_id` unique (rejeu refusé), verrou contre les doubles traitements simultanés, offre retirée en cas de remboursement/litige |
| Copie du code | Revendre ou modifier le bot | Fichiers | Contrôle d'intégrité (manifeste SHA-256) avec alerte au chef |
| Fuite de secrets | Prendre le contrôle du bot | Logs, messages, dépôt | Aucun secret dans le code, `.env` ignoré par git, journaux masqués automatiquement, tokens collés dans Discord supprimés |

## 2. Ce qui est en place

- **Secrets** : uniquement dans les variables d'environnement (Render › Environment). `.env` n'est jamais commité (`.gitignore`). Aucun secret n'est écrit dans le code : `git grep` ne trouve ni token Discord, ni clé Google, ni clé Stripe/Supabase.
- **Journaux** : `src/utils/logbuffer.js` masque toutes les valeurs des variables sensibles, tout ce qui ressemble à un token, une clé d'API, un JWT, un `Bearer …` ou un `?key=…` dans une URL.
- **Erreurs** : jamais de pile d'appels ni de message interne renvoyé à un visiteur (« Erreur du serveur. »).
- **HTTP** : `X-Content-Type-Options`, `X-Frame-Options: DENY` (sauf arcade, ouverte dans Discord), `Content-Security-Policy` (`frame-ancestors`, `base-uri`, `object-src`, `form-action`), `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. Méthodes limitées à GET/HEAD/POST/OPTIONS. CORS : seulement les domaines du site (plus de `*`).
- **Adresse IP réelle** : seule la dernière adresse de `X-Forwarded-For`, ajoutée par l'hébergeur, compte. Le début de la liste, que n'importe qui peut écrire, est ignoré.
- **Entrées** : identifiants Discord validés (`^\d{15,21}$`), chemins de fichiers en liste blanche (pas de `../`), corps JSON plafonnés, textes tronqués, échappement HTML partout où un texte d'utilisateur est affiché.
- **Injection de commandes** : aucun shell. `spawn` avec des arguments séparés, et `--` avant la cible de yt-dlp : un texte comme `--exec …` ne peut pas devenir une option.
- **SQL / NoSQL** : pas de requêtes construites à la main. Supabase est interrogé par son API REST avec la clé encodée (`encodeURIComponent`), et la table a RLS activé sans règle publique.
- **Moindre privilège Discord** : le lien d'invitation ne demande plus « Administrateur » mais la liste exacte des permissions utiles (`2253846893423863`).
- **Sécurité par défaut / refus en cas d'erreur** : offre inconnue ou stockage illisible → offre gratuite. Pas de token → sessions de l'arcade impossibles à valider. Paiement non confirmé par PayPal → refusé.
- **Dépendances** : `npm audit` → 0 faille (`tar` forcé en 7.5.22 via `overrides`). Render installe avec `npm ci`, donc les versions exactes du `package-lock.json`.
- **Données minimales** : l'adresse e-mail du payeur n'est plus conservée.

## 3. Procédures

### Changer une clé compromise (rotation)
1. **Token Discord** : portail développeur › Bot › *Reset Token*, puis Render › Environment › `DISCORD_TOKEN`. Toutes les sessions (tableau de bord, arcade, clé d'admin, clé du direct) en dérivent : elles sont toutes invalidées d'un coup.
2. **Clé Gemini** : Google AI Studio › *API keys* › supprimer puis recréer, et mettre à jour `GEMINI_API_KEY`.
3. **Supabase** : *Project Settings › API keys* › régénérer la clé secrète, puis mettre à jour `SUPABASE_SERVICE_KEY`.
4. **Secret OAuth Discord** (`DISCORD_CLIENT_SECRET`) : portail › OAuth2 › *Reset Secret*.
5. Redéployer. Vérifier dans les journaux qu'aucune erreur d'authentification n'apparaît.

### Sauvegarde et restauration
- Supabase fait ses propres sauvegardes quotidiennes (offre payante : restauration à un instant précis).
- En plus : `npm run backup` écrit `backups/sauvegarde-AAAA-MM-JJ.json`, chiffré en AES-256-GCM si `BACKUP_KEY` est défini. À garder hors du dépôt.
- Restauration : `node tools/backup.mjs --restore backups/fichier.json --oui`.

### Base de données (accès minimal)
Le bot n'a besoin que de la table `bot_kv`. La clé `service_role` passe outre RLS : ne la mettre que dans Render, jamais côté navigateur. Pour aller plus loin, créer un rôle Postgres dédié qui n'a droit qu'à `select, insert, update` sur `public.bot_kv` et l'utiliser via une clé JWT signée pour ce rôle.

### Intégrité du code
`npm run integrity` fabrique `security/manifest.json` (à faire au moment d'une livraison). Avec `INTEGRITY_CHECK=1`, le bot compare ses fichiers au démarrage et envoie une alerte au chef si l'un d'eux a changé.

### Chiffrement
- En transit : HTTPS partout (Render et Vercel), HSTS activé, et toutes les API externes (Discord, Google, Supabase, PayPal) appelées en HTTPS.
- Au repos : Supabase chiffre le disque (AES-256). Les sauvegardes locales sont chiffrées avec `BACKUP_KEY`.

### Signaler une faille
Écrire en message privé au chef du bot. Ne pas publier la faille avant sa correction.

# Règles du projet (lues à chaque session)

## Économie de tokens
- Répondre en français, court : le résultat + 2-3 lignes max. Pas de récap, pas de liste d'options non demandée.
- Skill `ponytail` active : plus petite modif qui marche, réutiliser l'existant, pas d'abstraction inutile.
- Lire seulement la partie utile d'un fichier (grep / sed -n / offset), jamais un gros fichier en entier (`launcher/src/ui/app.js`, `style.css`).
- Grouper les commandes indépendantes dans un seul appel ; pas de relecture d'un fichier juste édité.
- Pas de sous-agent sauf demande. Captures Playwright seulement quand c'est visuel.
- Pas de question si une valeur par défaut raisonnable existe : agir, puis le dire en une ligne.

## Sécurité
- `.env` contient de vrais secrets : ne jamais le commiter, ne jamais recopier ses valeurs, ne jamais contourner la protection de push. Ne jamais demander de clés API.

## Livraison (à chaque lot)
1. `git fetch origin main && git checkout -B claude/optimistic-edison-vv3m97 origin/main`
2. Commit, `git push -q --force-with-lease -u origin claude/optimistic-edison-vv3m97`
3. PR vers `main` puis merge en squash.

## Launcher (`launcher/`)
- Chaque version : bump `launcher/package.json`, entrée en tête du `CHANGELOG` de `launcher/src/ui/app.js`, et `version: async () => 'X'` de la démo.
- Chaque version doit avoir une NOUVELLE image : au moins une nouveauté du CHANGELOG avec un 4e élément `['sélecteur', 'waitN']` qui ouvre l'écran concerné (test dans `tools/test-launcher-releases.mjs`).
- Tests : `cd launcher && npm test`.

## Site (`launcher-site/`)
- Jamais de nom de concurrent (Steam/Epic seulement comme plateformes compatibles).

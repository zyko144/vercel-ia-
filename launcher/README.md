# History Launcher

Toute la bibliothèque du PC dans une seule fenêtre : jeux Steam (tous les disques), Epic Games, Riot, Ubisoft, EA, Battle.net, GOG, et les applis (Spotify, Discord…).

## Lancer
Double-clique sur **`demarrer-launcher.bat`** (la première fois, il installe ce qu'il faut, environ 1 minute).

Ou dans un terminal ouvert dans ce dossier :
```
npm install
npm start
```

## Créer l'installeur Windows (.exe)
```
npm run dist
```
L'installeur est créé dans `dist\`. Une fois installée, l'appli s'ouvre au démarrage du PC (réglable en bas à gauche).

## Ce qu'elle fait (étape 1)
- **Trouve tout** : jeux Steam de toutes les bibliothèques, jeux Epic, jeux des autres launchers et programmes installés (sans les pilotes ni les composants système).
- **Trie** par temps de jeu, jeux récents, nom ou taille. Filtres : jeux, applis, favoris, masqués, source, installés ou non. Recherche avec `Ctrl+F`.
- **Temps de jeu** : celui de Steam, plus un suivi maison pour tous les jeux et toutes les applis (une vérification par minute).
- **Actions** : Jouer/Ouvrir (double-clic ou `Entrée`), Installer (Steam), Vérifier les fichiers (Steam, Epic), Dossier, Désinstaller (avec confirmation), Favori, Masquer.
- **Jeux Steam désinstallés** : ils restent visibles avec leur temps de jeu, et on peut les réinstaller.
- **Thème vivant** : la couleur suit l'élément sélectionné (bleu Steam, rouge Riot…). Spotify et Deezer passent en violet flou, avec des néons qui tournent autour de la fenêtre.
- Fermer la fenêtre la range dans la barre des tâches (le suivi continue). Pour quitter : clic droit sur l'icône, puis « Quitter ».

## Sécurité
Interface isolée (`contextIsolation`, `sandbox`, CSP stricte). L'interface ne peut demander qu'une action sur un élément déjà trouvé par le launcher, jamais lancer une commande de son choix. Seuls les liens `steam://`, `com.epicgames.launcher://` et les pages du magasin Steam sont ouverts. Une confirmation est demandée avant chaque désinstallation.

## Tests
```
npm test
```

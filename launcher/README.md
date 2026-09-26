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

## Étape 2 : images et fiches
- **Chaque carte a un fond et le vrai logo** :
  - jaquette officielle Steam ou Epic ;
  - sinon le logo du jeu sur son grand fond flou ;
  - sinon l'icône haute définition de l'appli (la même que dans Windows) sur un fond à ses couleurs.
- **Jeux des autres launchers** (Ubisoft, EA…) : trouvés sur le magasin Steam quand ils y sont, pour avoir leurs images officielles.
- **Fiche complète** au clic : description, genres, studio, date de sortie, note Metacritic, captures d'écran, et « aussi sur Epic » si le jeu est possédé deux fois (une seule carte).
- **Jeux Epic possédés non installés** (lus dans le catalogue du launcher Epic), avec un bouton Installer.
- **Réglages** (en bas à gauche) :
  - **clé d'API Steam** (gratuite) : tous tes jeux Steam, même jamais installés ;
  - **clé SteamGridDB** (gratuite) : jaquettes et logos pour 100 % des jeux et applis (Valorant, Minecraft, Spotify…).
  - Les deux clés sont chiffrées par Windows sur ce PC.

## Nouvelle interface
- **Accueil** :
  - grande bannière du dernier jeu lancé (image et logo officiels, Jouer + menu, temps de jeu, dernière session) ;
  - plateforme, statut, taille, succès Steam et captures ;
  - rangées « Jeux les plus joués », « Applications » et « Recommandés pour vous ».
- **Plateformes** à gauche : le vrai logo de chaque launcher installé (tiré de son programme dans Windows).
- **Assistant IA** à droite : « Lance GTA V », « Vérifie les fichiers de Valorant », « Trie mes jeux par taille », « Mets la musique en pause »… Il utilise Gemini, avec la clé du bot trouvée automatiquement dans le `.env` du dossier parent, ou celle des Paramètres.
- **Classement** (menu à gauche) : podium et classement de tes meilleurs jeux, depuis toujours, cette semaine ou ce mois.
- **Statistiques** (menu à gauche) : temps par semaine, mois ou année, réparti entre jeux, applications, musique et autres.
- L'assistant IA se replie avec le bouton ⟩ (le choix est gardé).
- **Lecteur** en bas : titre en cours sur Spotify ou Deezer, vraie pochette et durée (Deezer), barre de progression, précédent, lecture/pause et suivant, volume.

## Images : toujours les vraies
Dans cet ordre, sans jamais rien dessiner :
1. Steam : d'abord les images que Steam garde sur ton PC (`appcache\librarycache`, exactement celles de ta bibliothèque Steam), puis l'API officielle du magasin (les nouvelles adresses d'images de 2025) ;
2. catalogue Epic ;
3. magasin Steam pour les jeux des autres launchers ;
4. SteamGridDB (avec une clé) ;
5. **l'IA cherche sur internet** (une fois par mois et par jeu) et chaque réponse est vérifiée : un numéro Steam n'est gardé que si Steam confirme le jeu, une adresse que si c'est une vraie image en https.

Les applis gardent leur icône officielle, celle de Windows.

## Sans ouvrir Steam ni Epic
- **Jouer** : les jeux Steam se lancent avec `steam.exe -silent -applaunch`. Steam tourne en fond, sans fenêtre. Les jeux Epic passent par le lien silencieux d'Epic.
- **Désinstaller** : le launcher supprime lui-même le dossier du jeu et sa fiche d'installation (`appmanifest` pour Steam ; `.item` et `LauncherInstalled.dat` pour Epic), après confirmation, et seulement si le dossier est bien celui du jeu, dans une bibliothèque connue.
- **Vérifier** : le launcher lit la liste officielle des fichiers que Steam (`depotcache\*.manifest`) et Epic (`.egstore\*.manifest`) gardent sur le PC, puis contrôle chaque fichier : présent, bonne taille, bonne empreinte SHA-1. L'avancement s'affiche en direct (pourcentage, fichiers, Go, fichier en cours) et on peut annuler. En cas de problème, il affiche la liste des fichiers manquants ou abîmés, et « Réparer » ne re-télécharge qu'eux, en arrière-plan. Sans liste officielle (autres launchers), il contrôle la présence des fichiers et la taille totale.
- **Installer** et **réparer** passent forcément par les serveurs de Steam ou d'Epic (compte, licence, téléchargement) : ils sont lancés en arrière-plan.

## Temps de jeu par compte
- **Paramètres › Comptes de jeu** : choisis ton compte Steam (liste des comptes du PC) et ton compte Epic. Le temps affiché est celui de ce compte seulement. La case « Afficher le temps total de tous les comptes » additionne tous les comptes.
- Jeux Steam : c'est le temps officiel de Steam, jamais additionné au chronomètre du launcher (plus de temps compté deux fois).
- Autres jeux et applis : chronomètre du launcher, rangé par compte.
- **Classement** : depuis toujours, ou les 2 dernières semaines (chiffres officiels de Steam pour ses jeux).
- Les noms des jeux Steam désinstallés viennent de l'API officielle de Steam (plus de « Jeu Steam 1248130 »).

## Compte History
Page d'inscription et de connexion au premier lancement (« Continuer sans compte » possible). Les comptes sont gardés par le serveur du bot : mot de passe chiffré (scrypt), sessions de 90 jours, tentatives limitées.

## Assistant gratuit et « Hey History »
- La bulle en bas à droite comprend, sans IA payante : lance, ferme, installe, désinstalle, vérifie, dossier, favoris, masque, musique (pause, suivant, précédent), volume, tri, recherche, « ouvre le classement », « quel est mon jeu le plus joué ? », « combien d'heures sur… ». Les surnoms marchent aussi (gta, lol, rl, cs, rdr2…).
- Les autres questions vont à Gemini, avec la clé du bot.
- **« Hey History, lance Rocket League »** : coche « Écouter Hey History » dans la bulle. C'est la reconnaissance vocale de Windows (gratuite, sans internet, en français si Windows l'a installée), et la réponse est lue à voix haute.
- **Bouton micro** 🎙 : tu parles, Gemini transcrit.

## Sécurité
Interface isolée (`contextIsolation`, `sandbox`, CSP stricte). L'interface ne peut demander qu'une action sur un élément déjà trouvé par le launcher, jamais lancer une commande de son choix. Seuls les liens `steam://`, `com.epicgames.launcher://` et les pages du magasin Steam sont ouverts. Une confirmation est demandée avant chaque désinstallation.

## Tests
```
npm test
```

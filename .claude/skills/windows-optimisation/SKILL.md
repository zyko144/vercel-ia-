---
name: windows-optimisation
description: Règles pour toute fonction d'analyse, d'optimisation, de nettoyage, de réparation ou de mise à jour de Windows dans le launcher History (launcher/src/core/optimize.js, deepscan.js, winupdate.js, health.js, pcdiag.js). À utiliser avant d'ajouter ou de modifier un réglage Windows, un nettoyage, une analyse du PC ou un score de santé.
---

# Optimisation et analyse Windows (History Launcher)

## Principes non négociables
- **Mesures réelles uniquement.** Aucun chiffre inventé ni durée gonflée artificiellement : une analyse dure le temps qu'elle prend réellement (lecture de chaque fichier, empreintes SHA-256, antivirus). Les données de démo (`core/demo.js`) ne servent qu'aux captures (`LAUNCHER_DEMO=1`).
- **Un seul score de santé** : `unifiedHealth()` dans `core/health.js`, affiché à l'identique dans Mon PC et Optimisation. Ne jamais afficher un autre score « global » ailleurs ; les notes partielles (entretien, stockage…) sont nommées comme telles.
- **Rien sans accord.** Toute suppression passe par une confirmation. Fichiers personnels (installateurs, doublons, fichiers louches) → `shell.trashItem` (récupérables). Seuls les caches qui se recréent sont supprimés directement.
- **Doublons** : toujours garder au moins une copie ; un doublon n'existe que si l'empreinte SHA-256 du contenu entier est identique.

## Réglages Windows
- Chaque réglage a une valeur « optimisée » ET la valeur d'origine de Windows (`off`, `null` = supprimer la valeur) → réversible depuis l'interface.
- Réglages HKCU : `GAME_TWEAKS` (sans droits admin). Réglages HKLM / powercfg : `SYSTEM_TWEAKS` appliqués en un seul script administrateur **précédé d'un point de restauration** (`Checkpoint-Computer`).
- Scripts administrateur : construits uniquement à partir de nos tables (jamais de texte venant de l'interface), passés en `-EncodedCommand` via `Start-Process -Verb RunAs`. Les identifiants externes (mises à jour Windows) sont validés par regex (GUID) avant d'entrer dans un script.
- Réglages à éviter (inefficaces ou risqués) : désactiver Windows Defender, désactiver les mises à jour, supprimer des services système, `bcdedit` exotiques, « nettoyeurs de registre », désactivation de SysMain / Nagle présentée comme un gain garanti.
- Retirés en 0.20.1 (ont fait bugger FiveM / GTA V chez des joueurs) : HAGS forcée (`HwSchMode`), `NetworkThrottlingIndex` / `SystemResponsiveness` (MMCSS), applis en arrière-plan coupées (`GlobalUserDisabled`), `VisualFXSetting`. Ils restent dans les tables avec `retired` (pour les remettre), ne sont plus proposés, et « Remettre Windows comme avant » (`resetPlan`, photo `settingsOriginal`) les rend à Windows.
- Ne jamais vider les caches de shaders automatiquement (D3DSCache, NVIDIA/AMD DXCache…) : les jeux saccadent le temps de les recréer. Manuellement : décochés par défaut.
- Pendant une partie : aucune fenêtre par-dessus le jeu (cartes gardées pour la fin), pas de requête WMI de température, mesures espacées (`setQuiet`).
- Portables : ne pas proposer « Performances optimales » ni la désactivation de la veille prolongée sans le signaler.

## Outils Windows fiables (indépendants de la langue)
- Réparation : `Repair-WindowsImage -Online -ScanHealth|-RestoreHealth` (état `ImageHealthState`) puis `sfc /scannow`.
- Stockage : `Optimize-Volume` (TRIM des SSD, défragmentation des HDD).
- Mises à jour : COM `Microsoft.Update.Session` (recherche sans admin ; téléchargement/installation en admin, avancement écrit dans un fichier JSON lu toutes les secondes).
- Stabilité : `Get-WinEvent` (Kernel-Power 41, BugCheck 1001, WHEA-Logger, disk/Ntfs, nvlddmkm/amdkmdag, Application Error 1000).
- Antivirus fichier par fichier : `MpCmdRun.exe -Scan -ScanType 3 -File <chemin> -DisableRemediation` (code 2 = menace), signature via `Get-AuthenticodeSignature`.

## Tests
- Toute logique pure (classement des fichiers, doublons, score, scripts générés, analyse des réponses PowerShell) a un test dans `launcher/test/` (voir `test-pro.mjs`) qui tourne sur Linux.
- Vérifier l'interface avec `LAUNCHER_DEMO=1 LAUNCHER_DEMO_DIAG=test/fixtures/diag-demo.json` et `LAUNCHER_SHOT` sous Xvfb avant de publier.

# Sécurité

## Télécharger en toute sécurité
- Télécharge History Launcher et History Clips **uniquement** depuis les Releases de ce dépôt ou depuis le site officiel (zyko144.github.io/vercel-ia-).
- Chaque version publie un fichier `SHA256SUMS.txt`. Pour vérifier ton installateur sous Windows :
  `certutil -hashfile History-Clips-Setup.exe SHA256` puis compare avec la ligne du fichier.
- Les mises à jour automatiques vérifient l'empreinte (SHA-512) de chaque fichier avant de l'installer.

## Ce qui protège les applis
- Fenêtres en bac à sable, isolation du contexte, politique de contenu stricte, aucune navigation vers l'extérieur.
- Fusibles Electron : l'exe ne peut pas servir à lancer d'autres scripts, et l'appli refuse de démarrer si ses fichiers ont été modifiés.
- Jetons de compte chiffrés par Windows (DPAPI), jamais écrits en clair.
- Personne ne peut modifier ce dépôt sans être propriétaire ou invité : les forks et pull requests ne changent rien ici, et les versions ne sont publiées que depuis la branche principale.

## Signaler une faille
Ouvre un « Security advisory » privé (onglet Security › Report a vulnerability) plutôt qu'une issue publique.

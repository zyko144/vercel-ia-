# Amis et notifications

La page Amis regroupe recherche, filtres de présence, demandes, groupes et soirées.
Les conversations et le centre de notifications utilisent des dialogues natifs,
avec des zones de défilement indépendantes. Le centre conserve les 150 dernières
notifications sur ce PC, par compte, y compris lorsque les alertes sont masquées.

## Synchronisation

- Réception toutes les deux secondes après la réponse précédente, même fenêtre
  réduite ; une seule requête en cours, reprise progressive jusqu'à 30 s si panne.
- Curseur serveur pris avant lecture, chevauchement d'une seconde et dédoublonnage
  par identifiant. Les appels actifs sont renvoyés indépendamment du curseur.
- Messages, présence et signaux d'appel persistés avant succès HTTP. Les appels
  ne dépendent plus d'une Map propre au processus serveur.
- Sur Supabase, écriture conditionnelle sur `bot_kv.updated_at`, puis nouvelle
  lecture en cas de conflit. Aucun changement de schéma nécessaire. En stockage
  fichier, utiliser une seule instance serveur ; chaque machine a son disque.
- Le client conserve le texte en cas d'échec d'envoi. Les candidats ICE reçus
  avant la description distante attendent cette description.

Le serveur et le launcher doivent tous deux recevoir ces changements. Un push
de branche ne publie pas un nouvel installateur. L'audio utilise les serveurs STUN
existants : aucun relais TURN n'est déployé ici ; un réseau qui interdit les
connexions directes peut encore empêcher l'audio.

## Vérifications effectuées

- `node tools/test-launcher-social.mjs` (racine) : 12 scénarios API, deux comptes
  amis et un tiers, 12 messages concurrents, stockage immédiat, rechargement du
  module serveur, appel présent après avancement du curseur, droits des groupes.
- `node tools/test-social-storage.mjs` : Supabase simulé, conflit d'écriture entre
  instances, 20 écritures simultanées, panne de lecture, première création.
- `node test/test-social-inbox.mjs` (launcher) : dédoublonnage, reprise, isolation
  des comptes, notifications lues et bornes de conservation.
- Tests social Steam, friendsync, bridge et tools : passent.
- `npm test` : passe jusqu'au test préexistant `test-pro.mjs:45`
  (« dump et .bak ancien repérés »), qui échoue aussi avec le test d'origin/main
  et les mêmes modules de nettoyage inchangés sur ce PC Windows.
- Aperçu navigateur avec données fictives : recherche, création de groupe,
  filtres de notifications, tout marquer lu, envoi d'un message long, contrôles
  de débordement à 800 × 650 et inspection à 1280 × 720.

La réception API et les signaux sont testés localement. Un appel audio entre deux
PC sur des réseaux distincts n'a pas été vérifié dans cette session.

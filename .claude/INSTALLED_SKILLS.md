# Skills installés pour NIGHTVAULT

Audit réalisé le 20/09/2026. Tous les dépôts ont été vérifiés via l'API GitHub (existence, licence),
téléchargés, puis **seuls les skills utiles au casino web ont été gardés** (33 skills hors sujet supprimés :
Godot, arcade rétro, crisp-game-lib, méta-skills d'agent).

Emplacement : `.claude/skills/` (43 dossiers = 32 externes + 11 maison).

## Installés depuis des dépôts externes (licence MIT uniquement)

| Dépôt | Licence | ★ | Skills gardés | Utilité NIGHTVAULT |
|---|---|---|---|---|
| majidmanzarpour/threejs-game-skills | MIT | 2 101 | `three-threejs-aaa-graphics-builder`, `three-threejs-game-director`, `three-threejs-game-ui-designer`, `three-threejs-gameplay-systems`, `three-threejs-audio-generator`, `three-threejs-debug-profiler`, `three-threejs-qa-release`, `three-threejs-3d-generator`, `three-threejs-image-generator` | Rendu premium, game feel, audio de jeu, profilage 60 fps |
| richhemsley3/claude-design-skills | MIT | 0 | `design-page-designer`, `design-component-builder`, `design-design-critique`, `design-design-reviewer`, `design-product-designer`, `design-accessibility-auditor`, `design-ux-heuristics`, `design-qa-specialist`, `design-content-copy-designer` | Design d'écrans, critique anti-générique, accessibilité |
| abagames/agentic-gamedev-skills | MIT | 17 | `gamedev-maximizing-game-feel`, `gamedev-directing-game-visuals`, `gamedev-evaluating-gameplay-balance`, `gamedev-implementing-gameplay-invariants`, `gamedev-designing-mini-games`, `gamedev-stress-testing-game-concepts`, `gamedev-smoke-testing-web-games`, `gamedev-probing-web-game-mechanics`, `gamedev-localizing-game-state-divergence`, `gamedev-auditing-gameplay-implementation-coverage`, `gamedev-generating-semantic-game-mutants` | Sensation de jeu, équilibrage, QA de gameplay |
| designrique/ai-graphic-design-skill | MIT | 25 | `graphic-ai-graphic-design-skill` | Identité graphique, direction artistique |
| pranavred/claude-code-logodesign-skill | MIT | 0 | `logo-logo-design` | Logos SVG professionnels (pas d'icônes génériques) |
| dannyjpwilliams/ui-sound-design-skill | MIT | 37 | `sound-ui-sound-design` | Sound design d'interface (Web Audio) |

## Dépôts vérifiés mais NON installés (et pourquoi)

| Dépôt | Licence | Raison |
|---|---|---|
| anthropics/skills | (dépôt officiel) | Déjà disponible dans cette session (`anthropic-skills:*` : docx, pdf, pptx, xlsx, skill-creator…) |
| anthropics/claude-plugins-official | Apache-2.0 | Marketplace de plugins : l'installation passe par la commande interactive `/plugin`, indisponible dans cette session (application de bureau). À faire depuis un terminal `claude` si tu veux ces plugins. |
| davila7/claude-code-templates | MIT | Très gros dépôt de templates/CLI, redondant avec ce qui est déjà en place ici |
| pejmanjohn/slot-machine | MIT | Malgré son nom, ce n'est pas un skill de machine à sous mais un outil d'implémentations parallèles |
| fcsouza/agent-skills | GPL-3.0 | Licence copyleft : écartée pour ne pas contaminer le projet |
| dhernz/brand-identity | GPL-3.0 | Idem |
| lovelaced/web-av-skills | aucune licence | Sans licence = tous droits réservés, réutilisation non autorisée |

## Skills maison NIGHTVAULT (créés ici)

| Skill | Couvre les besoins listés |
|---|---|
| `nv-casino-architecture` | casino-architecture, casino-game-engine, admin-dashboard (structure) |
| `nv-casino-math` | casino-math, slot-mathematics, game-balancing, dice/wheel/limbo engines (formules) |
| `nv-casino-economy` | casino-economy, virtual-currency, economy-simulation, reward-system, progression-system, jackpot-system |
| `nv-slot-engine` | slot-engine, slot-animation, moteur générique + états ReelEngine |
| `nv-casino-audio` | casino-audio, sound-mixing, audio-licensing, sound design par jeu |
| `nv-brand-system` | brand-system, game-logo-design, game-thumbnail-design, ai-logo-generation (règles) |
| `nv-fairness-security` | fairness-system, anti-cheat, casino-security |
| `nv-casino-ui` | frontend-casino-ui, responsive-casino-ui, mobile-game-ui, motion-design |
| `nv-game-catalog` | casino-game-design + suivi des 50 jeux |
| `nv-ai-assets` | ai-asset-generation, asset-pipeline |
| `nv-qa-admin` | casino-qa, visual-regression, playwright-game-testing, analytics-system |

Les moteurs par jeu (mines, plinko, roulette, blackjack, crash, tower…) ne sont pas des skills séparés :
leurs règles et leurs maths vivent dans `nv-casino-math` + le code et la doc de chaque jeu
(`nightvault/src/lib/games/<id>/`), ce qui évite 50 fichiers de prompt qui répètent la même chose.

## Conflits et doublons

- Aucun conflit de nom (préfixes `three-`, `design-`, `gamedev-`, `graphic-`, `logo-`, `sound-`, `nv-`).
- Doublons supprimés : le dépôt abagames contenait 72 dossiers dont beaucoup en double entre catégories ; 11 ont été gardés.
- Skills d'agent génériques (dispatching, critiquing own response…) supprimés : redondants avec le fonctionnement natif de Claude Code.

## Ce qui nécessite ton autorisation

1. **Plugins officiels Anthropic** : `/plugin marketplace add anthropics/claude-plugins-official` puis `/plugin install …`
   → commande interactive, à lancer depuis un terminal `claude` (pas possible depuis l'app de bureau).
2. **Clé d'image IA** : la clé Gemini actuelle n'a pas accès aux modèles d'image (offre gratuite).
   Sans clé payante, les images IA ne peuvent pas être générées : le pipeline est prêt (`nv-ai-assets`) mais
   les visuels du site sont pour l'instant des SVG faits main + dégradés, pas des rendus IA.

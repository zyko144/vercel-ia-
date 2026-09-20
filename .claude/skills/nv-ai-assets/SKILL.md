---
name: nv-ai-assets
description: Pipeline d'assets IA NIGHTVAULT : prompts versionnés, génération hors-ligne, cache, repli. À utiliser pour toute image générée (fonds, illustrations, symboles).
---

# Assets IA NIGHTVAULT

## Règle
Le site **ne génère jamais une image pendant qu'un joueur attend**. Tout est pré-généré, optimisé (AVIF/WebP), versionné et référencé en base (`VisualAsset`).

## Pipeline
1. `src/ai/prompts/<slug>.prompt.ts` : prompt versionné + négatifs + ratio + usage
2. `npm run assets:generate -- --slug=<slug> --drafts=4` → 4 brouillons dans `generated/drafts/`
3. choix humain (ou critère documenté) → `assets:promote`
4. nettoyage, recadrage, export 1×/2×, AVIF + WebP, placeholder flou (LQIP 20 px)
5. entrée en base : slug, prompt, modèle, seed, licence, hash, date

## Fournisseurs (adaptateur)
`src/ai/provider.ts` expose `generateImage({prompt, size, n})` avec implémentations : Gemini Image, OpenAI Images, Stability, et `none` (par défaut).
Sans clé configurée, le pipeline utilise les **assets vectoriels faits main** et les placeholders : le site reste complet et beau.

## Prompts : squelette
> premium modern casino brand asset, [sujet], deep black and midnight blue, metallic gold accents, cinematic rim light, glossy surfaces, subtle bloom, centered composition, clean silhouette readable at small size, no text, no watermark, no existing brand, 4k

Négatifs : `text, letters, watermark, logo of a real company, cheap gradient, flat clipart, low detail, blurry, extra fingers`

## Ce que l'IA ne fait pas
Les **logos** ne sont pas générés en pixels : ils sont dessinés en SVG (voir nv-brand-system). L'IA sert aux fonds, illustrations, symboles de rouleaux et concept art.

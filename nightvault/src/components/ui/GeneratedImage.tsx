'use client';

import Image from 'next/image';
import manifest from '@/ai/manifest.json';

type Entry = { path: string; thumb: string; lqip: string; width: number; height: number };
const ASSETS = manifest as Record<string, Entry>;

export const hasAsset = (slug: string) => slug in ASSETS;
export const assetOf = (slug: string): Entry | null => ASSETS[slug] ?? null;

/**
 * Image générée par l'IA, servie depuis /public (jamais générée à la volée),
 * avec un placeholder flou intégré pour éviter tout saut de mise en page.
 */
export function GeneratedImage({
  slug,
  alt,
  className = '',
  small = false,
  priority = false,
  sizes,
}: {
  slug: string;
  alt: string;
  className?: string;
  small?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const asset = ASSETS[slug];
  if (!asset) return null;
  return (
    <Image
      src={small ? asset.thumb : asset.path}
      alt={alt}
      width={asset.width}
      height={asset.height}
      placeholder="blur"
      blurDataURL={asset.lqip}
      priority={priority}
      sizes={sizes}
      className={className}
    />
  );
}

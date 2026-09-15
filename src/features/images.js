import { AttachmentBuilder } from 'discord.js';
import { config } from '../config.js';
import { describeError, errorDetail, generateImage } from '../ai/gemini.js';
import { refundImageQuota, takeImageQuota } from './limits.js';
import { truncate } from '../utils/discord.js';

/**
 * Génère (ou modifie) une image et renvoie un message Discord prêt à envoyer.
 * @returns {Promise<{content: string, files?: AttachmentBuilder[]}>}
 */
const IMAGES_OFF_MESSAGE = "🎨 La génération d'images est pas encore activée : elle marche pas avec l'offre gratuite de Gemini. Le chef doit activer la facturation pour la débloquer.";

export async function createImageMessage({ user, prompt, images = [], aspectRatio, pro = false }) {
  if (!config.limits.imagesEnabled) return { content: IMAGES_OFF_MESSAGE };

  if (pro && config.limits.proImageOwnerOnly && user.id !== config.ownerId) {
    return { content: '🔒 Le mode **Pro** (Nano Banana Pro) est réservé au chef. Enlève l\'option `pro` et ça passe crème 😉' };
  }

  const quota = await takeImageQuota(user.id);
  if (!quota.ok) {
    return { content: `⏳ T'as utilisé tes **${quota.limit} images** du jour, reviens demain stp (ça coûte des sous au chef 😅)` };
  }

  try {
    const result = await generateImage({ prompt, images, aspectRatio, pro });
    if (!result.buffer) {
      await refundImageQuota(user.id);
      return {
        content: `😕 Gemini a pas voulu générer cette image${result.text ? ` : ${truncate(result.text, 500)}` : ' (contenu bloqué ou demande pas claire). Reformule stp.'}`,
      };
    }

    const ext = result.mimeType.includes('jpeg') ? 'jpg' : 'png';
    const left = quota.left === Infinity ? 'illimité (chef)' : `${quota.left}/${quota.limit} restantes aujourd'hui`;
    return {
      content: `🎨 ${images.length ? 'Image modifiée' : 'Image générée'} : *${truncate(prompt, 300)}*\n-# ${pro ? 'Nano Banana Pro' : 'Nano Banana 2'} · ${left}`,
      files: [new AttachmentBuilder(result.buffer, { name: `image-ia.${ext}` })],
    };
  } catch (err) {
    await refundImageQuota(user.id);
    console.error('[image]', err.body ? errorDetail(err) : err);
    // Quota à 0 = modèle d'image indisponible en offre gratuite
    if (err.status === 429 && /quota/i.test(err.body ?? '')) return { content: IMAGES_OFF_MESSAGE };
    return { content: `❌ ${describeError(err)}` };
  }
}

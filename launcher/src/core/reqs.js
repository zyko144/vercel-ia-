// « Mon PC peut-il faire tourner ce jeu ? » : lecture de la configuration demandée sur Steam (texte HTML de la
// fiche) et comparaison avec le PC mesuré (mémoire, place libre, mémoire vidéo). Processeur et carte graphique
// sont affichés côte à côte (leur comparaison exacte demande une base de performances : l'IA peut donner son avis).
const strip = (html) => String(html ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/[ \t]+/g, ' ').trim();

/** Extrait RAM, stockage, VRAM, processeur, carte graphique et système d'une configuration Steam. */
export function parseReq(html) {
  const t = strip(html);
  if (!t) return null;
  const line = (re) => t.split('\n').map((l) => l.trim()).find((l) => re.test(l))?.replace(re, '').replace(/^\s*:\s*/, '').trim() ?? null;
  const gb = (s) => { const m = String(s ?? '').match(/(\d+(?:[.,]\d+)?)\s*(GB|Go|MB|Mo)/i); return m ? Number(m[1].replace(',', '.')) / (/M/i.test(m[2]) ? 1024 : 1) : null; };
  const mem = line(/^(Memory|Mémoire)\s*:?/i);
  const sto = line(/^(Storage|Hard Drive|Espace disque|Stockage)\s*:?/i);
  const gpu = line(/^(Graphics|Video Card|Graphismes|Carte graphique)\s*:?/i);
  return {
    os: line(/^(OS|Système d’exploitation|Système d'exploitation)\s*\*?:?/i), cpu: line(/^(Processor|Processeur)\s*:?/i), gpu,
    ramGb: gb(mem), diskGb: gb(sto), vramGb: gb(String(gpu ?? '').match(/(\d+\s*(GB|Go)\s*(VRAM|of VRAM|de VRAM|vidéo))/i)?.[1]),
  };
}

/** Verdict pour un niveau (minimum ou recommandé) : ok / non / ? par critère mesurable. */
export function checkReq(req, pc) {
  if (!req) return null;
  const c = (have, need) => (need == null || have == null ? null : have >= need * 0.97);
  const checks = {
    ram: { need: req.ramGb, have: pc.ramGb, ok: c(pc.ramGb, req.ramGb) },
    disk: { need: req.diskGb, have: pc.freeGb, ok: c(pc.freeGb, req.diskGb) },
    vram: { need: req.vramGb, have: pc.vramGb, ok: c(pc.vramGb, req.vramGb) },
  };
  const known = Object.values(checks).filter((x) => x.ok != null);
  return { checks, pass: known.length ? known.every((x) => x.ok) : null, cpu: req.cpu, gpu: req.gpu, os: req.os };
}

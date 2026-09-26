// Lecteur du format texte de Valve (VDF / ACF) : "clé" "valeur" et "clé" { … }.
export function parseVdf(text) {
  const root = {};
  const stack = [root];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*/g;
  let pendingKey = null;
  for (const m of String(text).matchAll(re)) {
    if (m[0].startsWith('//')) continue;
    const top = stack.at(-1);
    if (m[2] === '{') {
      const obj = {};
      if (pendingKey !== null) top[pendingKey] = obj;
      stack.push(obj);
      pendingKey = null;
    } else if (m[2] === '}') {
      if (stack.length > 1) stack.pop();
      pendingKey = null;
    } else {
      const s = m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"');
      if (pendingKey === null) pendingKey = s;
      else { top[pendingKey] = s; pendingKey = null; }
    }
  }
  return root;
}

/** Accès insensible à la casse (Valve mélange « Software » et « software »). */
export function pick(obj, ...keys) {
  let cur = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    const found = Object.keys(cur).find((k) => k.toLowerCase() === String(key).toLowerCase());
    cur = found === undefined ? undefined : cur[found];
  }
  return cur;
}

// Alternativas más baratas de un producto: mismo tipo de producto (palabras del nombre en común),
// mismo rubro si lo tienen, tamaño parecido (±20-25%) y un precio menor. Se calcula al pedirlo.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const UNIDAD = {
  g: ['g', 1], gr: ['g', 1], grm: ['g', 1], grs: ['g', 1], kg: ['g', 1000], kgs: ['g', 1000], kilo: ['g', 1000], kilos: ['g', 1000],
  ml: ['ml', 1], cc: ['ml', 1], cm3: ['ml', 1], cmq: ['ml', 1],
  l: ['ml', 1000], lt: ['ml', 1000], lts: ['ml', 1000], litro: ['ml', 1000], litros: ['ml', 1000],
  u: ['un', 1], un: ['un', 1], uni: ['un', 1], unidad: ['un', 1], unidades: ['un', 1],
};
const RE_TAM = /(\d+(?:[.,]\d+)?)?\s*(kgs?|kilos?|grm|grs?|g|ml|cm3|cmq|cc|lts?|l|litros?|unidades?|uni|un|u)(?![a-z0-9])/g;

function leerTam(txt, exigirNumero) {
  let res = null;
  for (const m of norm(txt).matchAll(RE_TAM)) {
    if (exigirNumero && !m[1]) continue;
    const [dim, k] = UNIDAD[m[2]] || [];
    if (!dim) continue;
    res = { dim, valor: (m[1] ? parseFloat(m[1].replace(',', '.')) : 1) * k };
    if (!exigirNumero) break;
  }
  return res;
}
export const tamano = (p) => leerTam(p.u, false) || leerTam(p.n, true);

const SOBRAN = new Set(['con', 'sin', 'por', 'para', 'del', 'las', 'los', 'una', 'pack', 'pet', 'lata', 'caja', 'bot', 'botella', 'sachet', 'bolsa', 'doy', 'x', 'paq', 'sem']);
export function palabras(p) {
  const marca = new Set(norm(p.m).split(/[^a-z0-9ñ]+/).filter(Boolean));
  return norm(p.n).split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !/^\d/.test(w) && !SOBRAN.has(w) && !UNIDAD[w] && !marca.has(w));
}

export function alternativasMasBaratas(p, productos, menor, max = 5) {
  const base = menor(p);
  const mias = palabras(p);
  if (base == null || !mias.length) return [];
  const tam = tamano(p);
  const marca = norm(p.m);
  const piso = Math.min(2, mias.length);
  const out = [];
  for (const q of productos) {
    if (q.ean === p.ean) continue;
    if (p.c && q.c && p.c !== q.c) continue;
    const precio = menor(q);
    if (precio == null || precio >= base * 0.97) continue;
    if (tam) {
      const t = tamano(q);
      if (!t || t.dim !== tam.dim || t.valor < tam.valor * 0.8 || t.valor > tam.valor * 1.25) continue;
    }
    const suyas = new Set(palabras(q));
    let hit = 0;
    for (const w of mias) if (suyas.has(w)) hit++;
    if (!suyas.has(mias[0]) || hit < piso || hit / mias.length < 0.4) continue;
    out.push({ p: q, precio, ahorro: base - precio, pct: Math.round(((base - precio) / base) * 100), mismaMarca: !!marca && norm(q.m) === marca });
  }
  out.sort((a, b) => (b.mismaMarca - a.mismaMarca) || a.precio - b.precio);
  return out.slice(0, max);
}

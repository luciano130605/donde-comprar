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

const POR = { g: ['kg', 1000], ml: ['l', 1000], un: ['u', 1] };

// Devuelve { lista, parecidos }: lista con las alternativas más baratas y cuántos productos parecidos
// (aunque no sean más baratos) se encontraron, para poder decir "este ya es de los más baratos".
// Primero busca de tamaño muy parecido (compara el precio del envase); si no hay nada, amplía el tamaño
// y compara por kilo/litro/unidad.
export function alternativasMasBaratas(p, productos, menor, max = 5) {
  const base = menor(p);
  const mias = palabras(p);
  if (base == null || !mias.length) return { lista: [], parecidos: 0 };
  const tam = tamano(p);
  const marca = norm(p.m);
  const unit = tam ? base / tam.valor : null;
  const niveles = [
    { rango: [0.8, 1.25], ratio: 0.4, piso: Math.min(2, mias.length), porUnidad: false },
    { rango: [0.4, 2.5], ratio: 0.3, piso: 1, porUnidad: true },
  ];
  let parecidos = 0;
  for (const n of niveles) {
    if (n.porUnidad && !tam) break;
    const out = [];
    let vistos = 0;
    for (const q of productos) {
      if (q.ean === p.ean) continue;
      if (p.c && q.c && p.c !== q.c) continue;
      const precio = menor(q);
      if (precio == null) continue;
      const t = tam ? tamano(q) : null;
      if (tam && (!t || t.dim !== tam.dim || t.valor < tam.valor * n.rango[0] || t.valor > tam.valor * n.rango[1])) continue;
      const suyas = new Set(palabras(q));
      let hit = 0;
      for (const w of mias) if (suyas.has(w)) hit++;
      if (!suyas.has(mias[0]) || hit < n.piso || hit / mias.length < n.ratio) continue;
      vistos++;
      const unitQ = t ? precio / t.valor : null;
      const masBarato = n.porUnidad ? unitQ < unit * 0.97 : precio < base * 0.97;
      if (!masBarato) continue;
      const ref = n.porUnidad ? unit : base;
      const val = n.porUnidad ? unitQ : precio;
      const [uTxt, k] = POR[tam?.dim] || ['u', 1];
      out.push({
        p: q, precio, ahorro: base - precio, pct: Math.round(((ref - val) / ref) * 100),
        mismaMarca: !!marca && norm(q.m) === marca,
        porUnidad: n.porUnidad ? { precio: unitQ * k, unidad: uTxt } : null,
      });
    }
    parecidos = Math.max(parecidos, vistos);
    if (out.length) {
      out.sort((a, b) => (b.mismaMarca - a.mismaMarca) || b.pct - a.pct);
      return { lista: out.slice(0, max), parecidos };
    }
  }
  return { lista: [], parecidos };
}

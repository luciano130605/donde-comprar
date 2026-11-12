// Convierte lo que publican Coto y Día en reglas con el modelo de config/promos.json.
// Sin IA ni OCR: solo lee JSON y texto que las cadenas publican. Lo que no se puede leer queda en null y
// se lista en `aVerificar`. Todo lo generado lleva revisar:true y medioPago:null (el mapa a medios lo carga una persona).

export const COTO_URL = 'https://www.coto.com.ar/rest/model/atg/actors/cProfileActor/getPromocionesMulticanal';
export const DIA_URL = 'https://diaonline.supermercadosdia.com.ar/medios-de-pago-y-promociones';

// "20.000" -> 20000 ; "1.500,50" -> 1500.5
export const dinero = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));

function topeDe(texto) {
  const t = texto || '';
  if (/sin\s+tope/i.test(t)) return { tope: null, declarado: 'sin tope', ambiguo: false };
  const montos = [...t.matchAll(/tope[^.$]{0,60}\$\s?([\d.]+(?:,\d+)?)/gi)].map((m) => dinero(m[1]));
  const unicos = [...new Set(montos)];
  if (unicos.length === 1) return { tope: unicos[0], declarado: null, ambiguo: false };
  return { tope: null, declarado: null, ambiguo: unicos.length > 1 };
}
function periodoDe(texto) {
  const t = texto || '';
  if (/por\s+semana|semanal/i.test(t)) return 'semana';
  if (/por\s+mes|mensual/i.test(t)) return 'mes';
  if (/por\s+(transacci[oó]n|operaci[oó]n|compra)/i.test(t)) return 'transaccion';
  return null;
}
const aISO = (d, m, a) => `${a}-${m}-${d}`;
function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function reglaBase(extra) {
  return {
    medioPago: null, tipo: null, valor: null, tope: null, topePeriodo: null, minimo: null, dias: null, canal: null,
    acumulable: null, vigenteDesde: null, vigenteHasta: null, verificadaEl: null, revisar: true, ...extra,
  };
}

// ---------- Coto ----------
export function parseCoto(json) {
  const r = json && json.result;
  const reglas = [];
  let omitidas = 0;
  const grupos = [['online', (r && r.promocionesDigitales) || []], ['presencial', (r && r.promocionesSucursalesFisicas) || []]];
  for (const [canal, lista] of grupos) {
    for (const p of lista) {
      const m = /^(\d+(?:[.,]\d+)?)\s?%\s+DE\s+DESCUENTO/i.exec(p.textoDescuento || '');
      if (!m) { omitidas++; continue; } // cuotas sin interés u otros beneficios: no son descuentos
      const t = topeDe(p.observacion);
      const aVerificar = ['medioPago', 'minimo'];
      if (t.tope == null && !t.declarado) aVerificar.push('tope');
      const periodo = periodoDe(p.observacion);
      if (t.tope != null && !periodo) aVerificar.push('topePeriodo');
      if (p.vigenciaDesde == null && p.vigenciaHasta == null) aVerificar.push('vigencia');
      const dias = (p.dias || []).map((d) => d.id - 1).filter((d) => d >= 0 && d <= 6).sort();
      if (!dias.length) aVerificar.push('dias');
      reglas.push(reglaBase({
        id: `coto-${p.id}`,
        tienda: 'coto',
        tipo: 'porcentaje',
        valor: Number(m[1].replace(',', '.')),
        tope: t.tope,
        topePeriodo: t.tope != null ? periodo : null,
        dias: dias.length ? dias : null,
        canal,
        vigenteDesde: p.vigenciaDesde || null,
        vigenteHasta: p.vigenciaHasta || null,
        fuente: COTO_URL,
        medioTexto: p.descripcion || null,
        bancoId: p.banco ?? null,
        icono: p.icono || null,
        textoOriginal: { textoDescuento: p.textoDescuento, observacion: p.observacion || null, diasVigencia: p.diasVigencia || null },
        aVerificar,
        notas: t.ambiguo ? 'La observación menciona más de un tope: elegir el que corresponde.' : undefined,
      }));
    }
  }
  return { reglas, omitidas };
}

// ---------- Día ----------
const DIAS_EN = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

function buscarTarjetas(o, out = []) {
  if (o && typeof o === 'object') {
    if (!Array.isArray(o) && 'daysToShow' in o && ('terms' in o || 'associatedBanks' in o)) out.push(o);
    for (const k in o) buscarTarjetas(o[k], out);
  }
  return out;
}

export function parseDia(html) {
  const tarjetas = [];
  for (const m of html.matchAll(/<script[^>]*>(\{[^]*?)<\/script>/g)) {
    if (!m[1].includes('"daysToShow"')) continue;
    try { buscarTarjetas(JSON.parse(m[1]), tarjetas); } catch { /* bloque que no es JSON */ }
  }
  const vistos = new Set();
  const reglas = [];
  let omitidas = 0;
  for (const c of tarjetas) {
    if (c.active === false) { omitidas++; continue; }
    const titulo = c.__editorItemTitle || '';
    const terms = String(c.terms || '');
    const bancos = (c.associatedBanks || []).map((b) => b.__editorItemTitle).filter(Boolean);

    // Porcentaje: solo si el texto legal (o el título) menciona uno solo.
    const pctsLegal = [...new Set([...terms.matchAll(/(\d{1,2}(?:,\d+)?)\s?%/g)].map((x) => x[1]))];
    const pctsTitulo = [...new Set([...titulo.matchAll(/(\d{1,2}(?:,\d+)?)\s?%/g)].map((x) => x[1]))];
    const candidatos = pctsLegal.length ? pctsLegal : pctsTitulo;
    const valor = candidatos.length === 1 ? Number(candidatos[0].replace(',', '.')) : null;
    if (!candidatos.length && /cuotas sin inter|\bCSI\b/i.test(`${titulo} ${terms}`)) { omitidas++; continue; }

    const t = topeDe(terms);
    const periodo = periodoDe(terms);
    const vig = /VIGENCIA\s+DESDE\s+EL\s+(\d{2})\/(\d{2})\/(\d{4})\s+HASTA\s+EL\s+(\d{2})\/(\d{2})\/(\d{4})/i.exec(terms);
    const min = /M[IÍ]NIMO[^.$]{0,60}\$\s?([\d.]+(?:,\d+)?)/i.exec(terms);
    const dias = Object.entries(c.daysToShow || {}).filter(([k, v]) => k in DIAS_EN && v === true).map(([k]) => DIAS_EN[k]).sort();
    const on = c.availableOn || {};
    const canal = on.online && on.store ? 'ambos' : on.online ? 'online' : on.store ? 'presencial' : null;

    const aVerificar = ['medioPago'];
    if (valor == null) aVerificar.push('valor');
    if (valor == null) aVerificar.push('tipo');
    if (t.tope == null && !t.declarado) aVerificar.push('tope');
    if (t.tope != null && !periodo) aVerificar.push('topePeriodo');
    if (!min) aVerificar.push('minimo');
    if (!vig) aVerificar.push('vigencia');
    if (!dias.length) aVerificar.push('dias');
    if (!canal) aVerificar.push('canal');

    let id = `dia-${slug(bancos[0] || titulo) || 'promo'}-${hash(titulo + '|' + terms.slice(0, 400))}`;
    if (vistos.has(id)) continue; // la misma tarjeta repetida en el bloque
    vistos.add(id);

    reglas.push(reglaBase({
      id,
      tienda: 'dia',
      tipo: valor != null ? 'porcentaje' : null,
      valor,
      tope: t.tope,
      topePeriodo: t.tope != null ? periodo : null,
      minimo: min ? dinero(min[1]) : null,
      dias: dias.length ? dias : null,
      canal,
      vigenteDesde: vig ? aISO(vig[1], vig[2], vig[3]) : null,
      vigenteHasta: vig ? aISO(vig[4], vig[5], vig[6]) : null,
      fuente: DIA_URL,
      medioTexto: bancos.join(', ') || titulo || null,
      textoOriginal: { titulo, terms: terms.slice(0, 600) },
      aVerificar,
      notas: candidatos.length > 1 ? `El texto legal menciona varios porcentajes (${candidatos.join(', ')}%): elegir el que corresponde.` : undefined,
    }));
  }
  return { reglas, omitidas, tarjetasLeidas: tarjetas.length };
}

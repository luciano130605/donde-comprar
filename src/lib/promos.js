// Calculadora de promos de pago (banco, billetera, tarjeta). Funciones puras: sin red, sin fecha implícita.
// Cada regla sigue el modelo de config/promos.json (ver README).

export const DIAS_SIN_VERIFICAR = 30;
export const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const MS_DIA = 86400000;
const redondear = (n) => Math.round(n * 100) / 100;
const pesos = (n) => '$' + Math.round(n).toLocaleString('es-AR');

// Acepta Date o 'YYYY-MM-DD'. Devuelve { iso, dia (0=domingo..6) , ms }.
export function normalizarFecha(f) {
  if (typeof f === 'string') {
    const [a, m, d] = f.slice(0, 10).split('-').map(Number);
    const ms = Date.UTC(a, m - 1, d);
    return { iso: f.slice(0, 10), dia: new Date(ms).getUTCDay(), ms };
  }
  const a = f.getFullYear(), m = f.getMonth(), d = f.getDate();
  const ms = Date.UTC(a, m, d);
  return { iso: new Date(ms).toISOString().slice(0, 10), dia: f.getDay(), ms };
}

// Estado de una regla para mostrar etiquetas: vencida, aún no vigente, ejemplo, sin verificar o desactualizada.
export function estadoRegla(regla, hoy) {
  const h = normalizarFecha(hoy);
  const vencida = !!regla.vigenteHasta && h.iso > regla.vigenteHasta.slice(0, 10);
  const aunNoVigente = !!regla.vigenteDesde && h.iso < regla.vigenteDesde.slice(0, 10);
  const ejemplo = /ejemplo/i.test(regla.estado || '');
  const sinVerificar = !regla.verificadaEl;
  const diasDesdeVerificacion = regla.verificadaEl ? Math.floor((h.ms - normalizarFecha(regla.verificadaEl).ms) / MS_DIA) : null;
  const desactualizada = diasDesdeVerificacion != null && diasDesdeVerificacion > DIAS_SIN_VERIFICAR;
  return { vencida, aunNoVigente, ejemplo, sinVerificar, desactualizada, diasDesdeVerificacion };
}

function descuentoSobre(regla, base) {
  let d = regla.tipo === 'porcentaje' ? (base * regla.valor) / 100 : regla.valor;
  if (regla.tope != null) d = Math.min(d, regla.tope);
  return redondear(Math.max(0, Math.min(d, base)));
}

// Evalúa UNA regla. ctx: { total, dia (0-6), canal ('online'|'presencial'), hoy }
// Devuelve { aplica, ahorro, codigo, motivo, faltaParaMinimo }.
// Orden de chequeo: dejamos el mínimo para el final para que "te faltan $X" solo aparezca cuando todo lo demás coincide.
export function evaluarRegla(regla, ctx) {
  const no = (codigo, motivo, extra = {}) => ({ aplica: false, ahorro: 0, codigo, motivo, faltaParaMinimo: null, ...extra });
  const h = normalizarFecha(ctx.hoy);
  const e = estadoRegla(regla, ctx.hoy);

  if (e.vencida) return no('vencida', `la promo venció el ${regla.vigenteHasta.slice(0, 10)}`);
  if (e.aunNoVigente) return no('noVigente', `la promo empieza el ${regla.vigenteDesde.slice(0, 10)}`);
  if (Array.isArray(regla.dias) && regla.dias.length && !regla.dias.includes(ctx.dia ?? h.dia)) {
    return no('dia', `solo vale ${regla.dias.map((d) => NOMBRES_DIA[d]).join(', ')}`);
  }
  if (regla.canal && regla.canal !== 'ambos' && regla.canal !== ctx.canal) return no('canal', `solo vale en compras ${regla.canal === 'online' ? 'online' : 'presenciales'}`);
  if (regla.tipo !== 'porcentaje' && regla.tipo !== 'monto') return no('tipo', 'tipo de descuento sin definir');
  if (regla.valor == null || !(regla.valor > 0)) return no('valor', 'el valor del descuento está sin confirmar');
  if (!(ctx.total > 0)) return no('vacio', 'el changuito no tiene productos con precio');
  if (regla.minimo != null && ctx.total < regla.minimo) {
    const falta = redondear(regla.minimo - ctx.total);
    return no('minimo', `sin promo: te faltan ${pesos(falta)} para llegar al mínimo`, { faltaParaMinimo: falta });
  }
  return { aplica: true, ahorro: descuentoSobre(regla, ctx.total), codigo: null, motivo: null, faltaParaMinimo: null };
}

const PRIORIDAD_MOTIVO = ['minimo', 'dia', 'canal', 'noVigente', 'vencida', 'tipo', 'valor', 'vacio'];

// Mejor promo de una tienda entre los medios de pago del usuario.
// - Elige la regla con mayor ahorro.
// - Las reglas con acumulable:true se pueden sumar entre sí (cada una sobre el saldo que queda);
//   se usa la suma solo si supera a la mejor regla individual. Las no acumulables nunca se suman.
// ctx: { total, dia, canal, hoy, medios: ['debito', ...] }
// Devuelve { total, ahorro, promoAplicada, motivoSiNoAplica, faltaParaMinimo, avisos }.
export function aplicarPromos(reglas, tienda, ctx) {
  const base = ctx.total;
  const sinPromo = (motivo, falta = null) => ({ total: base, ahorro: 0, promoAplicada: null, motivoSiNoAplica: motivo, faltaParaMinimo: falta, avisos: [] });
  const medios = ctx.medios || [];

  const delaTienda = reglas.filter((r) => r.tienda === tienda);
  if (!delaTienda.length) return sinPromo('no hay promos cargadas para esta tienda');
  const propias = delaTienda.filter((r) => medios.includes(r.medioPago));
  if (!propias.length) return sinPromo(medios.length ? 'sin promo para tus medios de pago' : 'elegí tus medios de pago para ver promos');

  const evaluadas = propias.map((regla) => ({ regla, ...evaluarRegla(regla, ctx) }));
  const aplicables = evaluadas.filter((x) => x.aplica);

  if (!aplicables.length) {
    const peor = [...evaluadas].sort((a, b) => PRIORIDAD_MOTIVO.indexOf(a.codigo) - PRIORIDAD_MOTIVO.indexOf(b.codigo))[0];
    return sinPromo(peor.motivo, peor.faltaParaMinimo);
  }

  const mejorUna = [...aplicables].sort((a, b) => b.ahorro - a.ahorro)[0];
  let elegidas = [mejorUna];
  let ahorro = mejorUna.ahorro;

  const acumulables = aplicables.filter((x) => x.regla.acumulable === true).sort((a, b) => b.ahorro - a.ahorro);
  if (acumulables.length > 1) {
    let saldo = base, suma = 0;
    for (const x of acumulables) {
      const d = descuentoSobre(x.regla, saldo);
      suma = redondear(suma + d);
      saldo = redondear(saldo - d);
    }
    if (suma > ahorro) { ahorro = suma; elegidas = acumulables; }
  }

  const avisos = [];
  for (const x of elegidas) {
    const e = estadoRegla(x.regla, ctx.hoy);
    if (e.ejemplo) avisos.push('ejemplo, verificar');
    else if (e.sinVerificar) avisos.push('sin verificar');
    else if (e.desactualizada) avisos.push(`sin verificar hace ${e.diasDesdeVerificacion} días`);
    if (x.regla.topePeriodo && x.regla.topePeriodo !== 'transaccion' && x.regla.tope != null) avisos.push(`el tope de ${pesos(x.regla.tope)} es por ${x.regla.topePeriodo}: se asume sin uso previo`);
  }

  return {
    total: redondear(base - ahorro),
    ahorro,
    promoAplicada: {
      id: elegidas.map((x) => x.regla.id).join('+'),
      ids: elegidas.map((x) => x.regla.id),
      medioPago: elegidas.map((x) => x.regla.medioPago).join('+'),
      tipo: elegidas[0].regla.tipo,
      valor: elegidas[0].regla.valor,
      ahorro,
    },
    motivoSiNoAplica: null,
    faltaParaMinimo: null,
    avisos: [...new Set(avisos)],
  };
}

// ---------- Modo "descuentos de hoy": sin elegir medio de pago ----------

// Reglas de una tienda que valen en ese día/canal/fecha, sin mirar el total del changuito.
// Se ignoran las que no tienen valor leído. Ordenadas de mayor a menor descuento.
export function disponiblesHoy(reglas, tienda, ctx) {
  return reglas
    .filter((r) => r.tienda === tienda && r.valor != null && evaluarRegla(r, { ...ctx, total: 1e12 }).aplica)
    .sort((a, b) => (b.tipo === 'porcentaje' ? b.valor : 0) - (a.tipo === 'porcentaje' ? a.valor : 0) || (a.minimo ?? 0) - (b.minimo ?? 0));
}

// Para un changuito concreto: el mayor descuento que se puede obtener hoy en esa tienda, con cualquier medio de pago.
// proxima = la promo que todavía no se alcanza por mínimo pero que, de alcanzarse, ahorraría más que la mejor actual.
// ctx: { total, dia, canal, hoy }
export function mejorDescuentoHoy(reglas, tienda, ctx) {
  const ev = reglas.filter((r) => r.tienda === tienda && r.valor != null).map((regla) => ({ regla, ...evaluarRegla(regla, ctx) }));
  const aplicables = ev.filter((x) => x.aplica).sort((a, b) => b.ahorro - a.ahorro);
  const mejor = aplicables[0] || null;
  const ahorro = mejor ? mejor.ahorro : 0;
  const proxima = ev
    .filter((x) => x.codigo === 'minimo' && descuentoSobre(x.regla, x.regla.minimo) > ahorro)
    .sort((a, b) => a.faltaParaMinimo - b.faltaParaMinimo)[0] || null;
  return { mejor, aplicables, proxima, ahorro, total: redondear(ctx.total - ahorro) };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarPromos, evaluarRegla, estadoRegla, normalizarFecha, disponiblesHoy, mejorDescuentoHoy } from '../src/lib/promos.js';

// 2026-11-11 es miércoles (3), 2026-11-12 jueves (4).
const MIE = '2026-11-11';
const JUE = '2026-11-12';

const base = {
  id: 'r', tienda: 'coto', medioPago: 'debito', tipo: 'porcentaje', valor: 30, tope: null, topePeriodo: null,
  minimo: null, dias: null, canal: 'ambos', acumulable: false, vigenteDesde: null, vigenteHasta: null,
  fuente: 'x', verificadaEl: '2026-11-01',
};
const regla = (o) => ({ ...base, ...o });
const ctx = (o) => ({ total: 10000, dia: 3, canal: 'online', hoy: MIE, medios: ['debito'], ...o });

test('normalizarFecha calcula el día de la semana', () => {
  assert.equal(normalizarFecha(MIE).dia, 3);
  assert.equal(normalizarFecha(JUE).dia, 4);
  assert.equal(normalizarFecha(new Date(2026, 10, 11)).dia, 3);
});

test('porcentaje sin tope: 30% de 10.000 = 3.000', () => {
  const r = aplicarPromos([regla({})], 'coto', ctx());
  assert.equal(r.ahorro, 3000);
  assert.equal(r.total, 7000);
  assert.equal(r.promoAplicada.id, 'r');
  assert.equal(r.motivoSiNoAplica, null);
});

test('tope menor que el descuento: se recorta al tope', () => {
  const r = aplicarPromos([regla({ tope: 1500, topePeriodo: 'transaccion' })], 'coto', ctx());
  assert.equal(r.ahorro, 1500);
  assert.equal(r.total, 8500);
  assert.deepEqual(r.avisos, []);
});

test('tope mayor que el descuento: no cambia nada', () => {
  assert.equal(aplicarPromos([regla({ tope: 20000 })], 'coto', ctx()).ahorro, 3000);
});

test('tope semanal o mensual avisa que se asume sin uso previo', () => {
  const r = aplicarPromos([regla({ tope: 1500, topePeriodo: 'semana' })], 'coto', ctx());
  assert.equal(r.ahorro, 1500);
  assert.ok(r.avisos.some((a) => /por semana/.test(a)));
});

test('tipo monto fijo, sin superar el total', () => {
  assert.equal(aplicarPromos([regla({ tipo: 'monto', valor: 2000 })], 'coto', ctx()).ahorro, 2000);
  assert.equal(aplicarPromos([regla({ tipo: 'monto', valor: 5000 })], 'coto', ctx({ total: 3000 })).ahorro, 3000);
});

test('mínimo: justo en el mínimo aplica', () => {
  const r = aplicarPromos([regla({ minimo: 10000 })], 'coto', ctx({ total: 10000 }));
  assert.equal(r.ahorro, 3000);
});

test('mínimo: un peso menos no aplica y dice cuánto falta', () => {
  const r = aplicarPromos([regla({ minimo: 10000 })], 'coto', ctx({ total: 9999 }));
  assert.equal(r.ahorro, 0);
  assert.equal(r.total, 9999);
  assert.equal(r.promoAplicada, null);
  assert.equal(r.faltaParaMinimo, 1);
  assert.match(r.motivoSiNoAplica, /te faltan \$1 para llegar al mínimo/);
});

test('regla vencida: no aplica (vigenteHasta inclusive)', () => {
  const ayer = regla({ vigenteHasta: '2026-11-10' });
  const r = aplicarPromos([ayer], 'coto', ctx());
  assert.equal(r.ahorro, 0);
  assert.match(r.motivoSiNoAplica, /venció el 2026-11-10/);
  // El último día todavía vale.
  assert.equal(aplicarPromos([regla({ vigenteHasta: MIE })], 'coto', ctx()).ahorro, 3000);
  assert.equal(estadoRegla(ayer, MIE).vencida, true);
});

test('regla que todavía no empezó: no aplica', () => {
  const r = aplicarPromos([regla({ vigenteDesde: '2026-11-12' })], 'coto', ctx());
  assert.equal(r.ahorro, 0);
  assert.match(r.motivoSiNoAplica, /empieza el 2026-11-12/);
});

test('día distinto: no aplica y dice qué día vale', () => {
  const r = aplicarPromos([regla({ dias: [3] })], 'coto', ctx({ dia: 4, hoy: JUE }));
  assert.equal(r.ahorro, 0);
  assert.match(r.motivoSiNoAplica, /solo vale miércoles/);
  assert.equal(aplicarPromos([regla({ dias: [3] })], 'coto', ctx()).ahorro, 3000);
});

test('canal: online vs presencial', () => {
  const soloPresencial = regla({ canal: 'presencial' });
  assert.equal(aplicarPromos([soloPresencial], 'coto', ctx({ canal: 'online' })).ahorro, 0);
  assert.equal(aplicarPromos([soloPresencial], 'coto', ctx({ canal: 'presencial' })).ahorro, 3000);
  assert.equal(aplicarPromos([regla({ canal: 'ambos' })], 'coto', ctx({ canal: 'online' })).ahorro, 3000);
});

test('valor sin confirmar (null) no aplica', () => {
  const r = aplicarPromos([regla({ valor: null })], 'coto', ctx());
  assert.equal(r.ahorro, 0);
  assert.match(r.motivoSiNoAplica, /sin confirmar/);
});

test('solo considera los medios de pago del usuario y la tienda', () => {
  const r1 = aplicarPromos([regla({})], 'coto', ctx({ medios: ['mercadopago'] }));
  assert.equal(r1.ahorro, 0);
  assert.match(r1.motivoSiNoAplica, /tus medios de pago/);
  const r2 = aplicarPromos([regla({})], 'coto', ctx({ medios: [] }));
  assert.match(r2.motivoSiNoAplica, /elegí tus medios/);
  const r3 = aplicarPromos([regla({})], 'jumbo', ctx());
  assert.match(r3.motivoSiNoAplica, /no hay promos cargadas/);
});

test('elige la mejor promo entre los medios; las no acumulables no se suman', () => {
  const a = regla({ id: 'a', medioPago: 'debito', valor: 10 });
  const b = regla({ id: 'b', medioPago: 'mercadopago', valor: 25 });
  const r = aplicarPromos([a, b], 'coto', ctx({ medios: ['debito', 'mercadopago'] }));
  assert.equal(r.promoAplicada.id, 'b');
  assert.equal(r.ahorro, 2500);
});

test('acumulables se suman sobre el saldo, solo si superan a la mejor individual', () => {
  const a = regla({ id: 'a', medioPago: 'debito', valor: 10, acumulable: true });
  const b = regla({ id: 'b', medioPago: 'mercadopago', valor: 20, acumulable: true });
  const r = aplicarPromos([a, b], 'coto', ctx({ medios: ['debito', 'mercadopago'] }));
  // 20% de 10.000 = 2.000; luego 10% de 8.000 = 800 → 2.800
  assert.equal(r.ahorro, 2800);
  assert.deepEqual(r.promoAplicada.ids, ['b', 'a']);
  // Si una de las dos no es acumulable no se combinan: gana la mejor.
  const c = { ...a, acumulable: false };
  assert.equal(aplicarPromos([c, b], 'coto', ctx({ medios: ['debito', 'mercadopago'] })).ahorro, 2000);
});

test('sin promo: informa primero lo que el usuario puede arreglar (mínimo antes que día)', () => {
  const porDia = regla({ id: 'd', dias: [1] });
  const porMinimo = regla({ id: 'm', medioPago: 'debito', minimo: 50000 });
  const r = aplicarPromos([porDia, porMinimo], 'coto', ctx());
  assert.match(r.motivoSiNoAplica, /te faltan/);
  assert.equal(r.faltaParaMinimo, 40000);
});

test('changuito vacío no aplica', () => {
  const r = aplicarPromos([regla({})], 'coto', ctx({ total: 0 }));
  assert.equal(r.ahorro, 0);
  assert.equal(evaluarRegla(regla({}), ctx({ total: 0 })).codigo, 'vacio');
});

test('estadoRegla: ejemplo, sin verificar y desactualizada (>30 días)', () => {
  assert.equal(estadoRegla(regla({ estado: 'ejemplo, verificar', verificadaEl: null }), MIE).ejemplo, true);
  assert.equal(estadoRegla(regla({ verificadaEl: null }), MIE).sinVerificar, true);
  assert.equal(estadoRegla(regla({ verificadaEl: '2026-10-12' }), MIE).diasDesdeVerificacion, 30);
  assert.equal(estadoRegla(regla({ verificadaEl: null }), MIE).diasDesdeVerificacion, null);
});

test('desactualizada: 31 días sí, 30 días no', () => {
  assert.equal(estadoRegla(regla({ verificadaEl: '2026-10-11' }), MIE).desactualizada, true);
  assert.equal(estadoRegla(regla({ verificadaEl: '2026-10-12' }), MIE).desactualizada, false);
});

test('avisos: una promo sin verificar lo informa', () => {
  const r = aplicarPromos([regla({ verificadaEl: null, estado: 'ejemplo, verificar' })], 'coto', ctx());
  assert.deepEqual(r.avisos, ['ejemplo, verificar']);
  const r2 = aplicarPromos([regla({ verificadaEl: '2026-09-01' })], 'coto', ctx());
  assert.ok(r2.avisos.some((a) => /sin verificar hace/.test(a)));
});

// ---- descuentos de hoy (sin elegir medio de pago) ----
const hoyCtx = (o) => ({ total: 10000, dia: 3, canal: 'online', hoy: MIE, ...o });

test('disponiblesHoy: filtra por día, canal y vigencia, ignora sin valor, ordena por descuento', () => {
  const rs = [
    regla({ id: 'a', valor: 10 }),
    regla({ id: 'b', valor: 30, dias: [3] }),
    regla({ id: 'c', valor: 50, dias: [1] }), // otro día
    regla({ id: 'd', valor: 40, canal: 'presencial' }), // otro canal
    regla({ id: 'e', valor: 60, vigenteHasta: '2026-11-01' }), // vencida
    regla({ id: 'f', valor: null }), // sin valor leído
    regla({ id: 'g', valor: 20, tienda: 'dia' }), // otra tienda
  ];
  assert.deepEqual(disponiblesHoy(rs, 'coto', hoyCtx()).map((r) => r.id), ['b', 'a']);
});

test('disponiblesHoy: un mínimo alto no la saca de la lista', () => {
  assert.deepEqual(disponiblesHoy([regla({ id: 'm', minimo: 999999 })], 'coto', hoyCtx()).map((r) => r.id), ['m']);
});

test('mejorDescuentoHoy: elige el mayor ahorro entre todas, sin medios de pago', () => {
  const rs = [regla({ id: 'a', valor: 10 }), regla({ id: 'b', valor: 25 }), regla({ id: 'c', valor: 40, tope: 1000 })];
  const r = mejorDescuentoHoy(rs, 'coto', hoyCtx());
  assert.equal(r.mejor.regla.id, 'b');
  assert.equal(r.ahorro, 2500);
  assert.equal(r.total, 7500);
});

test('mejorDescuentoHoy: sugiere la próxima por mínimo solo si ahorra más que la actual', () => {
  const rs = [regla({ id: 'a', valor: 10 }), regla({ id: 'b', valor: 30, minimo: 15000 }), regla({ id: 'c', valor: 5, minimo: 11000 })];
  const r = mejorDescuentoHoy(rs, 'coto', hoyCtx());
  assert.equal(r.mejor.regla.id, 'a');
  assert.equal(r.proxima.regla.id, 'b'); // c ahorra menos que a, no se sugiere
  assert.equal(r.proxima.faltaParaMinimo, 5000);
});

test('mejorDescuentoHoy: sin promos aplicables devuelve el total sin cambios', () => {
  const r = mejorDescuentoHoy([regla({ dias: [1] })], 'coto', hoyCtx());
  assert.equal(r.mejor, null);
  assert.equal(r.ahorro, 0);
  assert.equal(r.total, 10000);
});

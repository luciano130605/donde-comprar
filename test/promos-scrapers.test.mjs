import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCoto, parseDia, dinero } from '../scripts/promos-parsers.mjs';

const cotoPromo = (o) => ({
  id: '1', banco: 49, descripcion: 'En un pago con tarjetas de crédito Visa y Mastercard.', icono: 'logo.png',
  dias: [{ id: 5, descripcion: 'Jueves' }], diasVigencia: 'Jueves', textoDescuento: '30% DE DESCUENTO',
  observacion: 'Tope de Reintegro de $20.000 por transacción. Aplican exclusiones.', vigenciaDesde: null, vigenciaHasta: null, ...o,
});

test('dinero: formato argentino', () => {
  assert.equal(dinero('20.000'), 20000);
  assert.equal(dinero('1.500,50'), 1500.5);
});

test('Coto: lee % , tope, período, día (id 5 = jueves = 4) y canal', () => {
  const { reglas, omitidas } = parseCoto({ result: { promocionesDigitales: [cotoPromo({})], promocionesSucursalesFisicas: [] } });
  assert.equal(omitidas, 0);
  const r = reglas[0];
  assert.equal(r.id, 'coto-1');
  assert.equal(r.valor, 30);
  assert.equal(r.tope, 20000);
  assert.equal(r.topePeriodo, 'transaccion');
  assert.deepEqual(r.dias, [4]);
  assert.equal(r.canal, 'online');
  assert.equal(r.revisar, true);
  assert.equal(r.medioPago, null);
  assert.ok(r.aVerificar.includes('medioPago') && r.aVerificar.includes('minimo') && r.aVerificar.includes('vigencia'));
});

test('Coto: "sin tope" queda vacío sin marcarlo a verificar; cuotas sin interés se omiten', () => {
  const { reglas, omitidas } = parseCoto({ result: {
    promocionesDigitales: [cotoPromo({ id: '2', observacion: 'Sin tope de reintegro. Ver legales.' }), cotoPromo({ id: '3', textoDescuento: '6 CUOTAS SIN INTERÉS' })],
    promocionesSucursalesFisicas: [cotoPromo({ id: '4' })] } });
  assert.equal(omitidas, 1);
  assert.equal(reglas.length, 2);
  assert.equal(reglas[0].tope, null);
  assert.ok(!reglas[0].aVerificar.includes('tope'));
  assert.equal(reglas[1].canal, 'presencial');
});

test('Coto: observación con varios topes distintos no elige uno', () => {
  const { reglas } = parseCoto({ result: { promocionesDigitales: [cotoPromo({ observacion: 'Cartera general con tope de reintegro $ 15.000 por transacción, para Segmento Unico tope de reintegro $ 25.000 por transacción.' })] } });
  assert.equal(reglas[0].tope, null);
  assert.ok(reglas[0].aVerificar.includes('tope'));
  assert.match(reglas[0].notas, /más de un tope/);
});

test('Coto: respuesta vacía o con error no rompe', () => {
  assert.deepEqual(parseCoto({ codigoError: '2' }).reglas, []);
});

const diaHtml = (cards) => `<html><script>${JSON.stringify({ 'store.custom#medios': { cards } })}</script></html>`;
const tarjeta = (o) => ({
  displayData: { cardImage: 'x.jpg' }, active: true,
  daysToShow: { monday: true, tuesday: false, wednesday: false, thursday: false, friday: true, saturday: false, sunday: false, all: true },
  availableOn: { online: true, store: true, all: true },
  associatedBanks: [{ __editorItemTitle: 'Banco Columbia' }],
  terms: 'CARTERA DE CONSUMO. VIGENCIA DESDE EL 01/04/2026 HASTA EL 30/09/2026 AMBAS FECHAS INCLUSIVE. 20% DE AHORRO EN COMPRAS EN UN PAGO, TOPE DE REINTEGRO $10.000 POR SEMANA. MÍNIMO DE COMPRA $ 15.000.',
  __editorItemTitle: 'Columbia 20% de reintegro', ...o,
});

test('Día: lee % , tope, período, mínimo, vigencia, días y canal del texto legal y los flags', () => {
  const { reglas } = parseDia(diaHtml([tarjeta({})]));
  assert.equal(reglas.length, 1);
  const r = reglas[0];
  assert.equal(r.tienda, 'dia');
  assert.equal(r.valor, 20);
  assert.equal(r.tope, 10000);
  assert.equal(r.topePeriodo, 'semana');
  assert.equal(r.minimo, 15000);
  assert.equal(r.vigenteDesde, '2026-04-01');
  assert.equal(r.vigenteHasta, '2026-09-30');
  assert.deepEqual(r.dias, [1, 5]); // "all":true no se interpreta como todos los días
  assert.equal(r.canal, 'ambos');
  assert.equal(r.medioPago, null);
  assert.equal(r.revisar, true);
});

test('Día: sin porcentaje legible queda vacío y a verificar; con varios % no elige', () => {
  const sinPct = parseDia(diaHtml([tarjeta({ terms: 'CONSULTAR BASES Y CONDICIONES.', __editorItemTitle: 'Visa' })])).reglas[0];
  assert.equal(sinPct.valor, null);
  assert.equal(sinPct.tipo, null);
  assert.ok(sinPct.aVerificar.includes('valor'));
  const varios = parseDia(diaHtml([tarjeta({ terms: '10% EN LUNES Y 20% EN VIERNES.', __editorItemTitle: 'Visa' })])).reglas[0];
  assert.equal(varios.valor, null);
  assert.match(varios.notas, /varios porcentajes/);
});

test('Día: tarjetas inactivas y de cuotas sin interés se omiten; duplicadas se unifican', () => {
  const { reglas, omitidas } = parseDia(diaHtml([
    tarjeta({}), tarjeta({}),
    tarjeta({ active: false }),
    tarjeta({ terms: 'HASTA 3 CUOTAS SIN INTERÉS.', __editorItemTitle: '3CSI TC' }),
  ]));
  assert.equal(reglas.length, 1);
  assert.equal(omitidas, 2);
});

test('Día: HTML sin el bloque de datos no rompe', () => {
  assert.deepEqual(parseDia('<html><body>nada</body></html>').reglas, []);
});

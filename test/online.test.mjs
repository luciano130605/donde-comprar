import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVtex, parseCoto } from '../scripts/online-parsers.mjs';

test('VTEX: toma EAN, marca y Price del primer seller con stock', () => {
  const json = [
    { productName: 'Yerba Mate Suave 1 Kg Playadito', brand: 'PLAYADITO', items: [{ ean: '7793704000928', sellers: [{ commertialOffer: { Price: 5208, ListPrice: 430413, AvailableQuantity: 99999 } }] }] },
    { productName: 'Sin stock', brand: 'X', items: [{ ean: '7790000000001', sellers: [{ commertialOffer: { Price: 100, AvailableQuantity: 0 } }] }] },
    { productName: 'Sin EAN', brand: 'X', items: [{ ean: '', sellers: [{ commertialOffer: { Price: 100, AvailableQuantity: 5 } }] }] },
  ];
  assert.deepEqual(parseVtex(json), [{ ean: '7793704000928', n: 'Yerba Mate Suave 1 Kg Playadito', m: 'PLAYADITO', precio: 5208 }]);
  assert.deepEqual(parseVtex({ error: true }), []);
});

test('Coto: toma el grupo de registros más grande y lee los atributos', () => {
  const rec = (ean, precio, nombre) => ({ records: [{ attributes: { 'product.eanPrincipal': [ean], 'sku.activePrice': precio, 'product.displayName': nombre, 'product.brand': 'PLAYADITO' } }] });
  const json = { contents: [{ x: { records: [{ attributes: { otro: '1' } }] } }, { main: [{ records: [rec('7793704000881', '3969.000000', 'Yerba A'), rec('7793704000911', '2800.000000', 'Yerba B'), rec('', '10', 'sin ean')] }] }] };
  const r = parseCoto(json);
  assert.equal(r.length, 2);
  assert.deepEqual(r[0], { ean: '7793704000881', n: 'Yerba A', m: 'PLAYADITO', precio: 3969 });
});

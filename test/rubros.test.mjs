import test from 'node:test';
import assert from 'node:assert/strict';
import { rubroDe, rubroProducto, RUBROS } from '../scripts/rubros.mjs';

test('rubroDe: categorías típicas de las tiendas', () => {
  assert.equal(rubroDe('Almacén', 'Arroz'), 'Almacén');
  assert.equal(rubroDe('Bebidas', 'Cervezas'), 'Bebidas');
  assert.equal(rubroDe('Perfumería', 'Cuidado del Cabello'), 'Perfumería e higiene');
  assert.equal(rubroDe('Limpieza', 'Lavandinas'), 'Limpieza');
  assert.equal(rubroDe('Frescos', 'Carnes'), 'Carnes y pescados');
  assert.equal(rubroDe('Frescos', 'Lácteos'), 'Lácteos y frescos');
  assert.equal(rubroDe('Bebes Y Niños', 'Pañales'), 'Bebés y niños');
  assert.equal(rubroDe('Mascotas'), 'Mascotas');
  assert.equal(rubroDe('Congelados', 'Helados'), 'Congelados');
  assert.equal(rubroDe('Electro', 'Heladeras'), 'Hogar y electro');
});

test('rubroDe: "bebidas" no se confunde con "bebés"', () => {
  assert.equal(rubroDe('Bebidas', 'Gaseosas'), 'Bebidas');
});

test('rubroDe: sin información devuelve Otros', () => {
  assert.equal(rubroDe(''), 'Otros');
  assert.equal(rubroDe('Gift Cards'), 'Otros');
});

test('rubroProducto: sin categorías clasifica por el nombre', () => {
  assert.equal(rubroProducto([], 'Detergente Magistral 750 ml'), 'Limpieza');
  assert.equal(rubroProducto([], 'Manzana roja kg'), 'Frutas y verduras');
  assert.equal(rubroProducto([], 'Heladera Philco 300 L'), 'Hogar y electro');
  assert.equal(rubroProducto([], 'Producto raro sin pistas'), 'Otros');
});

test('rubroProducto: gana el rubro más votado entre tiendas; la categoría manda sobre el nombre', () => {
  assert.equal(rubroProducto(['Almacén > Dulces', 'Almacén > Chocolates', 'Lácteos'], 'Chocolate con leche'), 'Almacén');
  assert.equal(rubroProducto(['Lácteos > Leches', ''], 'Leche entera 1 L'), 'Lácteos y frescos');
});

test('rubroProducto: empate se resuelve por el orden de RUBROS', () => {
  assert.equal(rubroProducto(['Bebidas', 'Limpieza'], 'x'), RUBROS.indexOf('Bebidas') < RUBROS.indexOf('Limpieza') ? 'Bebidas' : 'Limpieza');
});

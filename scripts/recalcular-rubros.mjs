#!/usr/bin/env node
// Recalcula el rubro (c) de los productos de public/precios/*.json con las reglas actuales de scripts/rubros.mjs,
// sin volver a bajar ni procesar nada. Útil al ajustar las reglas.
//   node scripts/recalcular-rubros.mjs [archivo.json ...] [--resumen]
import fs from 'node:fs';
import { rubroProducto } from './rubros.mjs';

const args = process.argv.slice(2);
const archivos = args.filter((a) => !a.startsWith('--'));
const dir = new URL('../public/precios/', import.meta.url);
const lista = archivos.length ? archivos : fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => new URL(f, dir).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

for (const f of lista) {
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  // Los datos online ya traen categorías de cada tienda (votación); solo se tocan los de SEPA (sin categorías).
  if (d.fuente === 'online') { console.log(`${f}: datos online, se conservan los rubros por categoría`); continue; }
  const cuenta = {};
  for (const p of d.productos) { p.c = rubroProducto([], p.n); cuenta[p.c] = (cuenta[p.c] || 0) + 1; }
  fs.writeFileSync(f, JSON.stringify(d));
  const otros = cuenta.Otros || 0;
  console.log(`${f.split(/[\\/]/).pop()}: ${d.productos.length} productos, Otros ${otros} (${Math.round((otros / d.productos.length) * 100)}%)`);
  if (args.includes('--resumen')) console.log('  ', JSON.stringify(cuenta));
}

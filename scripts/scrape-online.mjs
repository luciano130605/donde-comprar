#!/usr/bin/env node
// Trae el CATÁLOGO COMPLETO de las tiendas online y arma public/precios/online.json y actualiza el índice de zonas.
//   node scripts/scrape-online.mjs [--solo jumbo,dia] [--min 2] [--out archivo.json] [--reanudar] [--forzar]
// VTEX: recorre el árbol de categorías y pagina cada categoría. Coto: pagina el listado completo.
// Sin IA ni servicios de terceros: son pedidos HTTP a las APIs públicas de cada sitio, con pausas entre pedidos.
import fs from 'node:fs';
import path from 'node:path';
import { parseVtex, parseCoto } from './online-parsers.mjs';
import { rubroProducto } from './rubros.mjs';
import { escribirIndice } from './indice-zonas.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const minTiendas = Number(opt('--min', 2));
const outFile = opt('--out', 'public/precios/online.json');
const forzar = args.includes('--forzar');
const reanudar = args.includes('--reanudar');
const solo = opt('--solo', '') ? opt('--solo', '').split(',') : null;
const MIN_PRODUCTOS = 200;
const PAUSA_MS = 250;
const POR_PAGINA = 50;
const TOPE_VTEX = 2500; // VTEX no deja paginar más allá de ~2500 resultados por consulta
const CACHE = '.cache';

const TIENDAS = [
  { id: 'coto', nombre: 'Coto', tipo: 'coto', base: 'https://www.coto.com.ar' },
  { id: 'dia', nombre: 'Día', tipo: 'vtex', base: 'https://diaonline.supermercadosdia.com.ar' },
  { id: 'jumbo', nombre: 'Jumbo', tipo: 'vtex', base: 'https://www.jumbo.com.ar' },
  { id: 'carrefour', nombre: 'Carrefour', tipo: 'vtex', base: 'https://www.carrefour.com.ar' },
  { id: 'disco', nombre: 'Disco', tipo: 'vtex', base: 'https://www.disco.com.ar' },
  { id: 'vea', nombre: 'Vea', tipo: 'vtex', base: 'https://www.vea.com.ar' },
  { id: 'changomas', nombre: 'Changomás', tipo: 'vtex', base: 'https://www.masonline.com.ar' },
  { id: 'cordiez', nombre: 'Cordiez', tipo: 'vtex', base: 'https://www.cordiez.com.ar' },
  { id: 'josimar', nombre: 'Josimar', tipo: 'vtex', base: 'https://www.josimar.com.ar' },
].filter((t) => !solo || solo.includes(t.id));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, intentos = 4) {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (comparador-super; uso personal)', accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      // VTEX responde 206 (contenido parcial) cuando la búsqueda es paginada: es normal.
      if (r.status === 200 || r.status === 206) return await r.json();
      if (r.status === 429 || r.status >= 500) { await dormir(2000 * i); continue; }
      throw new Error(`HTTP ${r.status}`);
    } catch (e) {
      if (i === intentos) throw e;
      await dormir(1200 * i);
    }
  }
}

// Hojas del árbol de categorías, con su ruta ("/1/12/34/") para filtrar con fq=C:<ruta> y los nombres de la cadena de categorías.
function hojas(nodos, ruta = '/', nombres = []) {
  const out = [];
  for (const n of nodos || []) {
    const r = `${ruta}${n.id}/`;
    const nom = [...nombres, n.name];
    if (n.children && n.children.length) out.push(...hojas(n.children, r, nom));
    else out.push({ ruta: r, cat: nom.slice(0, 3).join(' > ') });
  }
  return out;
}

async function recorrerVtex(t, alVer) {
  const arbol = await pedir(`${t.base}/api/catalog_system/pub/category/tree/5`);
  const rutas = hojas(arbol);
  if (!rutas.length) throw new Error('árbol de categorías vacío');
  let i = 0;
  for (const { ruta, cat } of rutas) {
    i++;
    for (let desde = 0; desde < TOPE_VTEX; desde += POR_PAGINA) {
      let pag;
      try {
        pag = await pedir(`${t.base}/api/catalog_system/pub/products/search?fq=C:${ruta}&_from=${desde}&_to=${desde + POR_PAGINA - 1}`);
      } catch (e) { t.fallas.push(`${ruta}@${desde}: ${e.message}`); break; }
      const items = parseVtex(pag);
      alVer(items, cat);
      if (!Array.isArray(pag) || pag.length < POR_PAGINA) break;
      await dormir(PAUSA_MS);
    }
    if (i % 20 === 0) console.log(`  ${t.nombre}: ${i}/${rutas.length} categorías, ${t.vistos} productos`);
    await dormir(PAUSA_MS);
  }
}

async function recorrerCoto(t, alVer) {
  for (let desde = 0; ; desde += 100) {
    let json;
    try {
      json = await pedir(`${t.base}/sitios/cdigi/browse?Ntt=&Nrpp=100&No=${desde}&format=json`);
    } catch (e) { t.fallas.push(`No=${desde}: ${e.message}`); if (t.fallas.length > 10) break; continue; }
    const items = parseCoto(json);
    const total = Number(JSON.stringify(json).match(/"totalNumRecs":\s*(\d+)/)?.[1] || 0);
    alVer(items);
    if (desde % 2000 === 0) console.log(`  ${t.nombre}: ${desde}/${total}, ${t.vistos} productos`);
    if (!items.length || desde + 100 >= total) break;
    await dormir(PAUSA_MS);
  }
}

fs.mkdirSync(CACHE, { recursive: true });

// Cada tienda corre en paralelo (son sitios distintos); dentro de una tienda, un pedido a la vez.
async function trabajar(t) {
  t.fallas = []; t.vistos = 0;
  const archivo = path.join(CACHE, `${t.id}.json`);
  if (reanudar && fs.existsSync(archivo)) {
    const guardado = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    console.log(`${t.nombre}: ${Object.keys(guardado).length} productos desde la caché`);
    return guardado;
  }
  const mapa = {};
  const alVer = (items, cat = '') => { for (const it of items) { if (!(it.ean in mapa)) t.vistos++; mapa[it.ean] = { n: it.n, m: it.m, precio: Math.round(it.precio), cat: it.cat || cat || (mapa[it.ean] && mapa[it.ean].cat) || '' }; } };
  console.log(`${t.nombre}: empezando…`);
  try {
    if (t.tipo === 'coto') await recorrerCoto(t, alVer); else await recorrerVtex(t, alVer);
  } catch (e) { t.fallas.push(e.message); }
  console.log(`${t.nombre}: ${t.vistos} productos${t.fallas.length ? `, ${t.fallas.length} pedidos fallidos (ej: ${t.fallas[0]})` : ''}`);
  if (t.vistos) fs.writeFileSync(archivo, JSON.stringify(mapa));
  return mapa;
}

const resultados = await Promise.all(TIENDAS.map(trabajar));

const productos = new Map(); // ean -> { n, m, p: { tienda: precio } }
TIENDAS.forEach((t, i) => {
  for (const [ean, it] of Object.entries(resultados[i])) {
    let p = productos.get(ean);
    if (!p) { p = { n: it.n, m: it.m, p: {}, cats: [] }; productos.set(ean, p); }
    if (it.cat) p.cats.push(it.cat);
    if (it.n.length > p.n.length) p.n = it.n; // el nombre más completo
    p.p[t.id] = it.precio;
  }
});

// Atípicos: con 3+ precios, se descarta el que está a más de 3× de la mediana (errores de la fuente:
// packs cargados como unidad, comas decimales corridas). Con 2 precios no hay cómo saber cuál es el bueno.
let atipicos = 0;
for (const p of productos.values()) {
  const e = Object.entries(p.p);
  if (e.length < 3) continue;
  const v = e.map((x) => x[1]).sort((a, b) => a - b);
  const mediana = v[Math.floor(v.length / 2)];
  for (const [id, precio] of e) if (precio < mediana / 3 || precio > mediana * 3) { delete p.p[id]; atipicos++; }
}
if (atipicos) console.log(`Se descartaron ${atipicos} precios atípicos (a más de 3× de la mediana del producto).`);

const medida = (n) => (n.match(/(\d+(?:[.,]\d+)?)\s?(kg|grs?|g|ml|cc|lts?|l)\b/i) || [])[0] || '';
const lista = [...productos].map(([ean, p]) => ({ ean, n: p.n, m: p.m, u: medida(p.n), c: rubroProducto(p.cats, p.n), p: p.p }))
  .filter((p) => Object.keys(p.p).length >= minTiendas)
  .sort((a, b) => Object.keys(b.p).length - Object.keys(a.p).length || a.n.localeCompare(b.n, 'es'));

// Protección: si casi no volvió nada (bloqueo, sitio caído), no pisar los precios anteriores.
if (lista.length < MIN_PRODUCTOS && !forzar) {
  console.error(`\nSolo ${lista.length} productos (mínimo ${MIN_PRODUCTOS}). No se guardó nada para no pisar los precios anteriores. Usá --forzar para guardar igual.`);
  process.exit(1);
}

const conteo = Object.fromEntries(TIENDAS.map((t) => [t.id, 0]));
for (const p of lista) for (const id of Object.keys(p.p)) conteo[id]++;
const salida = {
  fuente: 'online',
  zona: 'precios de las tiendas online',
  actualizado: new Date().toISOString(),
  tiendas: TIENDAS.filter((t, i) => Object.keys(resultados[i]).length).map((t) => ({ id: t.id, nombre: t.nombre, sucursales: conteo[t.id] })),
  productos: lista,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(salida));
const mb = (fs.statSync(outFile).size / 1e6).toFixed(1);
if (!args.includes('--out')) escribirIndice();
console.log(`\nListo: ${lista.length} productos (con precio en ${minTiendas}+ tiendas), ${mb} MB → ${outFile}`);

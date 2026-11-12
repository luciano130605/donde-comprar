#!/usr/bin/env node
// Convierte la base SEPA de Precios Claros en un archivo de precios POR ZONA (public/precios/<zona>.json)
// y actualiza el índice public/zonas.json que usa la web para el selector de zona.
//
// Uso:
//   node scripts/build-prices.mjs <carpeta-con-los-paquetes-sepa> [--zona caba] [--ejemplo] [--list-banderas]
//
// La carpeta es el contenido ya descomprimido del zip diario de SEPA: cada comercio
// viene como una carpeta (o un .zip) con comercio.csv, sucursales.csv y productos.csv.
// Los archivos usan "|" como separador y UTF-8 (disposición 55/2016, Anexo II).
// Las zonas se definen en config/stores.json ("zonas"). No usa IA ni servicios externos.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';
import { rubroProducto } from './rubros.mjs';
import { escribirIndice } from './indice-zonas.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const input = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--zona');
const esEjemplo = flag('--ejemplo');
const soloListar = flag('--list-banderas');
const soloZona = opt('--zona');

if (!input) {
  console.error('Falta la carpeta de entrada.\nUso: node scripts/build-prices.mjs <carpeta-sepa> [--zona caba] [--list-banderas]');
  process.exit(1);
}

const cfg = JSON.parse(fs.readFileSync(new URL('../config/stores.json', import.meta.url), 'utf8'));
const banderas = cfg.banderas.map((b) => ({ ...b, re: new RegExp(b.patron, 'i') }));
// Compatibilidad: una config vieja con una sola "zona" sigue funcionando.
const zonasCfg = (cfg.zonas || [{ id: 'zona', ...cfg.zona }]).filter((z) => !soloZona || z.id === soloZona);
if (!zonasCfg.length) { console.error(`No hay una zona "${soloZona}" en config/stores.json.`); process.exit(1); }
const zonas = zonasCfg.map((z) => ({ ...z, reLocalidad: z.localidad ? new RegExp(z.localidad, 'i') : null }));

// ---------- lectura de paquetes ----------
function findPackages(dir, found = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (fs.existsSync(path.join(p, 'productos.csv'))) found.push({ kind: 'dir', path: p });
      else findPackages(p, found);
    } else if (/\.zip$/i.test(e.name)) {
      found.push({ kind: 'zip', path: p });
    }
  }
  return found;
}

// Abre zips con `unzip` si está; si no (Windows), con `tar`, que sabe leer zips.
const usaUnzip = (() => { try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const paquetesDanados = new Set();
function zipEntry(zipPath, base) {
  let out;
  try {
    out = usaUnzip
      ? execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })
      : execFileSync('tar', ['-tf', zipPath], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    paquetesDanados.add(path.basename(zipPath)); // zip ilegible en el origen: se omite
    return null;
  }
  return out.split(/\r?\n/).find((n) => path.basename(n).toLowerCase() === base) || null;
}

function openCsv(pkg, base) {
  if (pkg.kind === 'dir') {
    const f = path.join(pkg.path, base);
    return fs.existsSync(f) ? fs.createReadStream(f, 'utf8') : null;
  }
  const entry = zipEntry(pkg.path, base);
  if (!entry) return null;
  const child = usaUnzip
    ? spawn('unzip', ['-p', pkg.path, entry], { stdio: ['ignore', 'pipe', 'ignore'] })
    : spawn('tar', ['-xOf', pkg.path, entry], { stdio: ['ignore', 'pipe', 'ignore'] });
  child.stdout.setEncoding('utf8');
  return child.stdout;
}

function splitLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === '|') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

let filasDescartadas = 0;
async function eachRow(stream, fn) {
  if (!stream) return;
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let head = null;
  for await (const raw of rl) {
    const line = raw.replace(/^﻿/, '').trim();
    if (!line || /^última actualización/i.test(line)) continue;
    const cols = splitLine(line);
    if (!head) { head = cols.map((c) => c.trim().toLowerCase()); continue; }
    if (cols.length !== head.length) { filasDescartadas++; continue; }
    const row = {};
    for (let i = 0; i < head.length; i++) row[head[i]] = cols[i].trim();
    fn(row);
  }
}

const num = (s) => { const n = Number(String(s).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---------- proceso ----------
const packages = findPackages(input);
if (!packages.length) {
  console.error(`No encontré paquetes SEPA en ${input}. Descomprimí el zip diario y apuntá a esa carpeta.`);
  process.exit(1);
}
console.log(`Paquetes encontrados: ${packages.length}. Zonas: ${zonas.map((z) => z.nombre).join(', ')}. Lector de zips: ${usaUnzip ? 'unzip' : 'tar'}.`);

const nombresVistos = new Map(); // nombre de bandera -> id de nuestra config | null
const sucursalesPorZona = new Map(zonas.map((z) => [z.id, new Map()])); // zona -> bandera -> cantidad
const productos = new Map(); // ean -> { n, m, u, z: { zonaId: { banderaId: [precios] } } }
let ultimaActualizacion = '';

for (const pkg of packages) {
  // 1) a qué bandera de nuestra config corresponde cada id_bandera de este comercio
  const mapaBandera = new Map(); // `${id_comercio}|${id_bandera}` -> id config
  await eachRow(openCsv(pkg, 'comercio.csv'), (r) => {
    const nombre = r.comercio_bandera_nombre || '';
    const razon = r.comercio_razon_social || '';
    const hit = banderas.find((b) => b.re.test(nombre) || b.re.test(razon));
    nombresVistos.set(nombre || razon, hit ? hit.id : null);
    mapaBandera.set(`${r.id_comercio}|${r.id_bandera}`, hit ? hit.id : null);
    if ((r.comercio_ultima_actualizacion || '') > ultimaActualizacion) ultimaActualizacion = r.comercio_ultima_actualizacion;
  });
  if (soloListar || ![...mapaBandera.values()].some(Boolean)) continue;

  // 2) sucursales: a qué zona(s) pertenece cada una
  const sucursales = new Map(); // clave sucursal -> { bid, zonas: [id] }
  await eachRow(openCsv(pkg, 'sucursales.csv'), (r) => {
    const bid = mapaBandera.get(`${r.id_comercio}|${r.id_bandera}`);
    if (!bid) return;
    const prov = (r.sucursales_provincia || '').toUpperCase();
    const zs = zonas.filter((z) => (!z.provincia || prov === z.provincia.toUpperCase()) && (!z.reLocalidad || z.reLocalidad.test(r.sucursales_localidad || '')));
    if (!zs.length) return;
    sucursales.set(`${r.id_comercio}|${r.id_bandera}|${r.id_sucursal}`, { bid, zonas: zs.map((z) => z.id) });
    for (const z of zs) { const m = sucursalesPorZona.get(z.id); m.set(bid, (m.get(bid) || 0) + 1); }
  });
  if (!sucursales.size) continue;

  // 3) precios de lista de esas sucursales, solo productos con EAN real
  await eachRow(openCsv(pkg, 'productos.csv'), (r) => {
    const suc = sucursales.get(`${r.id_comercio}|${r.id_bandera}|${r.id_sucursal}`);
    if (!suc) return;
    if (r.productos_ean !== undefined && r.productos_ean !== '1') return;
    const ean = (r.id_producto || '').replace(/^0+(?=\d{8})/, '');
    if (!/^\d{8,14}$/.test(ean)) return;
    const precio = num(r.productos_precio_lista);
    if (!(precio > 0)) return;
    let p = productos.get(ean);
    if (!p) {
      const cant = r.productos_cantidad_presentacion, un = r.productos_unidad_medida_presentacion;
      p = { n: r.productos_descripcion || '', m: r.productos_marca || '', u: cant && un && cant !== '1' ? `${cant} ${un}` : un || '', z: {} };
      productos.set(ean, p);
    }
    for (const zid of suc.zonas) ((p.z[zid] ||= {})[suc.bid] ||= []).push(precio);
  });
  process.stdout.write('.');
}
console.log('');

if (paquetesDanados.size) console.log(`Aviso: ${paquetesDanados.size} paquete(s) ilegibles en el origen, se omitieron: ${[...paquetesDanados].join(', ')}`);

if (soloListar) {
  console.log('Banderas que aparecen en los datos (→ la de tu config, o "sin asignar"):');
  for (const [n, id] of [...nombresVistos].sort()) console.log(`  ${n}  →  ${id ?? 'sin asignar'}`);
  process.exit(0);
}

// ---------- resultado: un archivo por zona ----------
const dirSalida = new URL('../public/precios/', import.meta.url);
fs.mkdirSync(dirSalida, { recursive: true });
for (const z of zonas) {
  const lista = [];
  for (const [ean, p] of productos) {
    const porBandera = p.z[z.id];
    if (!porBandera) continue;
    const precios = {};
    for (const [bid, arr] of Object.entries(porBandera)) precios[bid] = Math.round(median(arr) * 100) / 100;
    if (Object.keys(precios).length < cfg.minBanderas) continue;
    lista.push({ ean, n: p.n, m: p.m, u: p.u, c: rubroProducto([], p.n), p: precios });
  }
  lista.sort((a, b) => Object.keys(b.p).length - Object.keys(a.p).length || a.n.localeCompare(b.n, 'es'));
  const recorte = lista.slice(0, cfg.maxProductos);
  const cuenta = sucursalesPorZona.get(z.id);
  const tiendas = banderas.filter((b) => cuenta.has(b.id)).map((b) => ({ id: b.id, nombre: b.nombre, sucursales: cuenta.get(b.id) }));

  const salida = {
    fuente: esEjemplo ? 'ejemplo' : 'sepa',
    zonaId: z.id,
    zona: z.nombre,
    actualizado: ultimaActualizacion || new Date().toISOString(),
    tiendas,
    productos: recorte,
  };
  const archivo = new URL(`${z.id}.json`, dirSalida);
  fs.writeFileSync(archivo, JSON.stringify(salida));
  console.log(`${z.nombre}: ${recorte.length} productos en ${tiendas.length} supermercados (${tiendas.map((t) => `${t.nombre} ${t.sucursales}`).join(', ') || 'ninguno'}) → public/precios/${z.id}.json`);
  if (!tiendas.length) console.log('  Ningún supermercado coincidió. Corré con --list-banderas y ajustá "patron" en config/stores.json.');
}
if (filasDescartadas) console.log(`Aviso: ${filasDescartadas} filas con cantidad de columnas distinta a la del encabezado se descartaron.`);
escribirIndice();

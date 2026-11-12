#!/usr/bin/env node
// Baja el zip diario de Precios Claros (SEPA), lo descomprime en .cache/sepa-ext y genera los precios por zona.
//   node scripts/descargar-sepa.mjs [--dia jueves] [--solo-descargar]
// Sin --dia usa el día de hoy. Descarga ~330 MB; los zips internos se leen en streaming (no se extraen a disco).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const dia = sinAcentos(opt('--dia') || DIAS[new Date().getDay()]);
const CKAN = 'https://datos.produccion.gob.ar/api/3/action/package_show?id=sepa-precios';
const UA = 'Mozilla/5.0 (comparador-super; uso personal)';

const dirZip = '.cache/sepa-zip';
const dirExt = '.cache/sepa-ext';

console.log(`Buscando el zip de SEPA del ${dia}…`);
const pkg = await (await fetch(CKAN, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) })).json();
const recurso = (pkg.result?.resources || []).find((r) => sinAcentos(r.name) === dia && /zip/i.test(r.format || ''));
if (!recurso) { console.error(`No encontré el recurso "${dia}" en el dataset de SEPA.`); process.exit(1); }

fs.mkdirSync(dirZip, { recursive: true });
const destino = path.join(dirZip, `sepa_${dia}.zip`);
console.log(`Descargando ${(Number(recurso.size) / 1e6).toFixed(0)} MB…`);
const r = await fetch(recurso.url, { headers: { 'user-agent': UA }, redirect: 'follow' });
if (!r.ok) { console.error(`Falló la descarga: HTTP ${r.status}`); process.exit(1); }
const salida = fs.createWriteStream(destino);
const { Readable } = await import('node:stream');
const { pipeline } = await import('node:stream/promises');
await pipeline(Readable.fromWeb(r.body), salida);
const bytes = fs.statSync(destino).size;
if (recurso.size && Math.abs(bytes - Number(recurso.size)) > 1024) { console.error(`Descarga incompleta: ${bytes} bytes de ${recurso.size}.`); process.exit(1); }
console.log(`Descarga completa: ${(bytes / 1e6).toFixed(0)} MB.`);
if (args.includes('--solo-descargar')) process.exit(0);

// Descomprime en una carpeta propia y vacía (son archivos descargados: se tratan como datos no confiables).
fs.rmSync(dirExt, { recursive: true, force: true });
fs.mkdirSync(dirExt, { recursive: true });
let ok = spawnSync('unzip', ['-q', '-o', destino, '-d', dirExt], { stdio: 'inherit' }).status === 0;
if (!ok) ok = spawnSync('tar', ['-xf', destino, '-C', dirExt], { stdio: 'inherit' }).status === 0;
if (!ok) { console.error('No pude descomprimir el zip (hace falta `unzip` o un `tar` que lea zips).'); process.exit(1); }

const res = spawnSync(process.execPath, ['scripts/build-prices.mjs', dirExt], { stdio: 'inherit' });
process.exit(res.status ?? 1);

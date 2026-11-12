#!/usr/bin/env node
// Genera una carpeta con el MISMO formato que la base SEPA, pero con precios inventados.
// Sirve para probar el script y la web sin bajar los 4 GB reales. No usar como datos reales.
//   node scripts/make-sample.mjs ./sepa-ejemplo
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const out = process.argv[2] || './sepa-ejemplo';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ean = (i) => { const b = `779${String(1000000 + i * 37).padStart(9, '0')}`; let s = 0; for (let k = 0; k < 12; k++) s += +b[k] * (k % 2 ? 3 : 1); return b + ((10 - (s % 10)) % 10); };

const PRODUCTOS = [
  ['Leche entera sachet La Serenísima 1 l', 'La Serenísima', 1, 'l', 1700],
  ['Leche larga vida entera 1 l', 'Ilolay', 1, 'l', 1900],
  ['Manteca 200 g', 'La Paulina', 200, 'g', 3400],
  ['Yogur bebible vainilla 1 l', 'Ilolay', 1, 'l', 2700],
  ['Yerba mate con palo 1 kg', 'Playadito', 1, 'kg', 7000],
  ['Yerba mate suave 1 kg', 'Taragüí', 1, 'kg', 7300],
  ['Azúcar ledesma 1 kg', 'Ledesma', 1, 'kg', 1450],
  ['Harina de trigo 000 1 kg', 'Pureza', 1, 'kg', 1200],
  ['Fideos tirabuzón 500 g', 'Matarazzo', 500, 'g', 1700],
  ['Fideos spaghetti 500 g', 'Lucchetti', 500, 'g', 1650],
  ['Arroz largo fino 1 kg', 'Gallo', 1, 'kg', 2300],
  ['Aceite de girasol 900 ml', 'Natura', 900, 'ml', 3200],
  ['Atún en aceite 170 g', 'La Campagnola', 170, 'g', 3100],
  ['Puré de tomate 520 g', 'Arcor', 520, 'g', 1100],
  ['Café molido 250 g', 'La Virginia', 250, 'g', 4900],
  ['Galletitas Oreo 118 g', 'Oreo', 118, 'g', 1950],
  ['Pan lactal blanco 550 g', 'Fargo', 550, 'g', 2900],
  ['Gaseosa cola 2,25 l', 'Coca-Cola', 2.25, 'l', 3800],
  ['Agua mineral sin gas 2 l', 'Villavicencio', 2, 'l', 1300],
  ['Cerveza rubia lata 473 ml', 'Quilmes', 473, 'ml', 1750],
  ['Vino malbec 750 ml', 'Trapiche', 750, 'ml', 4900],
  ['Papel higiénico pack 4 rollos', 'Elite', 4, 'unidad', 3900],
  ['Lavandina 2 l', 'Ayudín', 2, 'l', 1400],
  ['Detergente 750 ml', 'Magistral', 750, 'ml', 3200],
  ['Jabón de tocador pack 3', 'Dove', 3, 'unidad', 3500],
  ['Shampoo 400 ml', 'Pantene', 400, 'ml', 5600],
  ['Mermelada de durazno 454 g', 'Arcor', 454, 'g', 2400],
  ['Dulce de leche 400 g', 'La Serenísima', 400, 'g', 3300],
  ['Sal fina 500 g', 'Celusal', 500, 'g', 900],
  ['Queso crema 300 g', 'Casancrem', 300, 'g', 3700],
  ['Solo en tres tiendas A', 'Marca X', 1, 'unidad', 1000],
  ['Solo en dos tiendas B', 'Marca Y', 1, 'unidad', 1000],
];
// factor de precio por bandera y qué banderas NO traen cada producto (para probar casos borde)
const BANDERAS = [
  { nombre: 'Coto', razon: 'Coto Centro Integral de Comercialización S.A.', f: 0.97, zip: false },
  { nombre: 'Día', razon: 'DIA Argentina S.A.', f: 0.95, zip: true },
  { nombre: 'Jumbo', razon: 'Cencosud S.A.', f: 1.08, zip: false },
  { nombre: 'Carrefour', razon: 'INC S.A.', f: 1.02, zip: false },
  { nombre: 'Disco', razon: 'Cencosud S.A.', f: 1.07, zip: false },
  { nombre: 'Changomás', razon: 'Walmart Argentina S.R.L.', f: 0.99, zip: false },
];
const faltan = { 'Día': [12, 18], 'Coto': [3] };

const w = (file, filas) => fs.writeFileSync(file, filas.join('\r\n') + '\r\n\r\nÚltima actualización: 2026-11-12T08:00:00-03:00\r\n');

BANDERAS.forEach((b, bi) => {
  const dir = path.join(out, `comercio-${bi + 1}`);
  fs.mkdirSync(dir, { recursive: true });
  const idc = String(10 + bi);
  w(path.join(dir, 'comercio.csv'), [
    'id_comercio|id_bandera|comercio_cuit|comercio_razon_social|comercio_bandera_nombre|comercio_bandera_url|comercio_ultima_actualizacion|comercio_version_sepa',
    `${idc}|1|30500000000|${b.razon}|${b.nombre}|https://ejemplo.com|2026-11-12T08:00:00-03:00|1.0`,
  ]);
  const suc = ['sucursales_provincia'];
  const sucRows = [
    'id_comercio|id_bandera|id_sucursal|sucursales_nombre|sucursales_tipo|sucursales_calle|sucursales_numero|sucursales_latitud|sucursales_longitud|sucursales_localidad|sucursales_provincia',
    `${idc}|1|1|Sucursal 1|Hipermercado|Calle|100|-34.600000|-58.400000|CIUDAD AUTONOMA DE BUENOS AIRES|AR-C`,
    `${idc}|1|2|Sucursal 2|Supermercado|Calle|200|-34.610000|-58.420000|CIUDAD AUTONOMA DE BUENOS AIRES|AR-C`,
    `${idc}|1|3|Sucursal 3|Supermercado|Calle|300|-34.800000|-58.500000|MORON|AR-B`,
  ];
  w(path.join(dir, 'sucursales.csv'), sucRows);
  const prod = ['id_comercio|id_bandera|id_sucursal|id_producto|productos_ean|productos_descripcion|productos_cantidad_presentacion|productos_unidad_medida_presentacion|productos_marca|productos_precio_lista|productos_precio_referencia|productos_cantidad_referencia|productos_unidad_medida_referencia|productos_precio_unitario_promo1|productos_leyenda_promo1|productos_precio_unitario_promo2|productos_leyenda_promo2'];
  PRODUCTOS.forEach(([desc, marca, cant, un, base], i) => {
    if ((faltan[b.nombre] || []).includes(i)) return;
    if (desc.startsWith('Solo en dos') && bi > 1) return;
    if (desc.startsWith('Solo en tres') && bi > 2) return;
    for (const s of [1, 2, 3]) {
      const precio = (base * b.f * (0.97 + rnd() * 0.06)).toFixed(2);
      prod.push(`${idc}|1|${s}|${ean(i)}|1|${desc}|${cant}|${un}|${marca}|${precio}|${precio}|1|${un}||||`);
    }
  });
  // un producto con código interno: debe ignorarse
  prod.push(`${idc}|1|1|0000000012345|0|Pan del día (código interno)|1|kg|Propia|2500.00|2500.00|1|kg||||`);
  w(path.join(dir, 'productos.csv'), prod);
  if (b.zip) {
    const zip = path.join(out, `comercio-${bi + 1}.zip`);
    try {
      execFileSync('python3', ['-I', '-c', `import zipfile,os,sys\nd=sys.argv[1]\nz=zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED)\n[z.write(os.path.join(d,f),f) for f in os.listdir(d)]\nz.close()`, dir, zip]);
      fs.rmSync(dir, { recursive: true });
    } catch { /* si no hay python3, queda como carpeta */ }
  }
});
console.log(`Datos de ejemplo en ${out}`);

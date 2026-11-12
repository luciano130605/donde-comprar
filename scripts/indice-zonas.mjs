// Arma public/zonas.json: la lista de archivos de precios disponibles (uno por zona SEPA, más el de tiendas online).
// La web lo usa para el selector de zona. Se llama al final de build-prices.mjs y de scrape-online.mjs.
import fs from 'node:fs';

const DIR = new URL('../public/precios/', import.meta.url);
const SALIDA = new URL('../public/zonas.json', import.meta.url);

export function escribirIndice() {
  const cfg = JSON.parse(fs.readFileSync(new URL('../config/stores.json', import.meta.url), 'utf8'));
  const orden = (cfg.zonas || []).map((z) => z.id);
  const zonas = [];
  if (fs.existsSync(DIR)) {
    for (const f of fs.readdirSync(DIR).filter((n) => n.endsWith('.json'))) {
      let d;
      try { d = JSON.parse(fs.readFileSync(new URL(f, DIR), 'utf8')); } catch { continue; }
      const id = f.replace(/\.json$/, '');
      zonas.push({
        id,
        nombre: d.fuente === 'online' ? 'Tiendas online (todo el país)' : d.zona || id,
        archivo: `precios/${f}`,
        fuente: d.fuente,
        actualizado: d.actualizado,
        productos: (d.productos || []).length,
        tiendas: (d.tiendas || []).length,
      });
    }
  }
  // Primero las zonas SEPA en el orden de la config, después lo demás (online).
  const rango = (z) => (orden.includes(z.id) ? orden.indexOf(z.id) : 1000);
  zonas.sort((a, b) => rango(a) - rango(b) || a.nombre.localeCompare(b.nombre, 'es'));
  const predeterminada = (zonas.find((z) => orden.includes(z.id)) || zonas[0] || {}).id || null;
  fs.writeFileSync(SALIDA, JSON.stringify({ predeterminada, zonas }, null, 2) + '\n');
  console.log(`Índice de zonas: ${zonas.map((z) => `${z.nombre} (${z.productos})`).join(', ') || 'vacío'} → public/zonas.json`);
  return zonas;
}

// Ejecutado directo: node scripts/indice-zonas.mjs
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) escribirIndice();

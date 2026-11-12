// Convierte las respuestas de los catálogos online al formato común { ean, n, m, precio }.
// VTEX (Día, Jumbo, Disco, Carrefour): /api/catalog_system/pub/products/search?ft=<texto>
// Coto (Endeca): /sitios/cdigi/browse?Ntt=<texto>&format=json

export const limpiarEan = (s) => String(s || '').trim().replace(/^0+(?=\d{8})/, '');
const esEan = (s) => /^\d{8,14}$/.test(s);

export function parseVtex(json) {
  const out = [];
  if (!Array.isArray(json)) return out;
  for (const p of json) {
    for (const it of p.items || []) {
      const ean = limpiarEan(it.ean);
      if (!esEan(ean)) continue;
      // Se usa Price (precio de venta). ListPrice viene con valores inconsistentes en algunas cadenas.
      const oferta = (it.sellers || []).map((s) => s.commertialOffer).find((o) => o && o.Price > 0 && o.AvailableQuantity > 0);
      if (!oferta) continue;
      out.push({ ean, n: p.productName || it.name || '', m: p.brand || '', precio: oferta.Price });
      break; // un SKU por producto alcanza: los demás son variantes del mismo EAN
    }
  }
  return out;
}

function buscarRegistros(o, hallados = []) {
  if (!o || typeof o !== 'object') return hallados;
  if (Array.isArray(o.records) && o.records.length) hallados.push(o.records);
  for (const k in o) buscarRegistros(o[k], hallados);
  return hallados;
}

export function parseCoto(json) {
  const grupos = buscarRegistros(json).sort((a, b) => b.length - a.length);
  const out = [];
  const g = (a, k) => { const v = a[k]; return Array.isArray(v) ? v[0] : v; };
  for (const r of grupos[0] || []) {
    const a = (r.records && r.records[0] && r.records[0].attributes) || r.attributes;
    if (!a) continue;
    const ean = limpiarEan(g(a, 'product.eanPrincipal'));
    const precio = Number(g(a, 'sku.activePrice'));
    if (!esEan(ean) || !(precio > 0)) continue;
    const cat = (Array.isArray(a['parentCategory.displayName']) ? a['parentCategory.displayName'] : [g(a, 'product.category')]).filter(Boolean).join(' > ');
    out.push({ ean, n: g(a, 'product.displayName') || '', m: g(a, 'product.brand') || g(a, 'product.MARCA') || '', precio, ...(cat ? { cat } : {}) });
  }
  return out;
}

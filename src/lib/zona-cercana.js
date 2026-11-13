// Zona sugerida según la ubicación. Es aproximada (cajas de coordenadas, no límites exactos) y se
// resuelve en el dispositivo: la ubicación no se envía a ningún lado. Para sumar una zona, agregá su caja.
const CAJAS = [
  { id: 'caba', sur: -34.705, norte: -34.526, oeste: -58.532, este: -58.335 }, // va primero: está dentro de Buenos Aires
  { id: 'buenos-aires', sur: -41.0, norte: -33.25, oeste: -63.4, este: -56.7 },
];
export function zonaPorUbicacion(lat, lng) {
  const c = CAJAS.find((z) => lat >= z.sur && lat <= z.norte && lng >= z.oeste && lng <= z.este);
  return c ? c.id : null;
}

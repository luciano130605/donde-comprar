import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import promosCfg from '../../config/promos.json';
import generadas from '../../config/promos.generated.json';
import { disponiblesHoy, mejorDescuentoHoy, estadoRegla, NOMBRES_DIA } from '../lib/promos.js';

const peso = (n) => '$' + Math.round(n).toLocaleString('es-AR');
const limpiar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const PAGINA = 40;

function menorPrecio(p, tiendas) {
  let m = null;
  for (const t of tiendas) {
    const v = p.p[t.id];
    if (v != null && (m == null || v < m)) m = v;
  }
  return m;
}
const precios = (p, tiendas) => tiendas.map((t) => ({ t, v: p.p[t.id] })).filter((x) => x.v != null).sort((a, b) => a.v - b.v);

const paso = 'inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-texto text-xl font-bold leading-none text-texto transition-colors hover:bg-texto hover:text-fondo disabled:cursor-not-allowed disabled:border-borde disabled:text-apagado disabled:hover:bg-transparent disabled:hover:text-apagado';
const campo = 'mt-1 h-11 w-full rounded-lg border-2 border-borde bg-transparent px-3 font-normal hover:border-texto placeholder:text-apagado';
const chip = (on) => 'h-10 rounded-full border-2 px-4 text-sm font-bold transition-colors ' + (on ? 'border-sello bg-sello text-sello-texto' : 'border-borde hover:border-texto');

// Promos que se muestran: las aprobadas a mano (sin los ejemplos inventados) más las que se leen
// automáticamente de las webs de Coto y Día (promos.generated.json). Ninguna pisa a la otra.
const APROBADAS = promosCfg.reglas.filter((r) => !/ejemplo/i.test(r.estado || ''));
const REGLAS = [
  ...APROBADAS,
  ...generadas.reglas.filter((g) => !APROBADAS.some((a) => (a.origen || a.id) === g.id)).map((g) => ({ ...g, leida: true })),
];
const mayus = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const limpiarMedio = (r) => mayus((r.medioTexto || '').replace(/^exclusivo en sucursales\.\s*/i, '').replace(/^en (un pago|compras?)( con)? /i, '').replace(/\.$/, '').trim()) || 'Cualquier medio de pago';
const DIAS_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const PAGOS_INICIAL = { dia: 'hoy', canal: 'online' };
const OPCIONES_ORDEN = [
  { value: 'nombre', label: 'Nombre (A–Z)' },
  { value: 'barato', label: 'Precio: de menor a mayor' },
  { value: 'caro', label: 'Precio: de mayor a menor' },
  { value: 'diferencia', label: 'Mayor diferencia entre súpers' },
];
const RUBROS = ['Almacén', 'Bebidas', 'Lácteos y frescos', 'Carnes y pescados', 'Frutas y verduras', 'Congelados', 'Limpieza', 'Perfumería e higiene', 'Bebés y niños', 'Mascotas', 'Hogar y electro', 'Otros'];

// Etiquetas visibles: ejemplo, vencida, aún no vigente, sin verificar o verificada hace más de 30 días.
function Etiquetas({ regla, hoy }) {
  const e = estadoRegla(regla, hoy);
  const items = [];
  if (e.ejemplo) items.push(['Ejemplo, verificar', 'aviso']);
  if (e.vencida) items.push(['Vencida', 'alerta']);
  if (e.aunNoVigente) items.push(['Aún no vigente', 'aviso']);
  if (e.sinVerificar && !e.ejemplo) items.push(['Sin verificar', 'aviso']);
  if (e.desactualizada) items.push([`Sin verificar hace ${e.diasDesdeVerificacion} días`, 'aviso']);
  return items.map(([t, k]) => (
    <span key={t} className={'ml-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-bold ' + (k === 'alerta' ? 'bg-alerta text-fondo' : 'bg-sello text-sello-texto')}>{t}</span>
  ));
}

// Una promo del día: porcentaje, medio de pago, mínimo, tope y días.
function FilaDescuento({ r, hoy }) {
  const dias = r.dias && r.dias.length && r.dias.length < 7 ? r.dias.map((d) => DIAS_CORTO[d]).join(', ') : null;
  const sinTope = r.tope == null && /sin tope/i.test((r.textoOriginal && r.textoOriginal.observacion) || '');
  return (
    <li className="text-sm">
      <span className="flex items-baseline gap-2">
        <b className="text-xl font-extrabold tabular-nums">{r.tipo === 'porcentaje' ? `${r.valor}%` : peso(r.valor)}</b>
        <span className="font-semibold leading-snug">{limpiarMedio(r)}</span>
      </span>
      <span className="mt-0.5 block text-apagado">
        {r.minimo != null ? `Mínimo ${peso(r.minimo)}` : 'Sin mínimo publicado'}
        {r.tope != null ? ` · Tope ${peso(r.tope)}${r.topePeriodo ? ` por ${r.topePeriodo === 'transaccion' ? 'compra' : r.topePeriodo}` : ''}` : sinTope ? ' · Sin tope' : ''}
        {dias ? ` · ${dias}` : ''}
        {r.vigenteHasta ? ` · Hasta ${r.vigenteHasta.split('-').reverse().join('/')}` : ''}
        {!r.leida && <Etiquetas regla={r} hoy={hoy} />}
      </span>
    </li>
  );
}

// Selector desplegable propio (reemplaza al <select> nativo). Teclado: flechas, Inicio/Fin, Enter/Espacio, Esc.
function Selector({ etiqueta, valor, opciones, onCambio, className = '' }) {
  const id = useId();
  const raiz = useRef(null);
  const boton = useRef(null);
  const [abierto, setAbierto] = useState(false);
  const indiceActual = Math.max(0, opciones.findIndex((o) => String(o.value) === String(valor)));
  const [activo, setActivo] = useState(indiceActual);
  const actual = opciones[indiceActual];

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (raiz.current && !raiz.current.contains(e.target)) setAbierto(false); };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);
  useEffect(() => {
    if (abierto) document.getElementById(`${id}-o${activo}`)?.scrollIntoView({ block: 'nearest' });
  }, [abierto, activo, id]);

  const abrir = () => { setActivo(indiceActual); setAbierto(true); };
  const elegir = (o) => { onCambio(o.value); setAbierto(false); boton.current?.focus(); };
  const teclas = (e) => {
    if (!abierto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); abrir(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setAbierto(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActivo((a) => Math.min(opciones.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Home') { e.preventDefault(); setActivo(0); }
    else if (e.key === 'End') { e.preventDefault(); setActivo(opciones.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(opciones[activo]); }
    else if (e.key === 'Tab') setAbierto(false);
  };

  return (
    <div ref={raiz} className={'relative ' + className}>
      <span id={`${id}-l`} className="text-sm font-semibold">{etiqueta}</span>
      <button ref={boton} id={`${id}-b`} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={abierto} aria-controls={`${id}-lb`}
        aria-labelledby={`${id}-l ${id}-b`} aria-activedescendant={abierto ? `${id}-o${activo}` : undefined}
        onClick={() => (abierto ? setAbierto(false) : abrir())} onKeyDown={teclas}
        className={'mt-1 flex h-11 w-full items-center justify-between gap-3 rounded-lg border-2 bg-transparent px-3 text-left font-normal transition-colors hover:border-texto ' + (abierto ? 'border-texto' : 'border-borde')}>
        <span className="truncate">{actual.label}</span>
        <svg xmlns="http://www.w3.org/2000/svg" className={'h-4 w-4 shrink-0 transition-transform ' + (abierto ? 'rotate-180' : '')} viewBox="0 0 24 24" fill="none">
          <path d="M19.9201 8.9502L13.4001 15.4702C12.6301 16.2402 11.3701 16.2402 10.6001 15.4702L4.08008 8.9502" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      {abierto && (
        <ul role="listbox" id={`${id}-lb`} aria-labelledby={`${id}-l`} tabIndex={-1}
          className="absolute left-0 z-40 mt-1 max-h-72 w-full min-w-[13rem] overflow-auto rounded-xl border-2 border-texto bg-fondo p-1 shadow-lg shadow-black/20">
          {opciones.map((o, i) => {
            const sel = i === indiceActual;
            return (
              <li key={String(o.value)} id={`${id}-o${i}`} role="option" aria-selected={sel}
                onClick={() => elegir(o)} onPointerEnter={() => setActivo(i)}
                className={'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-base ' + (i === activo ? 'bg-panel ' : '') + (sel ? 'font-bold' : '')}>
                <span>{o.label}</span>
                {sel && <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" color="currentColor" fill="none" stroke="currentColor" className="h-4 w-4 shrink-0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 13.2592L7.58583 15.9568C8.2525 16.6523 8.58583 17 9.00004 17C9.41425 17 9.74759 16.6523 10.4143 15.9568L19 7"></path>
</svg>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Botón de tema claro/oscuro. Guarda la elección; sin elección se usa el tema del sistema.
function BotonTema() {
  const [tema, setTema] = useState(null);
  useEffect(() => {
    setTema(document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);
  if (!tema) return <span className="h-11" aria-hidden="true" />;
  const oscuro = tema === 'dark';
  const alternar = () => {
    const nuevo = oscuro ? 'light' : 'dark';
    document.documentElement.dataset.theme = nuevo;
    try { localStorage.setItem('super-tema', nuevo); } catch { }
    setTema(nuevo);
  };
  return (
    <button type="button" onClick={alternar} aria-pressed={oscuro} aria-label={oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="inline-flex h-11 items-center gap-2 rounded-full border-2 border-texto px-4 text-sm font-bold transition-colors hover:bg-texto hover:text-fondo">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {oscuro
          ? <> <g clip-path="url(#clip0_4418_9168)">
            <path d="M12 18.5C15.5899 18.5 18.5 15.5899 18.5 12C18.5 8.41015 15.5899 5.5 12 5.5C8.41015 5.5 5.5 8.41015 5.5 12C5.5 15.5899 8.41015 18.5 12 18.5Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M19.14 19.14L19.01 19.01M19.01 4.99L19.14 4.86L19.01 4.99ZM4.86 19.14L4.99 19.01L4.86 19.14ZM12 2.08V2V2.08ZM12 22V21.92V22ZM2.08 12H2H2.08ZM22 12H21.92H22ZM4.99 4.99L4.86 4.86L4.99 4.99Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </g>
            <defs>
              <clipPath id="clip0_4418_9168">
                <rect width="24" height="24" fill="white" />
              </clipPath>
            </defs></>
          : <>
            <g clip-path="url(#clip0_4418_9159)">
              <path d="M2.02997 12.42C2.38997 17.57 6.75997 21.76 11.99 21.99C15.68 22.15 18.98 20.43 20.96 17.72C21.78 16.61 21.34 15.87 19.97 16.12C19.3 16.24 18.61 16.29 17.89 16.26C13 16.06 8.99997 11.97 8.97997 7.13996C8.96997 5.83996 9.23997 4.60996 9.72997 3.48996C10.27 2.24996 9.61997 1.65996 8.36997 2.18996C4.40997 3.85996 1.69997 7.84996 2.02997 12.42Z" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
            </g>
            <defs>
              <clipPath id="clip0_4418_9159">
                <rect width="24" height="24" />
              </clipPath>
            </defs>
          </>}
      </svg>
      {oscuro ? 'Tema claro' : 'Tema oscuro'}
    </button>
  );
}

export default function Comparador() {
  const base = import.meta.env.BASE_URL;
  const [zonas, setZonas] = useState(null); // índice: [{ id, nombre, archivo, ... }]
  const [zonaId, setZonaId] = useState(null);
  const [datos, setDatos] = useState(null);
  const [cargandoZona, setCargandoZona] = useState(false);
  const [error, setError] = useState(false);

  const pedir = (url) => fetch(base + url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); });

  // 1) índice de zonas; si no existe (despliegue viejo) se usa el archivo único prices.json.
  const iniciar = () => {
    setError(false);
    pedir('zonas.json')
      .then((idx) => {
        const lista = idx.zonas || [];
        let guardada = null;
        try { guardada = localStorage.getItem('super-zona'); } catch {}
        const elegida = lista.find((z) => z.id === guardada) || lista.find((z) => z.id === idx.predeterminada) || lista[0];
        if (!elegida) throw new Error('sin zonas');
        setZonas(lista);
        setZonaId(elegida.id);
        return pedir(elegida.archivo).then(setDatos);
      })
      .catch(() => pedir('prices.json').then((d) => { setZonas(null); setDatos(d); }).catch(() => setError(true)));
  };
  useEffect(iniciar, []);

  // 2) cambio de zona: se mantiene la pantalla y se reemplazan los datos.
  const cambiarZona = (id) => {
    const z = zonas.find((x) => x.id === id);
    if (!z || id === zonaId) return;
    setCargandoZona(true);
    pedir(z.archivo)
      .then((d) => { setDatos(d); setZonaId(id); try { localStorage.setItem('super-zona', id); } catch {} })
      .catch(() => setError(true))
      .finally(() => setCargandoZona(false));
  };

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="titulo text-5xl">No pudimos cargar los precios</h1>
        <p className="mt-3 text-apagado">Revisá tu conexión y probá de nuevo.</p>
        <button onClick={() => { setError(false); iniciar(); }} className="mt-6 h-12 rounded-full bg-sello px-8 font-bold text-sello-texto">Reintentar</button>
      </main>
    );
  }
  if (!datos) {
    return (
      <main className="mx-auto max-w-xl px-4 py-24 text-center" aria-live="polite">
        <h1 className="titulo text-5xl">Cargando precios…</h1>
        <p className="mt-3 text-apagado">Son muchos productos, puede tardar unos segundos.</p>
      </main>
    );
  }
  return <Tablero datos={datos} zonas={zonas} zonaId={zonaId} onZona={cambiarZona} cargandoZona={cargandoZona} />;
}

function Tablero({ datos, zonas, zonaId, onZona, cargandoZona }) {
  const { tiendas, productos, fuente, zona, actualizado } = datos;
  const [consulta, setConsulta] = useState('');
  const [soloLista, setSoloLista] = useState(false);
  const [marca, setMarca] = useState('');
  const [maxPrecio, setMaxPrecio] = useState('');
  const [enTiendas, setEnTiendas] = useState([]);
  const [orden, setOrden] = useState('nombre');
  const [rubro, setRubro] = useState('todos');
  const [visibles, setVisibles] = useState(PAGINA);
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [lista, setLista] = useState({});
  const [listo, setListo] = useState(false);

  const consultaDif = useDeferredValue(consulta);
  const [pagos, setPagos] = useState(PAGOS_INICIAL);
  const hoy = useMemo(() => new Date(), []);

  useEffect(() => {
    try { setLista(JSON.parse(localStorage.getItem('super-lista') || '{}')); } catch { }
    try {
      const p = JSON.parse(localStorage.getItem('super-pagos') || 'null');
      if (p) setPagos({ dia: p.dia ?? 'hoy', canal: p.canal === 'presencial' ? 'presencial' : 'online' });
    } catch { }
    setListo(true);
  }, []);
  useEffect(() => {
    if (!listo) return;
    try { localStorage.setItem('super-pagos', JSON.stringify(pagos)); } catch { }
  }, [pagos, listo]);
  useEffect(() => {
    if (!listo) return;
    try { localStorage.setItem('super-lista', JSON.stringify(lista)); } catch { }
  }, [lista, listo]);

  const indice = useMemo(() => productos.map((p) => ({ p, texto: limpiar(`${p.n} ${p.m}`), marca: limpiar(p.m || '') })), [productos]);
  const porEan = useMemo(() => new Map(productos.map((p) => [p.ean, p])), [productos]);
  const marcas = useMemo(() => {
    const c = new Map();
    for (const p of productos) if (p.m) c.set(p.m, (c.get(p.m) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400).map((x) => x[0]);
  }, [productos]);

  const enLista = Object.keys(lista).map((e) => porEan.get(e)).filter(Boolean);
  const hayLista = enLista.length > 0;
  const verSolo = soloLista && hayLista;
  useEffect(() => { if (!hayLista) setAbierto(false); }, [hayLista]);

  const baseRes = useMemo(() => {
    const palabras = limpiar(consultaDif).split(/\s+/).filter(Boolean);
    const m = limpiar(marca.trim());
    const tope = parseFloat(maxPrecio);
    let todos = indice.filter((x) => {
      if (palabras.length && !palabras.every((w) => x.texto.includes(w))) return false;
      if (m && !x.marca.includes(m)) return false;
      if (verSolo && !lista[x.p.ean]) return false;
      if (enTiendas.some((id) => x.p.p[id] == null)) return false;
      if (tope > 0) { const b = menorPrecio(x.p, tiendas); if (b == null || b > tope) return false; }
      return true;
    });
    const dif = (p) => { const v = precios(p, tiendas); return v.length > 1 ? v[v.length - 1].v - v[0].v : 0; };
    const barato = (p) => menorPrecio(p, tiendas) ?? Infinity;
    if (orden === 'barato') todos = [...todos].sort((a, b) => barato(a.p) - barato(b.p));
    else if (orden === 'caro') todos = [...todos].sort((a, b) => (barato(b.p) === Infinity ? -1 : barato(b.p)) - (barato(a.p) === Infinity ? -1 : barato(a.p)));
    else if (orden === 'diferencia') todos = [...todos].sort((a, b) => dif(b.p) - dif(a.p));
    else todos = [...todos].sort((a, b) => a.p.n.localeCompare(b.p.n, 'es'));
    return todos.map((x) => x.p);
  }, [consultaDif, indice, verSolo, lista, marca, maxPrecio, enTiendas, orden, tiendas]);

  // Separadores por rubro: solo si los datos traen rubro (c). Los conteos respetan la búsqueda y los filtros.
  const hayRubros = useMemo(() => productos.some((p) => p.c), [productos]);
  const conteoRubros = useMemo(() => {
    const m = new Map();
    for (const p of baseRes) { const c = p.c || 'Otros'; m.set(c, (m.get(c) || 0) + 1); }
    return m;
  }, [baseRes]);
  const resultados = useMemo(() => (rubro === 'todos' || !hayRubros ? baseRes : baseRes.filter((p) => (p.c || 'Otros') === rubro)), [baseRes, rubro, hayRubros]);

  useEffect(() => setVisibles(PAGINA), [consultaDif, marca, maxPrecio, enTiendas, orden, verSolo, rubro]);

  const hayFiltros = !!(marca.trim() || maxPrecio || enTiendas.length || orden !== 'nombre' || verSolo);
  const limpiarFiltros = () => { setMarca(''); setMaxPrecio(''); setEnTiendas([]); setOrden('nombre'); setSoloLista(false); };
  const alternarTienda = (id) => setEnTiendas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const cambiar = (ean, d) => setLista((l) => {
    const n = (l[ean] || 0) + d;
    const c = { ...l };
    if (n <= 0) delete c[ean]; else c[ean] = n;
    return c;
  });

  const cantidadTotal = enLista.reduce((s, p) => s + lista[p.ean], 0);
  const diaSel = pagos.dia === 'hoy' ? hoy.getDay() : Number(pagos.dia);
  const nombreDia = pagos.dia === 'hoy' ? `hoy, ${NOMBRES_DIA[hoy.getDay()]}` : NOMBRES_DIA[Number(pagos.dia)];
  const resumenDia = `${nombreDia} · ${pagos.canal === 'online' ? 'online' : 'presencial'}`;
  const totales = tiendas.map((t) => {
    let bruto = 0, faltan = 0;
    for (const p of enLista) {
      const v = p.p[t.id];
      if (v == null) faltan++; else bruto += v * lista[p.ean];
    }
    // El total que se compara es el de lista; el mejor descuento de hoy se informa aparte (no hace falta elegir medio de pago).
    const promo = hayLista ? mejorDescuentoHoy(REGLAS, t.id, { total: bruto, dia: diaSel, canal: pagos.canal, hoy }) : null;
    return { ...t, bruto, total: bruto, faltan, promo };
  });
  const hayPromo = totales.some((t) => t.promo && t.promo.ahorro > 0);
  const completos = totales.filter((t) => !t.faltan).sort((a, b) => a.total - b.total);
  const ganador = completos[0];
  const peor = completos[completos.length - 1];
  const ahorro = ganador && completos.length > 1 ? peor.total - ganador.total : 0;
  const ganadorPromo = hayPromo ? [...completos].sort((a, b) => a.promo.total - b.promo.total)[0] : null;

  const hoyPorTienda = useMemo(() => tiendas.map((t) => ({ t, reglas: disponiblesHoy(REGLAS, t.id, { dia: diaSel, canal: pagos.canal, hoy }) })), [tiendas, diaSel, pagos.canal, hoy]);
  const leidoEl = generadas.generadoEl ? new Date(generadas.generadoEl).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : '';

  const reparto = useMemo(() => {
    const por = new Map();
    let total = 0, sinPrecio = 0;
    for (const p of enLista) {
      const v = precios(p, tiendas);
      if (!v.length) { sinPrecio++; continue; }
      const { t, v: precio } = v[0];
      total += precio * lista[p.ean];
      if (!por.has(t.id)) por.set(t.id, { t, items: [], subtotal: 0 });
      const g = por.get(t.id);
      g.items.push({ p, cant: lista[p.ean], precio });
      g.subtotal += precio * lista[p.ean];
    }
    return { grupos: [...por.values()].sort((a, b) => b.subtotal - a.subtotal), total, sinPrecio };
  }, [enLista, lista, tiendas]);
  const ahorroReparto = ganador ? ganador.bruto - reparto.total : 0; // el reparto usa precios de lista, sin promos

  const copiar = async () => {
    const lineas = reparto.grupos.flatMap((g) => [`${g.t.nombre} (${peso(g.subtotal)})`, ...g.items.map((i) => `  ${i.cant} × ${i.p.n} — ${peso(i.precio)}`)]);
    const resumen = totales.map((t) => `${t.nombre}: ${peso(t.total)}${t.faltan ? ` (faltan ${t.faltan})` : ''}`);
    try {
      await navigator.clipboard.writeText(['Mi changuito', '', ...lineas, '', 'Total por súper:', ...resumen].join('\n'));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch { }
  };

  const fecha = actualizado ? new Date(actualizado).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const columnas = { '--cols': `minmax(0,2.4fr) repeat(${tiendas.length}, minmax(0,1fr))`, '--cols-caja': `minmax(0,2.4fr) repeat(${tiendas.length}, minmax(0,1fr)) 11rem` };
  const fila = 'md:grid md:items-center md:gap-x-5 md:[grid-template-columns:var(--cols)]';
  const mostrados = resultados.slice(0, visibles);

  const celdas = (p, mult = 1) => (
    <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3 sm:grid-cols-5 md:contents">
      {tiendas.map((t) => {
        const v = p.p[t.id];
        const mejor = menorPrecio(p, tiendas);
        const mejorAca = v != null && v === mejor;
        return (
          <div key={t.id} className="md:text-right">
            <dt className="text-xs text-apagado md:sr-only">{t.nombre}</dt>
            <dd className={'mt-0.5 tabular-nums md:mt-0 ' + (v == null ? 'text-sm text-apagado' : mejorAca ? 'inline-block rounded-md bg-sello px-2 py-0.5 text-lg font-extrabold text-sello-texto' : 'text-lg font-medium')}>
              {v != null ? peso(v * mult) : 'sin dato'}
              {mejorAca && <span className="sr-only"> (el más barato)</span>}
            </dd>
            {v != null && mult > 1 && <div className="text-xs text-apagado">{mult} × {peso(v)}</div>}
          </div>
        );
      })}
    </dl>
  );
  const stepper = (p, cant, sinMenos) => (
    <div className="flex shrink-0 items-center gap-1 md:mt-3">
      <button onClick={() => cambiar(p.ean, -1)} disabled={!cant && !sinMenos} aria-label={`Quitar uno de ${p.n}`} className={paso}>−</button>
      <output aria-label={`Cantidad de ${p.n}`} className={'w-9 text-center text-xl font-bold tabular-nums ' + (cant ? '' : 'text-apagado')}>{cant}</output>
      <button onClick={() => cambiar(p.ean, 1)} aria-label={`Agregar uno de ${p.n}`} className={paso}>+</button>
    </div>
  );
  const encabezado = (extra) => (
    <div className={fila + ' hidden border-b-2 border-texto pb-2 text-xs font-bold uppercase lg:text-sm ' + extra} aria-hidden="true">
      <span>Producto</span>
      {tiendas.map((t) => <span key={t.id} className="text-right leading-tight">{t.nombre}</span>)}
    </div>
  );

  return (
    <div style={columnas} className="mx-auto max-w-[90rem] px-4 pb-64 sm:px-6 md:pb-48">
      <header className="pt-4 sm:pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {zonas && zonas.length > 1
            ? <Selector etiqueta="Zona" className="min-w-[14rem]" valor={zonaId} opciones={zonas.map((z) => ({ value: z.id, label: z.nombre }))} onCambio={onZona} />
            : <span />}
          <BotonTema />
        </div>
        {cargandoZona && <p className="mt-2 text-sm text-apagado" role="status">Cargando precios de la zona…</p>}
        <h1 className="titulo mt-4 text-[clamp(3rem,11vw,6rem)] leading-[0.9] text-balance sm:mt-6">¿Dónde conviene hacer el súper?</h1>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-x-10 gap-y-3">
          <p className="max-w-[60ch] text-lg text-apagado">
            Sumá productos a tu lista: abajo ves cuánto cuesta el total en {tiendas.map((t) => t.nombre).join(', ')}.
          </p>
          <p className="max-w-[48ch] text-sm text-apagado">
            {productos.length.toLocaleString('es-AR')} productos.{' '}
            {fuente === 'sepa' && `Precios de lista de Precios Claros (SEPA) en ${zona}${fecha ? `, al ${fecha}` : ''}. Son la mediana de las sucursales de la zona.`}
            {fuente === 'online' && `Precios publicados en las tiendas online${fecha ? `, al ${fecha}` : ''}. Pueden diferir de los de góndola y incluir descuentos de la web.`}
          </p>
        </div>
        {fuente === 'ejemplo' && (
          <p role="note" className="mt-5 rounded-lg bg-sello px-4 py-3 text-sm font-medium text-sello-texto">
            Estás viendo datos de ejemplo con precios inventados. Para usar los reales, corré <code className="font-bold">npm run datos:online</code>.
          </p>
        )}
      </header>

      <section aria-labelledby="h-prod" className="mt-10">
        <h2 id="h-prod" className="sr-only">Productos</h2>

        <details open className="group mb-4 rounded-2xl border-2 border-borde p-4 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="titulo text-2xl sm:text-3xl">Descuentos de hoy <span className="font-sans text-base font-medium normal-case text-apagado" style={{ fontStretch: '100%', letterSpacing: 0 }}>· {resumenDia}</span></span>
            <span aria-hidden="true" className="text-xl leading-none transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3">
            <Selector etiqueta="Día de la compra" className="min-w-[13rem]" valor={pagos.dia}
              opciones={[{ value: 'hoy', label: `Hoy (${NOMBRES_DIA[hoy.getDay()]})` }, ...NOMBRES_DIA.map((n, i) => ({ value: String(i), label: mayus(n) }))]}
              onCambio={(v) => setPagos((p) => ({ ...p, dia: v }))} />
            <fieldset>
              <legend className="text-sm font-semibold">Canal</legend>
              <div className="mt-1 flex gap-2">
                {[['online', 'Online'], ['presencial', 'Presencial']].map(([id, t]) => <button key={id} type="button" aria-pressed={pagos.canal === id} onClick={() => setPagos((p) => ({ ...p, canal: id }))} className={chip(pagos.canal === id) + ' h-11'}>{t}</button>)}
              </div>
            </fieldset>
          </div>
          <p className="mt-3 max-w-[75ch] text-sm text-apagado">
            Estos son los descuentos con bancos, billeteras y tarjetas que cada súper publica para ese día, sin que tengas que elegir cómo pagás.
            {leidoEl && ` Leídos de las webs de Coto y Día el ${leidoEl}.`} Aplican condiciones y exclusiones: confirmalos en el súper antes de pagar.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {hoyPorTienda.filter((x) => x.reglas.length).map(({ t, reglas }) => {
              const tot = totales.find((x) => x.id === t.id);
              const pr = tot && tot.promo;
              return (
                <article key={t.id} className="rounded-xl bg-panel p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="titulo text-2xl leading-none">{t.nombre}</h3>
                    <span className="text-sm text-apagado">{reglas.length} {reglas.length === 1 ? 'descuento' : 'descuentos'}</span>
                  </div>
                  <ul className="mt-3 grid gap-3">
                    {reglas.slice(0, 3).map((r) => <FilaDescuento key={r.id} r={r} hoy={hoy} />)}
                  </ul>
                  {reglas.length > 3 && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer font-bold underline underline-offset-4">Ver los {reglas.length - 3} restantes</summary>
                      <ul className="mt-3 grid gap-3">
                        {reglas.slice(3).map((r) => <FilaDescuento key={r.id} r={r} hoy={hoy} />)}
                      </ul>
                    </details>
                  )}
                  {pr && (pr.ahorro > 0 || pr.proxima) && (
                    <p className="mt-4 rounded-lg border-2 border-borde px-3 py-2 text-sm" aria-live="polite">
                      {pr.ahorro > 0 && <span>Con tu changuito ahorrás hasta <b>{peso(pr.ahorro)}</b> ({peso(tot.bruto)} → <b>{peso(pr.total)}</b>).</span>}
                      {pr.proxima && <span className="block font-semibold text-alerta">Sumá {peso(pr.proxima.faltaParaMinimo)} y llegás al mínimo de {peso(pr.proxima.regla.minimo)} ({pr.proxima.regla.tipo === 'porcentaje' ? `${pr.proxima.regla.valor}%` : peso(pr.proxima.regla.valor)}).</span>}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
          {hoyPorTienda.some((x) => !x.reglas.length) && (
            <p className="mt-4 text-sm text-apagado">
              Sin descuentos para mostrar: {hoyPorTienda.filter((x) => !x.reglas.length).map((x) => x.t.nombre).join(', ')}. Algunos publican sus promos como imágenes y no se pueden leer automáticamente; mirá la web del súper.
            </p>
          )}
        </details>

        <details className="group rounded-2xl border-2 border-borde p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-bold">
            <span>Filtros y orden{hayFiltros ? ' · activos' : ''}</span>
            <span aria-hidden="true" className="text-xl leading-none transition-transform group-open:rotate-45">+</span>
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_11rem_14rem]">
            <label className="block text-sm font-semibold">Marca
              <input list="lista-marcas" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ej: Arcor, Ilolay…" className={campo} />
              <datalist id="lista-marcas">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
            </label>
            <label className="block text-sm font-semibold">Precio máximo ($)
              <input type="number" inputMode="numeric" min="0" step="100" value={maxPrecio} onChange={(e) => setMaxPrecio(e.target.value)} placeholder="Sin tope" className={campo} />
            </label>
            <Selector etiqueta="Ordenar por" valor={orden} opciones={OPCIONES_ORDEN} onCambio={setOrden} />
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Mostrar solo lo que tiene precio en</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {tiendas.map((t) => <button key={t.id} type="button" aria-pressed={enTiendas.includes(t.id)} onClick={() => alternarTienda(t.id)} className={chip(enTiendas.includes(t.id))}>{t.nombre}</button>)}
            </div>
          </fieldset>
          {hayFiltros && <button type="button" onClick={limpiarFiltros} className="mt-4 text-sm font-semibold underline underline-offset-4 hover:text-alerta">Quitar todos los filtros</button>}
        </details>

        {hayRubros && (
          <nav aria-label="Rubros" className="-mx-4 mt-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
            <ul className="flex gap-2 pb-2">
              {[['todos', 'Todos', baseRes.length], ...RUBROS.filter((r) => conteoRubros.get(r) || r === rubro).map((r) => [r, r, conteoRubros.get(r) || 0])].map(([id, nombre, n]) => (
                <li key={id} className="shrink-0">
                  <button type="button" aria-pressed={rubro === id} onClick={() => setRubro(id)} className={chip(rubro === id) + ' whitespace-nowrap'}>
                    {nombre} <span className={rubro === id ? '' : 'text-apagado'}>{n.toLocaleString('es-AR')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="sticky top-0 z-20 -mx-4 mt-2 bg-fondo px-4 pt-3 sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <label className="min-w-0 flex-1 basis-64">
              <span className="sr-only">Buscar producto</span>
              <input type="search" value={consulta} onChange={(e) => setConsulta(e.target.value)} placeholder="Buscar: leche, yerba, aceite…"
                className="h-14 w-full rounded-full border-2 border-texto bg-transparent px-6 text-lg placeholder:text-apagado" />
            </label>
            <button type="button" aria-pressed={verSolo} disabled={!hayLista} onClick={() => setSoloLista((v) => !v)}
              className={'h-14 rounded-full border-2 px-6 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:border-borde disabled:text-apagado ' + (verSolo ? 'border-sello bg-sello text-sello-texto' : 'border-texto hover:bg-texto hover:text-fondo')}>
              Solo mi lista{hayLista ? ` (${enLista.length})` : ''}
            </button>
          </div>
          <p className="mt-2 text-sm text-apagado" aria-live="polite">
            {resultados.length.toLocaleString('es-AR')} {resultados.length === 1 ? 'producto' : 'productos'}
            {resultados.length > mostrados.length && ` · mostrando ${mostrados.length.toLocaleString('es-AR')}`}
          </p>
          {encabezado('mt-2')}
        </div>

        <ul>
          {mostrados.map((p) => {
            const cant = lista[p.ean] || 0;
            return (
              <li key={p.ean} className={fila + ' border-b border-borde py-5 md:py-3 ' + (cant ? 'bg-panel -mx-4 px-4 sm:-mx-6 sm:px-6' : '')}>
                <div className="flex items-start justify-between gap-4 md:block">
                  <div className="min-w-0">
                    <div className="text-xl font-bold leading-tight">{p.n}</div>
                    <div className="mt-0.5 text-sm text-apagado">{[p.m, p.u].filter(Boolean).join(' · ')}</div>
                  </div>
                  {stepper(p, cant)}
                </div>
                {celdas(p)}
              </li>
            );
          })}
        </ul>
        {!resultados.length && (
          <p className="py-10 text-lg text-apagado">{consulta || hayFiltros ? 'Ningún producto coincide con la búsqueda y los filtros. Probá con menos filtros o con otra palabra.' : 'No hay productos para mostrar.'}</p>
        )}
        {resultados.length > mostrados.length && (
          <div className="mt-8 text-center">
            <button onClick={() => setVisibles((v) => v + PAGINA)} className="h-14 rounded-full border-2 border-texto px-10 text-base font-bold transition-colors hover:bg-texto hover:text-fondo">
              Mostrar {Math.min(PAGINA, resultados.length - mostrados.length)} más
            </button>
          </div>
        )}
      </section>

      {hayLista && (
        <aside aria-label="Total por supermercado" className="caja fixed inset-x-0 bottom-0 z-30 border-t-2 border-texto bg-fondo shadow-[0_-12px_32px_-12px_rgb(0_0_0/0.35)]">
          {abierto && (
            <section id="detalle-changuito" aria-labelledby="h-detalle" className="max-h-[58vh] overflow-y-auto border-b-2 border-texto">
              <div style={columnas} className="mx-auto max-w-[90rem] px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h2 id="h-detalle" className="titulo text-3xl leading-none">Detalle del changuito</h2>
                  <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
                    <button onClick={copiar} className="underline underline-offset-4 hover:text-alerta">{copiado ? 'Copiado ✓' : 'Copiar lista'}</button>
                    <button onClick={() => setAbierto(false)} className="underline underline-offset-4 hover:text-alerta">Cerrar</button>
                  </div>
                </div>

                {reparto.grupos.length > 1 && ahorroReparto > 0 && (
                  <div className="mt-3 rounded-lg bg-panel px-4 py-3 text-sm">
                    <p>
                      Si repartís la compra y llevás cada producto de donde sale más barato, pagás <b>{peso(reparto.total)}</b>: {peso(ahorroReparto)} menos que comprando todo en {ganador.nombre}, en ambos casos a precio de lista (sin promos). Tendrías que ir a {reparto.grupos.length} lugares.
                    </p>
                    <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                      {reparto.grupos.map((g) => (
                        <li key={g.t.id}><b>{g.t.nombre}</b> ({peso(g.subtotal)}): <span className="text-apagado">{g.items.map((i) => `${i.cant} × ${i.p.n}`).join(', ')}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-3 rounded-lg border-2 border-borde px-4 py-3 text-sm">
                  <h3 className="font-bold">Descuentos de hoy para tu changuito <span className="font-normal text-apagado">· {resumenDia}</span></h3>
                  <ul className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                    {totales.map((t) => {
                      const m = t.promo && t.promo.mejor;
                      return (
                        <li key={t.id}>
                          <b>{t.nombre}</b>:{' '}
                          {m ? (
                            <>
                              {m.regla.tipo === 'porcentaje' ? `${m.regla.valor}%` : peso(m.regla.valor)} con {limpiarMedio(m.regla)}: <b>−{peso(t.promo.ahorro)}</b> (de {peso(t.bruto)} a {peso(t.promo.total)})
                              <span className="block text-xs text-apagado">{m.regla.minimo != null ? `Mínimo ${peso(m.regla.minimo)}` : 'Sin mínimo publicado'}{m.regla.tope != null ? ` · tope ${peso(m.regla.tope)}` : ''}</span>
                            </>
                          ) : <span className="text-apagado">sin descuentos hoy para este total</span>}
                          {t.promo && t.promo.proxima && <span className="block text-xs font-semibold text-alerta">Sumá {peso(t.promo.proxima.faltaParaMinimo)} para llegar al mínimo de {peso(t.promo.proxima.regla.minimo)}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-2 text-xs text-apagado">Se muestra el mayor descuento disponible hoy en cada súper, con cualquier medio de pago. Confirmá condiciones y exclusiones en el súper.</p>
                </div>
                {reparto.sinPrecio > 0 && <p className="mt-2 text-sm text-alerta">{reparto.sinPrecio} {reparto.sinPrecio === 1 ? 'producto no tiene' : 'productos no tienen'} precio en ningún súper.</p>}

                {encabezado('mt-4')}
                <ul>
                  {enLista.map((p) => (
                    <li key={p.ean} className={fila + ' border-b border-borde py-3'}>
                      <div className="flex items-start justify-between gap-4 md:block">
                        <div className="min-w-0">
                          <div className="text-base font-bold leading-tight">{p.n}</div>
                          <div className="text-sm text-apagado">{[p.m, p.u].filter(Boolean).join(' · ')}</div>
                        </div>
                        {stepper(p, lista[p.ean], true)}
                      </div>
                      {celdas(p, lista[p.ean])}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-apagado">Los totales de cada súper están en la barra de abajo. Los que dicen «faltan» no suman los productos sin precio.</p>
              </div>
            </section>
          )}
          <div style={columnas} className="mx-auto max-w-[90rem] px-4 py-3 sm:px-6">
            <div className="flex items-center justify-between gap-3 md:hidden">
              <p className="text-sm font-bold">Tu changuito · {cantidadTotal} {cantidadTotal === 1 ? 'producto' : 'productos'}</p>
              <span className="flex items-center gap-4">
                <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-controls="detalle-changuito" className="text-sm font-bold underline underline-offset-4">{abierto ? 'Ocultar detalle' : 'Ver detalle'}</button>
                <button onClick={() => setLista({})} className="text-sm font-semibold underline underline-offset-4 hover:text-alerta">Vaciar</button>
              </span>
            </div>
            <div className="mt-2 flex items-stretch gap-2 overflow-x-auto md:mt-0 md:grid md:items-center md:gap-x-5 md:overflow-visible md:[grid-template-columns:var(--cols-caja)]">
              <div className="hidden md:block">
                <p className="titulo text-2xl leading-none">Tu changuito</p>
                <p className="mt-1 text-sm text-apagado">
                  {cantidadTotal} {cantidadTotal === 1 ? 'producto' : 'productos'} ·{' '}
                  <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} aria-controls="detalle-changuito" className="font-bold underline underline-offset-4">{abierto ? 'Ocultar detalle' : 'Ver detalle'}</button> ·{' '}
                  <button onClick={() => setLista({})} className="font-semibold underline underline-offset-4 hover:text-alerta">Vaciar</button>
                </p>
              </div>
              {totales.map((t) => {
                const gana = t === ganador;
                return (
                  <div key={t.id} className={'min-w-[5.75rem] flex-1 rounded-lg px-1.5 py-1.5 text-center md:min-w-0 md:px-2 md:text-right ' + (gana ? 'bg-sello text-sello-texto' : '')}>
                    <div className={'text-xs font-semibold leading-tight ' + (gana ? '' : 'text-apagado')}>{t.nombre}</div>
                    <div className={'text-base font-extrabold tabular-nums sm:text-lg ' + (t.faltan ? 'text-apagado' : '')}>{t.faltan && !t.bruto ? '—' : peso(t.total)}</div>
                    <div className="truncate text-xs">{gana ? 'Más barato' : t.faltan ? <span className="text-alerta">faltan {t.faltan}</span> : ' '}</div>
                    <div className="text-xs font-semibold leading-tight" title={t.promo && t.promo.mejor ? `${limpiarMedio(t.promo.mejor.regla)}: −${peso(t.promo.ahorro)} (lista ${peso(t.bruto)}, con descuento ${peso(t.promo.total)})` : ''}>
                      {t.promo && t.promo.ahorro > 0
                        ? <span>−{peso(t.promo.ahorro)} promo</span>
                        : t.promo && t.promo.proxima
                          ? <span className="text-alerta">faltan {peso(t.promo.proxima.faltaParaMinimo)} p/ promo</span>
                          : ' '}
                    </div>
                  </div>
                );
              })}
              <p className="hidden text-right text-sm md:block" aria-live="polite">
                {ganador
                  ? (ahorro > 0 ? <>Ahorrás <b className="text-base">{peso(ahorro)}</b> comprando en {ganador.nombre} y no en {peor.nombre}</> : <>Conviene {ganador.nombre}</>)
                  : <span className="text-apagado">Ningún súper tiene todo. Sacá los «faltan».</span>}
                {ganadorPromo && <span className="mt-1 block">Con descuentos de hoy: <b>{ganadorPromo.nombre}</b> {peso(ganadorPromo.promo.total)}</span>}
              </p>
            </div>
            <p className="mt-1 text-xs text-apagado md:hidden" aria-live="polite">
              {ganador
                ? (ahorro > 0 ? `Ahorrás ${peso(ahorro)} comprando en ${ganador.nombre} y no en ${peor.nombre}.` : `Conviene ${ganador.nombre}.`)
                : 'Ningún súper tiene todo. Sacá los productos que figuran como «faltan».'}
              {ganadorPromo && ` Con descuentos de hoy: ${ganadorPromo.nombre} ${peso(ganadorPromo.promo.total)}.`}
              {totales.some((t) => t.faltan) && ' Los totales con «faltan» no suman los productos sin precio.'}
            </p>
          </div>
        </aside>
      )}
    </div>
  );
}

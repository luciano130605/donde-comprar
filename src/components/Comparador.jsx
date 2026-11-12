import { createContext, useContext, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import promosCfg from '../../config/promos.json';
import generadas from '../../config/promos.generated.json';
import { disponiblesHoy, estadoRegla, NOMBRES_DIA } from '../lib/promos.js';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Search01Icon, FilterMailIcon, Tag01Icon, DiscountIcon, ArrowUpRight01Icon, ArrowDown01Icon, Tick02Icon, Moon02Icon, Sun03Icon, PackageIcon, DrinkIcon, MilkBottleIcon, SteakIcon, AppleIcon, IceCream01Icon, CleanIcon, BodySoapIcon, BabyBottleIcon, PawPrintIcon, Home01Icon, GridViewIcon,
  Package01Icon,
  CheeseIcon,
  IceCubesIcon,
  ElectricHome02Icon,
} from '@hugeicons/core-free-icons';

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

const campo = 'mt-1 h-11 w-full rounded-2xl border border-borde bg-hoja px-3 font-normal hover:border-apagado placeholder:text-apagado';
const chip = (on) => 'h-9 rounded-full px-3.5 text-sm font-bold transition-colors ' + (on ? 'bg-primario text-primario-texto' : 'border border-borde bg-hoja hover:border-apagado');

// Íconos: Hugeicons. Los de rubro usan el nombre del rubro como clave.
const ICONOS = {
  buscar: Search01Icon,
  filtros: FilterMailIcon,
  etiqueta: Tag01Icon,
  descuento: DiscountIcon,
  flecha: ArrowUpRight01Icon,
  chevron: ArrowDown01Icon,
  check: Tick02Icon,
  luna: Moon02Icon,
  sol: Sun03Icon,
  'Almacén': Package01Icon,
  'Bebidas': MilkBottleIcon,
  'Lácteos y frescos': CheeseIcon,
  'Carnes y pescados': SteakIcon,
  'Frutas y verduras': AppleIcon,
  'Congelados': IceCubesIcon,
  'Limpieza': CleanIcon,
  'Perfumería e higiene': BodySoapIcon,
  'Bebés y niños': BabyBottleIcon,
  'Mascotas': PawPrintIcon,
  'Hogar y electro': ElectricHome02Icon,
  'Otros': GridViewIcon,
};
function Icono({ n, className = '' }) {
  return <HugeiconsIcon icon={ICONOS[n] || ICONOS.Otros} strokeWidth={1.8} className={className} aria-hidden="true" />;
}

// Logos de los súpers: poné el archivo en public/logos/<id>.png (o svg, webp, jpg) con el id de la tienda
// (coto, dia, jumbo, carrefour, disco, vea, changomas, cordiez, josimar, laanonima, coopobrera, toledo, unicoop…).
// La página (index.astro) lee esa carpeta al compilar y pasa la lista; si falta un logo se muestran las iniciales.
const LogosCtx = createContext({});
const COLORES_TIENDA = ['#c2410c', '#b91c1c', '#15803d', '#1d4ed8', '#7e22ce', '#0f766e', '#a16207', '#be185d', '#4338ca', '#0369a1', '#4d7c0f', '#9f1239'];
function Avatar({ tienda }) {
  const archivo = useContext(LogosCtx)[tienda.id];
  if (archivo) {
    return <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-borde bg-white p-1"><img src={`${import.meta.env.BASE_URL}logos/${archivo}`} alt="" className="h-full w-full object-contain" /></span>;
  }
  let h = 0;
  for (const ch of tienda.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const partes = tienda.nombre.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').split(' ').filter(Boolean);
  const ini = (partes.length > 1 ? partes[0][0] + partes[1][0] : tienda.nombre.slice(0, 2)).toUpperCase();
  return <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: COLORES_TIENDA[h % COLORES_TIENDA.length] }}>{ini}</span>;
}

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
    <li className="py-3 text-sm">
      <span className="flex items-baseline gap-2">
        <b className="rounded-lg bg-suave px-2 py-0.5 text-base font-bold tabular-nums text-suave-texto">{r.tipo === 'porcentaje' ? `${r.valor}%` : peso(r.valor)}</b>
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
function Selector({ etiqueta, valor, opciones, onCambio, className = '', compacto = false }) {
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
      <span id={`${id}-l`} className={compacto ? 'sr-only' : 'text-sm font-semibold'}>{etiqueta}</span>
      <button ref={boton} id={`${id}-b`} type="button" role="combobox" aria-haspopup="listbox" aria-expanded={abierto} aria-controls={`${id}-lb`}
        aria-labelledby={`${id}-l ${id}-b`} aria-activedescendant={abierto ? `${id}-o${activo}` : undefined}
        onClick={() => (abierto ? setAbierto(false) : abrir())} onKeyDown={teclas}
        className={(compacto ? 'h-9 rounded-xl text-sm font-bold ' : 'mt-1 h-11 rounded-2xl ') + 'flex w-full items-center justify-between gap-2 border bg-hoja px-3 text-left transition-colors hover:border-apagado ' + (abierto ? 'border-apagado' : 'border-borde')}>
        <span className="truncate">{actual.label}</span>
        <Icono n="chevron" className={'h-4 w-4 shrink-0 transition-transform ' + (abierto ? 'rotate-180' : '')} />
      </button>
      {abierto && (
        <ul role="listbox" id={`${id}-lb`} aria-labelledby={`${id}-l`} tabIndex={-1}
          className="absolute left-0 z-40 mt-1 max-h-72 w-full min-w-[13rem] overflow-auto rounded-2xl border border-borde bg-hoja p-1 shadow-xl shadow-black/15">
          {opciones.map((o, i) => {
            const sel = i === indiceActual;
            return (
              <li key={String(o.value)} id={`${id}-o${i}`} role="option" aria-selected={sel}
                onClick={() => elegir(o)} onPointerEnter={() => setActivo(i)}
                className={'flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-base ' + (i === activo ? 'bg-panel ' : '') + (sel ? 'font-bold' : '')}>
                <span>{o.label}</span>
                {sel && <Icono n="check" className="h-4 w-4 shrink-0" />}
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
      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-borde bg-hoja transition-colors hover:border-apagado">
      <Icono n={oscuro ? 'sol' : 'luna'} className="h-5 w-5" />
    </button>
  );
}

export default function Comparador({ logos = {} }) {
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
        try { guardada = localStorage.getItem('super-zona'); } catch { }
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
      .then((d) => { setDatos(d); setZonaId(id); try { localStorage.setItem('super-zona', id); } catch { } })
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
  return <LogosCtx.Provider value={logos}><Tablero datos={datos} zonas={zonas} zonaId={zonaId} onZona={cambiarZona} cargandoZona={cargandoZona} /></LogosCtx.Provider>;
}

function Tablero({ datos, zonas, zonaId, onZona, cargandoZona }) {
  const { tiendas, productos, fuente, zona, actualizado } = datos;
  const [consulta, setConsulta] = useState('');
  const [marca, setMarca] = useState('');
  const [maxPrecio, setMaxPrecio] = useState('');
  const [enTiendas, setEnTiendas] = useState([]);
  const [orden, setOrden] = useState('nombre');
  const [rubro, setRubro] = useState('todos');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [vista, setVista] = useState('productos');
  const [visibles, setVisibles] = useState(PAGINA);
  const [listo, setListo] = useState(false);

  const consultaDif = useDeferredValue(consulta);
  const [pagos, setPagos] = useState(PAGOS_INICIAL);
  const hoy = useMemo(() => new Date(), []);

  useEffect(() => {
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

  const indice = useMemo(() => productos.map((p) => ({ p, texto: limpiar(`${p.n} ${p.m}`), marca: limpiar(p.m || '') })), [productos]);
  const marcas = useMemo(() => {
    const c = new Map();
    for (const p of productos) if (p.m) c.set(p.m, (c.get(p.m) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 400).map((x) => x[0]);
  }, [productos]);

  const baseRes = useMemo(() => {
    const palabras = limpiar(consultaDif).split(/\s+/).filter(Boolean);
    const m = limpiar(marca.trim());
    const tope = parseFloat(maxPrecio);
    let todos = indice.filter((x) => {
      if (palabras.length && !palabras.every((w) => x.texto.includes(w))) return false;
      if (m && !x.marca.includes(m)) return false;
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
  }, [consultaDif, indice, marca, maxPrecio, enTiendas, orden, tiendas]);

  // Separadores por rubro: solo si los datos traen rubro (c). Los conteos respetan la búsqueda y los filtros.
  const hayRubros = useMemo(() => productos.some((p) => p.c), [productos]);
  const conteoRubros = useMemo(() => {
    const m = new Map();
    for (const p of baseRes) { const c = p.c || 'Otros'; m.set(c, (m.get(c) || 0) + 1); }
    return m;
  }, [baseRes]);
  const resultados = useMemo(() => (rubro === 'todos' || !hayRubros ? baseRes : baseRes.filter((p) => (p.c || 'Otros') === rubro)), [baseRes, rubro, hayRubros]);

  useEffect(() => setVisibles(PAGINA), [consultaDif, marca, maxPrecio, enTiendas, orden, rubro]);

  const hayFiltros = !!(marca.trim() || maxPrecio || enTiendas.length || orden !== 'nombre');
  const limpiarFiltros = () => { setMarca(''); setMaxPrecio(''); setEnTiendas([]); setOrden('nombre'); };
  const alternarTienda = (id) => setEnTiendas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  // Descuentos del día elegido, por súper (no hace falta elegir medio de pago).
  const diaSel = pagos.dia === 'hoy' ? hoy.getDay() : Number(pagos.dia);
  const hoyPorTienda = useMemo(() => tiendas.map((t) => ({ t, reglas: disponiblesHoy(REGLAS, t.id, { dia: diaSel, canal: pagos.canal, hoy }) })), [tiendas, diaSel, pagos.canal, hoy]);
  const conPromo = hoyPorTienda.filter((x) => x.reglas.length);
  const maxDescuento = useMemo(() => new Map(conPromo.map(({ t, reglas }) => [t.id, Math.max(...reglas.map((r) => (r.tipo === 'porcentaje' ? r.valor : 0)))])), [conPromo]);
  const leidoEl = generadas.generadoEl ? new Date(generadas.generadoEl).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : '';
  const cuandoDescuento = pagos.dia === 'hoy' ? 'hoy' : `los ${NOMBRES_DIA[Number(pagos.dia)]}`;

  const fecha = actualizado ? new Date(actualizado).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : '';
  const buscando = consultaDif.trim() !== '';
  const agrupar = hayRubros && rubro === 'todos' && !buscando;
  const mostrados = resultados.slice(0, visibles);

  // Vista por rubros: los primeros productos de cada uno, como tarjetas con "Ver más".
  const grupos = useMemo(() => {
    if (!agrupar) return [];
    const m = new Map();
    for (const p of baseRes) {
      const c = p.c || 'Otros';
      let g = m.get(c);
      if (!g) { g = []; m.set(c, g); }
      if (g.length < 4) g.push(p);
    }
    return RUBROS.filter((r) => m.has(r)).map((r) => ({ rubro: r, items: m.get(r), total: conteoRubros.get(r) || 0 }));
  }, [agrupar, baseRes, conteoRubros]);

  const tarjeta = 'rounded-3xl border border-borde bg-hoja';
  const sello = (id) => (maxDescuento.get(id) ? <span className="ml-1.5 whitespace-nowrap rounded-md bg-suave px-1.5 py-0.5 text-[0.7rem] font-bold text-suave-texto">hasta {maxDescuento.get(id)}% {pagos.dia === 'hoy' ? 'hoy' : DIAS_CORTO[Number(pagos.dia)]}</span> : null);
  const filaProducto = (p) => {
    const ps = precios(p, tiendas);
    const dif = ps.length > 1 ? ps[ps.length - 1].v - ps[0].v : 0;
    return (
      <li key={p.ean} className="py-3.5">
        <div className="flex items-start gap-3">
          {ps[0] ? <Avatar tienda={ps[0].t} /> : <span className="h-10 w-10 shrink-0 rounded-full bg-panel" />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{p.n}</p>
            <p className="mt-0.5 text-sm text-apagado">{[p.m, p.u].filter(Boolean).join(' · ') || ' '}</p>
          </div>
          {ps[0] ? (
            <div className="shrink-0 text-right">
              <p className="text-lg font-bold leading-tight tabular-nums">{peso(ps[0].v)}</p>
              <p className="text-xs text-apagado">en {ps[0].t.nombre}</p>
            </div>
          ) : <p className="shrink-0 text-sm text-apagado">Sin precio</p>}
        </div>
        {ps.length > 0 && (
          <details className="mt-2 pl-[3.25rem] text-sm">
            <summary className="inline-flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-apagado hover:text-texto">
              <span className="rounded-full bg-panel px-2.5 py-1">{ps.length > 1 ? `Comparar ${ps.length} súpers` : 'Ver detalle'}</span>
              {dif > 0 && <span>hasta {peso(dif)} más en {ps[ps.length - 1].t.nombre}</span>}
              {maxDescuento.get(ps[0].t.id) ? <span className="rounded-md bg-suave px-1.5 py-0.5 font-bold text-suave-texto">{ps[0].t.nombre}: hasta {maxDescuento.get(ps[0].t.id)}% {pagos.dia === 'hoy' ? 'hoy' : DIAS_CORTO[Number(pagos.dia)]}</span> : null}
            </summary>
            <ul className="mt-2 max-w-md divide-y divide-borde">
              {ps.map((x, i) => (
                <li key={x.t.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className={i === 0 ? 'font-bold' : ''}>{x.t.nombre}{sello(x.t.id)}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className={i === 0 ? 'rounded-md bg-sello px-1.5 py-0.5 font-bold text-sello-texto' : ''}>{peso(x.v)}</span>
                    {i > 0 && <span className="ml-2 text-xs text-apagado">+{peso(x.v - ps[0].v)} ({Math.round(((x.v - ps[0].v) / ps[0].v) * 100)}%)</span>}
                  </span>
                </li>
              ))}
              {tiendas.filter((t) => p.p[t.id] == null).length > 0 && (
                <li className="py-2 text-xs text-apagado">Sin precio en: {tiendas.filter((t) => p.p[t.id] == null).map((t) => t.nombre).join(', ')}</li>
              )}
            </ul>
          </details>
        )}
      </li>
    );
  };
  const irA = (v) => { setVista(v); window.scrollTo({ top: 0 }); };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 sm:px-6">
      <header className="sticky top-0 z-20 -mx-4 bg-fondo px-4 pb-3 pt-3 sm:-mx-6 sm:px-6">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Buscar producto</span>
            <Icono n="buscar" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-apagado" />
            <input type="search" value={consulta} onChange={(e) => { setConsulta(e.target.value); if (vista !== 'productos') setVista('productos'); }} placeholder="Buscá un producto"
              className="h-11 w-full rounded-2xl bg-panel pl-11 pr-4 font-semibold placeholder:font-semibold placeholder:text-apagado" />
          </label>
          <button type="button" onClick={() => { setFiltrosAbiertos((v) => !v); if (vista !== 'productos') setVista('productos'); }} aria-expanded={filtrosAbiertos} aria-label={hayFiltros ? 'Filtros (activos)' : 'Filtros'}
            className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sello text-sello-texto">
            <Icono n="filtros" className="h-5 w-5" />
            {hayFiltros && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-fondo bg-primario" />}
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          {zonas && zonas.length > 1 && <Selector compacto etiqueta="Zona" className="w-auto min-w-[9rem] max-w-[15rem]" valor={zonaId} opciones={zonas.map((z) => ({ value: z.id, label: z.nombre }))} onCambio={onZona} />}
          <span className="truncate text-sm text-apagado">{cargandoZona ? 'Cargando…' : `${productos.length.toLocaleString('es-AR')} productos${fecha ? ` · ${fecha}` : ''}`}</span>
          <span className="ml-auto"><BotonTema /></span>
        </div>
      </header>

      <h1 className="sr-only">Comparador de precios y descuentos de supermercados</h1>
      {fuente === 'ejemplo' && (
        <p role="note" className="mb-3 rounded-2xl bg-suave px-4 py-3 text-sm text-suave-texto">
          Estás viendo datos de ejemplo con precios inventados. Para usar los reales, corré <code className="font-bold">npm run datos:sepa</code>.
        </p>
      )}

      {vista === 'productos' && (
        <section aria-label="Productos">
          {filtrosAbiertos && (
            <div className={tarjeta + ' mb-4 grid gap-4 p-4'}>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-semibold">Marca
                  <input list="lista-marcas" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Ej: Arcor, Ilolay…" className={campo} />
                  <datalist id="lista-marcas">{marcas.map((m) => <option key={m} value={m} />)}</datalist>
                </label>
                <label className="block text-sm font-semibold">Precio máximo ($)
                  <input type="number" inputMode="numeric" min="0" step="100" value={maxPrecio} onChange={(e) => setMaxPrecio(e.target.value)} placeholder="Sin tope" className={campo} />
                </label>
                <Selector etiqueta="Ordenar por" valor={orden} opciones={OPCIONES_ORDEN} onCambio={setOrden} />
              </div>
              <fieldset>
                <legend className="text-sm font-semibold">Solo productos con precio en</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tiendas.map((t) => <button key={t.id} type="button" aria-pressed={enTiendas.includes(t.id)} onClick={() => alternarTienda(t.id)} className={chip(enTiendas.includes(t.id))}>{t.nombre}</button>)}
                </div>
              </fieldset>
              {hayFiltros && <div><button type="button" onClick={limpiarFiltros} className="text-sm font-bold underline underline-offset-4 hover:text-alerta">Quitar filtros</button></div>}
            </div>
          )}

          {hayRubros && (
            <nav aria-label="Rubros" className="sin-barra -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ul className="flex gap-2">
                {[['todos', 'Todos', baseRes.length], ...RUBROS.filter((r) => conteoRubros.get(r) || r === rubro).map((r) => [r, r, conteoRubros.get(r) || 0])].map(([id, nombre, n]) => (
                  <li key={id} className="shrink-0">
                    <button type="button" aria-pressed={rubro === id} onClick={() => setRubro(id)}
                      className={'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-bold transition-colors ' + (rubro === id ? 'bg-primario text-primario-texto' : 'border border-borde bg-hoja text-texto hover:border-apagado')}>
                      {nombre} <span className="font-medium opacity-70">{n.toLocaleString('es-AR')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          {agrupar ? (
            <div className="grid gap-4">
              {grupos.map((g) => (
                <section key={g.rubro} className={tarjeta + ' p-3 sm:p-4'}>
                  <header className="flex items-center gap-3 border-b border-borde pb-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-panel"><Icono n={g.rubro} className="h-5 w-5" /></span>
                    <h2 className="text-sm font-semibold uppercase tracking-wide">{g.rubro}</h2>
                    <span className="ml-auto rounded-full bg-panel px-2.5 py-0.5 text-sm font-bold tabular-nums">{g.total.toLocaleString('es-AR')}</span>
                  </header>
                  <ul className="divide-y divide-borde">{g.items.map(filaProducto)}</ul>
                  {g.total > g.items.length && (
                    <button type="button" onClick={() => { setRubro(g.rubro); window.scrollTo({ top: 0 }); }} className="mt-1 flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-suave font-bold text-suave-texto transition-opacity hover:opacity-85">
                      Ver más {g.rubro}
                    </button>
                  )}
                </section>
              ))}
              {!grupos.length && <p className={tarjeta + ' p-6 text-apagado'}>Ningún producto coincide con los filtros. Probá con menos filtros.</p>}
            </div>
          ) : (
            <section className={tarjeta + ' p-3 sm:p-4'}>
              <header className="flex items-center gap-3 border-b border-borde pb-3">
                <h2 className="min-w-0 truncate text-sm font-semibold uppercase tracking-wide">{rubro !== 'todos' ? rubro : buscando ? `Resultados para «${consulta}»` : 'Productos'}</h2>
                <span className="ml-auto rounded-full bg-panel px-2.5 py-0.5 text-sm font-bold tabular-nums" aria-live="polite">{resultados.length.toLocaleString('es-AR')}</span>
              </header>
              <ul className="divide-y divide-borde">{mostrados.map(filaProducto)}</ul>
              {!resultados.length && <p className="px-1 py-8 text-apagado">Ningún producto coincide con la búsqueda y los filtros. Probá con otra palabra o con menos filtros.</p>}
              {resultados.length > mostrados.length && (
                <button type="button" onClick={() => setVisibles((v) => v + PAGINA)} className="mt-1 flex h-11 w-full items-center justify-center rounded-2xl bg-suave font-bold text-suave-texto transition-opacity hover:opacity-85">
                  Mostrar {Math.min(PAGINA, resultados.length - mostrados.length)} más
                </button>
              )}
            </section>
          )}
        </section>
      )}

      {vista === 'descuentos' && (
        <section aria-label="Descuentos" className="grid gap-4">
          <div className={tarjeta + ' p-4'}>
            <h2 className="titulo text-xl">Descuentos de {cuandoDescuento}</h2>
            <p className="mt-1 text-sm text-apagado">Con bancos, billeteras y tarjetas: qué súper, con qué medio de pago, mínimo y tope.</p>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Selector etiqueta="Día de la compra" className="w-44" valor={pagos.dia}
                opciones={[{ value: 'hoy', label: `Hoy (${NOMBRES_DIA[hoy.getDay()]})` }, ...NOMBRES_DIA.map((n, i) => ({ value: String(i), label: mayus(n) }))]}
                onCambio={(v) => setPagos((p) => ({ ...p, dia: v }))} />
              <div role="group" aria-label="Canal" className="inline-flex h-11 rounded-2xl bg-panel p-1">
                {[['online', 'Online'], ['presencial', 'Presencial']].map(([id, t]) => (
                  <button key={id} type="button" aria-pressed={pagos.canal === id} onClick={() => setPagos((p) => ({ ...p, canal: id }))}
                    className={'rounded-xl px-4 text-sm font-bold transition-colors ' + (pagos.canal === id ? 'bg-primario text-primario-texto' : 'text-apagado hover:text-texto')}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          {conPromo.map(({ t, reglas }) => (
            <section key={t.id} className={tarjeta + ' p-3 sm:p-4'}>
              <header className="flex items-center gap-3 border-b border-borde pb-3">
                <Avatar tienda={t} />
                <h3 className="text-sm font-semibold uppercase tracking-wide">{t.nombre}</h3>
                <span className="ml-auto rounded-full bg-panel px-2.5 py-0.5 text-sm font-bold tabular-nums">{reglas.length}</span>
              </header>
              <ul className="divide-y divide-borde">{reglas.map((r) => <FilaDescuento key={r.id} r={r} hoy={hoy} />)}</ul>
            </section>
          ))}
          {!conPromo.length && <p className={tarjeta + ' p-6 text-apagado'}>No hay descuentos leídos para ese día y canal.</p>}
          <p className="px-1 text-xs text-apagado">
            {leidoEl && `Leídos de las webs de Coto y Día el ${leidoEl}. `}Aplican condiciones y exclusiones: confirmalos en el súper antes de pagar.
            {hoyPorTienda.some((x) => !x.reglas.length) && ` Sin datos: ${hoyPorTienda.filter((x) => !x.reglas.length).map((x) => x.t.nombre).join(', ')} (publican sus promos como imágenes).`}
          </p>
        </section>
      )}

      <footer className="mt-8 px-1 text-xs text-apagado">
        {fuente === 'sepa' && `Precios de lista de Precios Claros (SEPA) en ${zona}. Son la mediana de las sucursales de la zona.`}
        {fuente === 'online' && 'Precios publicados en las tiendas online. Pueden diferir de los de góndola e incluir descuentos de la web.'}
      </footer>

      <div className="caja pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
        <nav aria-label="Secciones" className="pointer-events-auto flex gap-1 rounded-full border border-borde bg-hoja/35 p-1.5 shadow-xl shadow-black/15 backdrop-blur-md">
          {[['productos', 'Precios', 'buscar'], ['descuentos', 'Descuentos', 'descuento']].map(([id, nombre, ic]) => (
            <button key={id} type="button" aria-current={vista === id ? 'page' : undefined} onClick={() => irA(id)}
              className={'flex h-12 min-w-[6.5rem] flex-col items-center justify-center rounded-full px-5 text-[0.65rem] font-bold uppercase tracking-wide transition-colors ' + (vista === id ? 'bg-sello text-sello-texto' : 'text-apagado hover:text-texto')}>
              <Icono n={ic} className="h-5 w-5" />
              {nombre}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

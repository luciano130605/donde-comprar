# Comparador de Súper

Compara el precio de una lista de compras entre Coto, Día, Jumbo, Carrefour y Disco.
Astro + React + Tailwind. Sin IA ni servicios externos: los precios salen de la base abierta **Precios Claros (SEPA)** del gobierno.

## Qué hace la app

Es solo para **comparar precios y ver descuentos** (no hay carrito ni lista de compras): buscás un producto, ves en qué súper está más barato y cuánto más caro sale en los demás, filtrás por rubro, marca, precio o súper, y en «Descuentos» ves los de cada día. Los íconos son de [Hugeicons](https://hugeicons.com) (`@hugeicons/react` + `@hugeicons/core-free-icons`).

### Logos de los supermercados

Copiá los logos a `public/logos/` con el id del súper como nombre (`coto.png`, `dia.png`, `jumbo.svg`, `carrefour.webp`, …; ver `public/logos/LEEME.txt`). Se leen al compilar (`npm run dev` o `npm run build`): no hay que tocar código. Si falta alguno, se muestran las iniciales del súper.

## Probar ya mismo (datos de ejemplo, precios inventados)

```bash
npm install
npm run datos:ejemplo
npm run dev
```

## Usar precios reales por zona (Precios Claros, SEPA)

La web tiene un **selector de zona** (por defecto CABA y Buenos Aires). Cada zona sale de la base oficial **Precios Claros - SEPA**, que informa el precio de lista de cada sucursal; el precio de una cadena en una zona es la mediana de sus sucursales de esa zona.

```bash
npm run datos:sepa              # baja el zip de hoy (~330 MB), lo procesa y deja public/precios/<zona>.json
npm run datos:sepa -- --dia miércoles   # otro día de la semana
npm run dev
```

- Usa `unzip` si existe y, si no (Windows), el `tar` de Windows 10/11, que sabe leer zips. Los paquetes de cada comercio se leen en streaming, sin extraerlos a disco.
- Los paquetes que el Estado publica dañados o vacíos (pasa con alguno de los grandes) se **omiten y se avisan**.
- Si ya descomprimiste el zip a mano: `npm run datos -- ./sepa-datos [--zona caba] [--list-banderas]`.
- `public/zonas.json` es el índice que arma el selector. Se regenera solo; también incluye «Tiendas online (todo el país)» si corriste `npm run datos:online`.

### Configuración (`config/stores.json`)

- `zonas`: lista de `{ id, nombre, provincia, localidad }`. `provincia` es el código ISO (`AR-C` = CABA, `AR-B` = Buenos Aires, `AR-X` = Córdoba, `AR-S` = Santa Fe, `AR-M` = Mendoza). `localidad` es una regex opcional. **Para sumar una zona basta agregar una línea** y volver a correr `npm run datos:sepa`.
- `banderas`: cada cadena con un `patron` (regex) que se prueba contra el nombre de bandera **y** la razón social (Carrefour reporta Express, Market y Maxi bajo la razón social «INC S.A.»). Si una cadena no aparece: `npm run datos -- ./.cache/sepa-ext --list-banderas`.
- `minBanderas`: un producto entra si tiene precio en al menos esta cantidad de cadenas de la zona.

### Qué cadenas hay y cuáles no

- **En SEPA (hoy, CABA y Buenos Aires):** Coto, Carrefour, Día, Changomás, Toledo, Cooperativa Obrera, Unicoop y La Anónima.
- **Jumbo, Disco y Vea** no figuran en SEPA: el paquete del grupo viene vacío (0 bytes) en el origen. Están en la opción «Tiendas online».
- **Vital** no figura en SEPA, y su tienda online exige iniciar sesión (su sitio público solo publica folletos en PDF). Por eso no se puede incluir sin credenciales ni OCR.
- SEPA no informa categorías: el rubro (Almacén, Bebidas, Limpieza…) se deduce del nombre del producto.

## Alternativa: scrapear las tiendas online (catálogo completo)

Trae **todo el catálogo** publicado por Coto, Día, Jumbo, Carrefour, Disco, Vea, Changomás, Cordiez y Josimar y arma `public/precios/online.json` (la opción «Tiendas online (todo el país)» del selector). Esos precios son nacionales: las tiendas online no cambian el precio por provincia con las APIs que usa este proyecto (se probó CABA contra Córdoba):

```bash
npm run datos:online
# opciones: -- --solo jumbo,dia --min 3 --reanudar --forzar
```

- Las cadenas VTEX (todas menos Coto) se recorren por el árbol de categorías (`/api/catalog_system/pub/category/tree/5` y `/api/catalog_system/pub/products/search?fq=C:<ruta>`), de a 50 productos. Coto se pagina completo con `/sitios/cdigi/browse?Ntt=&Nrpp=100&No=<offset>&format=json`.
- Cada tienda corre en paralelo con las demás, pero con un solo pedido a la vez por tienda y una pausa de 250 ms. Una corrida completa tarda unos 30–60 minutos.
- Cada producto lleva un `rubro` (c): sale de las categorías que publica cada tienda, con votación entre tiendas (`scripts/rubros.mjs`).
- Los productos se cruzan por código de barras (EAN) y entran si tienen precio en al menos `--min` tiendas (por defecto 2).
- Lo que baja cada tienda se guarda en `.cache/<tienda>.json`; con `--reanudar` se reusa esa caché en vez de volver a pedir.
- Se usa el precio de venta de la web, que puede incluir descuentos y diferir del de góndola.
- Si vuelven menos de 200 productos (por ejemplo, porque un sitio te bloqueó), no guarda nada y termina con error, para no pisar los precios anteriores. `--forzar` lo saltea.
- **Vital** no está: su sitio no expone la API estándar, e Hiperlibertad/La Anónima bloquean pedidos automáticos.
- `npm test` corre las pruebas de los parsers y de la calculadora de promos.

## Promos de bancos, billeteras y tarjetas

La web **no te pide cómo pagás**: el panel «Descuentos de hoy» lista, súper por súper, los descuentos que valen para el día y el canal (online o presencial) elegidos, con su **porcentaje, medio de pago, mínimo de compra y tope**. En la lista de precios, cada producto indica además si su súper más barato tiene un descuento hoy.

Se muestran las promos de `config/promos.json` (sin las marcadas como ejemplo) más las leídas automáticamente de Coto y Día (`config/promos.generated.json`), que figuran como «leídas de la web, sin verificar». Las promos de ejemplo del `promos.json` no se usan en pantalla.

### `config/promos.json`

Tiene dos listas: `medios` (los que aparecen como botones: `{ id, nombre }`) y `reglas` (una por promo):

```jsonc
{
  "id": "coto-debito-ejemplo",
  "tienda": "coto",              // id de tienda: coto, dia, jumbo, carrefour, disco, ...
  "medioPago": "debito",         // id de la lista "medios"
  "tipo": "porcentaje",          // "porcentaje" | "monto"
  "valor": 30,                   // % o pesos. null = sin confirmar: la regla no se aplica
  "tope": null,                  // máximo de descuento en pesos (null = sin tope conocido)
  "topePeriodo": null,           // "transaccion" | "semana" | "mes" | null
  "minimo": null,                // compra mínima en pesos (null = sin mínimo conocido)
  "dias": null,                  // [0..6] con 0=domingo ... 6=sábado; null = sin restricción conocida
  "canal": "ambos",              // "online" | "presencial" | "ambos"
  "acumulable": false,           // true = se puede sumar con otras acumulables
  "vigenteDesde": null,          // "AAAA-MM-DD" o null
  "vigenteHasta": null,          // "AAAA-MM-DD" (inclusive) o null
  "fuente": "https://...",       // de dónde sale el dato
  "verificadaEl": null,          // "AAAA-MM-DD" cuando una persona lo confirmó en la fuente
  "estado": "ejemplo, verificar",// opcional: si contiene "ejemplo", se etiqueta como ejemplo
  "aVerificar": ["valor"],       // opcional: campos que todavía no se confirmaron
  "origen": "coto-445"           // opcional: id de la regla generada por el scraper de la que viene
}
```

Para agregar una promo: sumá el medio de pago a `medios` si no existe y copiá una regla. **No inventes valores**: si un dato no figura en la fuente, dejalo en `null` y anotalo en `aVerificar`. Cuando lo confirmes en la web de la cadena, completá `verificadaEl` con la fecha de ese día.

Las promos **no se suman** salvo que las dos tengan `acumulable: true`; en ese caso se aplican una tras otra sobre el saldo y se usa la suma si supera a la mejor promo individual. Si el tope es semanal o mensual, la web lo aplica asumiendo que no usaste nada antes y lo avisa con un asterisco.

### Etiquetas en pantalla

Las promos aprobadas a mano (`promos.json`) muestran una etiqueta cuando están **vencidas**, **aún no vigentes**, **sin verificar** o verificadas **hace más de 30 días**. Las vencidas no se muestran como disponibles hoy.

Los porcentajes, mínimos y topes leídos de la web pueden tener condiciones y exclusiones: confirmalos en el súper antes de pagar.

### Leer promos automáticamente (Coto y Día)

```bash
npm run promos:scrape    # escribe config/promos.generated.json (todas con revisar:true)
npm run promos:revisar   # compara contra promos.json y muestra nuevas, cambiadas y desaparecidas
```

- **Coto** publica un JSON público (`/rest/model/atg/actors/cProfileActor/getPromocionesMulticanal`): se leen solo los descuentos en %, no las cuotas sin interés. El tope y su período salen del texto de la observación; el banco solo viene como número, así que `medioPago` queda en `null`.
- **Día** publica las tarjetas como datos dentro del HTML de `/medios-de-pago-y-promociones`: se leen días, canal, banco, porcentaje, tope, mínimo y vigencia **del texto legal**. Si el texto menciona varios porcentajes o topes, no se elige ninguno y queda anotado en `notas`.
- **Jumbo, Disco y Carrefour** publican imágenes (Carrefour solo un cartel de texto que cambia por día): no se scrapean. Esas reglas se cargan a mano.
- El scraper **nunca modifica `promos.json`**. Para aprobar una promo nueva: copiala de `promos.generated.json` a `promos.json`, quitale `revisar`, completá `medioPago` con un id de `medios`, confirmá cada campo de `aVerificar` en la web de la cadena, poné `verificadaEl` y dejá `origen` con el id generado. A partir de ahí `promos:revisar` te avisa si la fuente cambia algo o deja de publicarla.
- Si una fuente falla o cambia de formato, el scraper conserva lo que había de esa tienda en vez de borrarlo.

### Dónde está la lógica

`src/lib/promos.js` es una calculadora pura (sin red ni fecha implícita) con pruebas en `test/promos.test.mjs`. Devuelve `{ total, ahorro, promoAplicada, motivoSiNoAplica }`.

## Cómo se calcula el precio (modo SEPA)

Mediana del `productos_precio_lista` entre las sucursales de la zona, por supermercado. No incluye promociones (dependen de tarjeta, día y stock). Solo se usan productos con EAN real (`productos_ean = 1`), para poder compararlos entre cadenas.

## Notas

- El formato de los CSV sigue la disposición 55/2016 (separador `|`, UTF-8). Si el gobierno cambió columnas, el script lee por nombre de columna y avisa cuántas filas descartó.
- Los datos de ejemplo se generan con `scripts/make-sample.mjs` y respetan el formato SEPA, pero los precios son inventados.

## Actualización diaria automática

`.github/workflows/actualizar-precios.yml` corre el scraper todos los días a las 8:17 (hora Argentina) en GitHub Actions y, si hay precios nuevos, hace un commit con `public/precios/` y `public/zonas.json`. La web los muestra con la fecha de la última actualización.

1. Subí el proyecto a un repo de GitHub.
2. Conectá el repo a Vercel (o Netlify): cada commit del bot dispara un deploy nuevo.
3. Para probarlo sin esperar, entrá a la pestaña **Actions → Actualizar precios → Run workflow**.

Si el scraper falla ese día, el sitio sigue mostrando los precios del día anterior. GitHub puede demorar el horario unos minutos y desactiva los workflows programados si el repo no tiene actividad por 60 días.

// Normaliza las categorías de cada tienda a un conjunto común de rubros para los separadores de la web.
export const RUBROS = ['Almacén', 'Bebidas', 'Lácteos y frescos', 'Carnes y pescados', 'Frutas y verduras', 'Congelados', 'Limpieza', 'Perfumería e higiene', 'Bebés y niños', 'Mascotas', 'Hogar y electro', 'Otros'];

const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// El orden importa: lo más específico primero. Los nombres de SEPA vienen abreviados (ACOND, LIQ, DET, YOG…).
const REGLAS = [
  ['Mascotas', /mascota|perro|gato|\bpet shop\b|alimento balanceado|\bdog\b|\bcat\b|pedigree|whiskas|purina|royal canin|eukanuba|\bpiedras? sanitarias?\b|\bgatos?\b/],
  ['Bebés y niños', /\bbebes?\b|\bbaby\b|pañal|panal|\bninos?\b|infantil|maternal|mamadera|toallitas humedas|pampers|huggies/],
  ['Congelados', /congelad|helado|\bfreezer\b|nugget|\bpizza|empanada|\bfrigor\b|\bgrido\b|rebozad|bastoncitos/],
  ['Carnes y pescados', /carne|carniceria|pescad|marisco|pollo|\bcerdo\b|vacuna|achura|hamburguesa|milanesa|\bbife|chorizo|asado|\blomo|\bnalga|cuadril|vacio|pechuga|suprema|salchicha|\bcostilla|matambre|\bpeceto|merluza|salmon|chinchulin|morcilla/],
  ['Frutas y verduras', /fruta|verdura|verduleria|hortaliza|\bmanzana|\bbanana|\bnaranja|\blimon|\btomate fresco|\bpapa\b|\bcebolla|zanahoria|lechuga|zapallo|\bpera\b|mandarina|\bpalta|\bajo\b|morron|batata|\buva\b|frutilla|durazno|\bsandia|\bmelon|espinaca|acelga|zucchini|berenjena|choclo fresco/],
  ['Perfumería e higiene', /perfumeria|higiene|cuidado personal|cuidado del cabello|cuidado de la piel|farmacia|cosmetic|belleza|salud|shampoo|\bsh\b|champu|acond|enjuague|desodorante|\bdesod|antitranspirante|\bantitransp|dental|bucal|\bcolgate|oral ?b|cepillo dent|pasta dent|afeitad|\bafeitar|prestobarba|gillette|protector solar|\bsolar\b|bronceador|maquillaje|papel higienico|jabon de tocador|\btocador|jabon liquido manos|toalla|\btoa\b|ladysoft|\bmodess|\bnosotras|tampon|\bnivea|\bdove\b|\bsedal|pantene|elvive|garnier|plusbelle|rexona|ponds|l'?oreal|nutrisse|colora|coloracion|tintura|serum|crema (corporal|facial|de manos|para peinar|dental)|\bcr (colgate|nivea|dove)|hisopo|algodon|preservativo|\btampones|\bjab\.liqui|p\/mano|para manos|body splash|espuma de bano|quitaesmalte|esmalte|labial|perfume|colonia|crema enjuague|\bdepilat|\bpeine|\bcepillo de pelo|rimel|mascara de pestanas/],
  ['Limpieza', /limpieza|lavandina|detergente|\bdet\b|\bdet\.|desinfect|insecticida|\braid\b|suavizante|lavavajilla|lavaropa|jabon en polvo|jabon liquido|\bjabon\b|bolsas? de residuo|\bbolsa\b|trapo|esponja|\blimp\b|\blimpia|limpiador|\bliquido\b|\bliq\b|\bliq\.|multiuso|aromatizador|ambientador|sahumerio|\bglade\b|poett|brillo|escobillon|\bpano\b|quitamanchas|desengras|\bcera\b|revigal|procenex|\bzorro\b|ayudin|\bcif\b|musculo|\bvim\b|\bskip\b|ariel|\bdrive\b|\bodex\b|lysoform|\bblem\b|veritas|lustra|abrillant|rollo de cocina|\bsolvex|\blav\b|\blavam|\bjab\b|othrina|mosquito|\bzapi\b|\bfuyi\b|microfibra|micro fibra|\bpaño|\bpanos\b|trapo de piso|secador|\bbalde\b|\bpala\b|\bcepillo (de )?(piso|ropa|inodoro)/],
  ['Almacén', /alfajor|baño de chocolate|bano de chocolate|\bsnacks?\b|galletit|golosina|caramelo|\bchocolate|\bchoco\b|\bmantecol|\bturron|\bbombon|\bchupet|\bchicle|\bpastilla/],
  ['Lácteos y frescos', /lacteo|queso|fiambre|yogur|\byog\b|yogurt|manteca|crema|\bleche|huevo|fresco|rotiser|pastas frescas|embutido|dulce de leche|postre|\bjamon|\bsalame|mortadela|parmesan|\bricota|muzzarella|mozzarella|\bdanbo|\bcremoso|\bsancor|\bla serenisima|\bmilkaut|\bilolay|\bcasancrem|\btregar\b|\bflan\b|hummus|\bpan lacteado|\bprepizza|bondiola|\bpate\b|\bleberwurst|\bsalchichon|\bpanceta|\bjamon crudo|\bpaleta cocida/],
  ['Bebidas', /bebida|\bagua|aguas|gaseosa|cerveza|\bvino|bodega|licor|\bjugo|aperitivo|sidra|champagne|espumante|\bsoda|fernet|whisky|energizante|isotonic|destilado|vodka|\bmalbec|cabernet|\bgin\b|\bron\b|\btinto\b|\bblanco\b.*(vino|750)|\bpomelo|cinzano|\bbranca|\bcampari|\bcoca ?cola|\bpepsi|\bsprite|\bfanta|\bquilmes|\bbrahma|\bstella|moscato|\bsyrah|merlot|torrontes|\bchardonnay|sauvignon|\bpinot|\bblend\b|\bamargo|\bgrappa|\bhesperidina|\bsmirnoff|absolut|\bchivas|\bjack daniel/],
  ['Almacén', /almacen|despensa|desayuno|merienda|conserva|snack|golosina|kiosco|galletit|\bgall\b|\bgall\.|aceite|\barroz|fideo|\bfid\b|harina|azucar|\bdulces?\b|\bcafe|\bte\b|yerba|infusion|condimento|especias|salsa|sopa|panaderia|panificado|cereal|enlatado|alfajor|chocolate|\bchoco|\bchoc\b|pastas|legumbre|aderezo|mermelada|reposteria|\bsal\b|marca propia|alimento|comida|vinagre|\bavena|\bmani\b|papas fritas|aceituna|mayonesa|\bpan\b|\bporotos|lenteja|garbanzo|semilla|caramelo|\bmiel|\batun|caballa|arveja|\bpure\b|extracto|\btorta|budin|bizcocho|tostada|\bbarra|confite|gelatina|\bpolvo para (hornear|flan|postres?)|\bsalad|\bcheddar|\bsmams|\bpochoclo|\bgalletas?\b|\bnesquik|\bcacao|\bmate cocido|\bmani\b|\bfrutos secos|\bpasas|\bmaizena|\bpolenta|\bsemola|\bketchup|\bmostaza|\bsalsa|\bpuré|\btomate|\bchoclo|\bduraznos? en|\bcereal|\bgranola|\baceto|balsamico|\bsoja\b|\btofu|\bpasta de mani|\bdulce de batata|\bmembrillo|\bsucralosa|\bedulcorante|\bstevia|\bleudante|\bbicarbonato|\bcolorante|\bvainilla|\bessencia|\bgrasa|\bmargarina|\bpan rallado|\brebozador|\bpizzeta/],
  ['Hogar y electro', /hogar|bazar|electro|textil|jardin|ferreter|tecnolog|deporte|jugueter|indumentaria|automotor|libreria|colchon|mueble|aire libre|pileta|fiesta|celular|\bcel\b|computa|\btv\b|televisor|\bled\b|parlante|auricular|lampara|\bpila\b|\bpilas\b|bateria|heladera|lavarropa|microondas|ventilador|\bnotebook|aire acondicionado|\bcocina\b|\banafe|iluminacion|herramienta|camping|mochila|vestimenta|calzado|ropa|pantalon|remera|zapatill|musculosa|traje de bano|bikini|buzo|calza|\bjeans?\b|\bshort|bodies|vestido|campera|medias|figura|set de juego|plastico|libro|\blb\b|globo|marcador|cuaderno|lapiz|boligrafo|sticker|\bbotella|\bvaso|hermetico|tupper|\bolla\b|sarten|aluminio|roluminio|\bfilm\b|\bjuego|escolar|\btapa\b|cable|\bcargador|ficha|alargue|\bbolsa de compras|adhesivo|suprabond|pegamento|manguera|\bconector|tornillo|destornillador|\bcinta\b|tijera|candado|pintura|\bpincel|\brodillo|\bsoga|\bcadena\b|\bregador|\bmaceta|\btierra\b|fertilizante|\bcarpa\b|\bhamaca|\bpelota|\bbarbijo/],
];

// textos: nombres de categoría (raíz y subcategorías) tal como los publica la tienda.
export function rubroDe(...textos) {
  const t = sinAcentos(textos.filter(Boolean).join(' '));
  for (const [rubro, re] of REGLAS) if (re.test(t)) return rubro;
  return 'Otros';
}

// Rubro de un producto: cada tienda vota con su categoría (o, si no tiene, con el nombre del producto);
// gana el rubro más votado que no sea "Otros". En empate, el que aparece antes en RUBROS.
export function rubroProducto(votos, nombre) {
  const cuenta = new Map();
  // Sin categorías de ninguna tienda (por ejemplo, datos SEPA) se clasifica por el nombre del producto.
  for (const cat of votos.length ? votos : ['']) {
    let r = rubroDe(cat);
    if (r === 'Otros') r = rubroDe(nombre);
    if (r !== 'Otros') cuenta.set(r, (cuenta.get(r) || 0) + 1);
  }
  if (!cuenta.size) return 'Otros';
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || RUBROS.indexOf(a[0]) - RUBROS.indexOf(b[0]))[0][0];
}

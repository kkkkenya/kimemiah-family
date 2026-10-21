// Turns a raw supermarket product (title + prices) into a normalized catalog row:
// brand, pack size, price per kg / litre / unit, and the household concept it belongs to.
// Deterministic and dependency-free so it can be unit tested.

// ---------------------------------------------------------------- blocklist

const BLOCKED_TITLE =
  /\b(tv|television|fridge|refrigerator|freezer|microwave|blender|kettle|subwoofer|soundbar|smartphone|laptop|iron box|washing machine|cooker|oven|toaster|air fryer|water dispenser|home theatre|speaker|headphones?|earphones?|power bank|phone|tablet|vacuum cleaner|mattress|sofa|bicycle|motor oil|drill)\b/i;

const BLOCKED_CATEGORY =
  /(electronic|television|tv|audio|sound|appliance|fridge|freezer|cooker|washer|washing-machine|dryer|phone|tablet|laptop|computer|furniture|mattress|car-care|motor|hardware|power-tool|tools|toys|luggage|apparel|footwear|clothing|textile|bicycle|cycles|sports)/i;

export function isBlocked(title, breadcrumb = "") {
  return BLOCKED_TITLE.test(title) || (breadcrumb ? BLOCKED_CATEGORY.test(breadcrumb) : false);
}

// ---------------------------------------------------------------- prices

export function parsePrice(text) {
  if (!text) return null;
  const m = String(text).replace(/ /g, " ").match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------- pack size

const WEIGHT = { kg: 1, kgs: 1, g: 0.001, gm: 0.001, gms: 0.001, gr: 0.001 };
const VOLUME = { l: 1, lt: 1, ltr: 1, ltrs: 1, litre: 1, litres: 1, liter: 1, liters: 1, ml: 0.001, cl: 0.01 };
const COUNT = /^(pcs|pc|pieces|piece|pk|pack|packs|rolls|roll|sheets|eggs|bags|tabs|tablets)$/;

const UNIT_RE = "(kgs|kg|gms|gm|gr|g|litres|litre|liters|liter|ltrs|ltr|lt|l|ml|cl|pcs|pc|pieces|piece|pk|packs|pack|rolls|roll|sheets|eggs|bags)";

function toBase(n, unit) {
  const u = unit.toLowerCase();
  if (u in WEIGHT) return { qty: n * WEIGHT[u], unit: "kg" };
  if (u in VOLUME) return { qty: n * VOLUME[u], unit: "liter" };
  if (COUNT.test(u)) return { qty: n, unit: "unit" };
  return null;
}

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

function label(qty, unit, count = 1) {
  if (unit === "unit") return `${qty}pk`;
  const per = qty / count;
  const one =
    unit === "kg" ? (per < 1 ? `${round(per * 1000, 0)}g` : `${round(per)}kg`) : per < 1 ? `${round(per * 1000, 0)}ml` : `${round(per)}l`;
  return count > 1 ? `${count}x${one}` : one;
}

export function parseSize(title) {
  const t = title.replace(/ /g, " ");

  // "6 X 500Ml" / "6x500ml"
  let m = t.match(new RegExp(`(\\d+)\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}(?![a-z])`, "i"));
  if (m) {
    const base = toBase(Number(m[2]), m[3]);
    if (base) return { qty: round(base.qty * Number(m[1])), unit: base.unit, label: label(base.qty * Number(m[1]), base.unit, Number(m[1])) };
  }
  // "500ml x 12"
  m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}\\s*[x×]\\s*(\\d+)(?![a-z])`, "i"));
  if (m) {
    const base = toBase(Number(m[1]), m[2]);
    if (base) return { qty: round(base.qty * Number(m[3])), unit: base.unit, label: label(base.qty * Number(m[3]), base.unit, Number(m[3])) };
  }
  // Rolls and packs beat sheets: "100 Sheets (10 Pack)" is 10, "40 Sheets Single Pack" is 1.
  m = t.match(/(\d+)\s*(pack|packs|pk|rolls?|pieces|pcs|pc)(?![a-z])/i);
  if (m && /sheets?/i.test(t)) return { qty: Number(m[1]), unit: "unit", label: `${Number(m[1])}pk` };
  if (/\bsingle\s+(pack|roll)\b/i.test(t)) return { qty: 1, unit: "unit", label: "1pk" };
  // "Tray Of 30", "Pack Of 10"
  m = t.match(/\b(?:tray|pack|box)\s+of\s+(\d+)/i);
  if (m) return { qty: Number(m[1]), unit: "unit", label: `${Number(m[1])}pk` };
  // "2Kg", "5 Kg", "Oil(Pet)1000Ml", "200Ml/250Ml" (first one wins)
  m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}(?![a-z])`, "i"));
  if (m) {
    const base = toBase(Number(m[1]), m[2]);
    if (base) return { qty: round(base.qty), unit: base.unit, label: label(base.qty, base.unit) };
  }
  return null;
}

// ---------------------------------------------------------------- concepts

// Order matters: specific look-alikes come before the general rule.
const CONCEPTS = [
  ["olive-oil", /\bolive\b.*\boil\b|\boil\b.*\bolive\b/i],
  ["coconut-oil", /\bcoconut\b.*\boil\b/i],
  ["cooking-fat", /\b(cooking|vegetable|veg)?\s*fat\b|\bkimbo\b|\bkasuku\b|\bcowboy\b/i],
  ["cooking-oil", /\b(cooking|vegetable|veg|sunflower|corn|seed|canola|soya)\b.*\boil\b|\b(fresh fri|golden fry|rina|salit|top fry|elianto)\b.*\boil\b/i],
  ["maize-flour", /\bmaize\b.*\b(meal|flour)\b|\bunga wa mahindi\b|\bsifted maize\b/i],
  ["wheat-flour", /\b(home baking|all purpose|wheat|chapati|baking)\s+flour\b|\batta\b/i],
  ["rice", /\b(pishori|basmati|biryani|jasmine|sindano)?\s*rice\b(?!.*\b(cake|cracker|noodle)s?\b)/i],
  ["sugar", /\bsugar\b(?!.*\bfree\b)/i],
  ["salt", /\b(table|iodi[sz]ed|cooking|sea)?\s*salt\b(?!.*\b(salted|crisps)\b)/i],
  ["spaghetti", /\b(spaghetti|macaroni|pasta|noodles)\b/i],
  ["stock-cubes", /\b(royco|stock cubes?|mchuzi mix|knorr cubes?)\b/i],
  ["spices", /\b(pilau masala|curry powder|garam masala|tikka masala|spices?|seasoning)\b/i],
  ["tomato-paste", /\btomato (paste|puree)\b/i],
  ["green-grams", /\b(green grams|ndengu|mung beans)\b/i],
  ["beans", /\b(beans|rosecoco|nyayo)\b(?!.*\b(baked|coffee)\b)/i],
  ["milk", /\b(fresh|uht|long life|full cream|whole|low fat|skimmed|lala|mala)\s+milk\b|\bmilk\s+(uht|fresh|long life)\b|\b(brookside|tuzo|ilara|kcc|daima|fresha|delamere|molo|lato)\b(?!.*\b(chocolate|flavou?red|yogh?urt|butter|ghee|powder)\b).*\bmilk\b/i],
  ["bread", /\bbread\b(?!.*\bcrumbs?\b)/i],
  ["eggs", /\beggs?\b/i],
  ["tea-leaves", /\btea\s+(leaves|bags|dust)\b|\b(ketepa|kericho gold|majani|fahari ya kenya)\b|\bchai\b/i],
  ["coffee", /\bcoffee\b|\bnescafe\b/i],
  ["margarine", /\b(margarine|blue band|prestige|spread)\b/i],
  ["washing-powder", /\b(washing|detergent|laundry)\s+(powder|liquid)\b|\b(omo|ariel|toss|persil|sunlight)\b.*\b(powder|liquid)\b/i],
  ["bar-soap", /\b(bar soap|multipurpose soap|multi purpose soap|laundry bar)\b|\b(jamaa|ushindi|white wash|menengai|sunlight)\b.*\bbar\b/i],
  ["bathing-soap", /\b(bathing|beauty|toilet|antibacterial|herbal)\s+soap\b|\b(protex|geisha|imperial leather|lifebuoy)\b/i],
  ["dish-liquid", /\bdish(washing)?\s*(liquid|paste|soap)\b|\b(morning fresh|axion)\b/i],
  ["bleach", /\b(bleach|jik)\b/i],
  ["floor-cleaner", /\b(floor cleaner|multi[- ]?surface|multipurpose cleaner|disinfectant)\b/i],
  ["toilet-cleaner", /\btoilet cleaner\b|\bharpic\b/i],
  ["facial-tissue", /\b(facial|pocket)\s+tissues?\b/i],
  ["toilet-tissue", /\btoilet (tissue|paper|roll)s?\b|\btissue rolls?\b|\b(toilex|velvex|rosy|nice & soft|hanan|poshy|petals|bella|cosy)\b.*\b(tissue|rolls?)\b/i],
  ["serviettes", /\bserviettes?\b|\bnapkins?\b/i],
  ["toothpaste", /\btoothpaste\b|\b(colgate|sensodyne|close up|aquafresh)\b(?!.*\bbrush\b)/i],
  ["petroleum-jelly", /\bpetroleum jelly\b|\bvaseline\b(?!.*\blotion\b)/i],
  ["body-lotion", /\b(body )?lotion\b/i],
  ["sanitary-pads", /\b(sanitary|pads|always|kotex)\b/i],
  ["bin-liners", /\b(bin liners?|garbage bags?|bin bags?|refuse bags?)\b/i],
  ["steel-wool", /\b(steel wool|scourer|sponge)\b/i],
  ["matches", /\bmatch(es|box)\b/i],
  ["insecticide", /\b(insecticide|doom|raid|mortein|baygon)\b/i],
  ["stout", /\bstout\b|\bguinness\b/i],
  ["cider", /\bcider\b|\b(savanna|hunter'?s)\b/i],
  ["lager-beer", /\b(lager|beer|pilsner)\b|\b(tusker|white cap|balozi|summit|heineken|snapp)\b/i],
  ["whisky", /\bwhisk(e)?y\b|\b(jameson|johnnie walker|grant's|jack daniel'?s|vat 69|best whisky)\b/i],
  ["gin", /\bgin\b|\b(gilbey'?s|gordon'?s|kenya cane citrus)\b/i],
  ["vodka", /\bvodka\b|\bsmirnoff\b/i],
  ["rum", /\brum\b|\bcaptain morgan\b/i],
  ["brandy", /\b(brandy|cognac)\b/i],
  ["liqueur", /\b(liqueur|cream liqueur|baileys|amarula)\b/i],
  ["red-wine", /\bred\b.*\bwine\b|\bwine\b.*\bred\b|\b(cabernet|merlot|shiraz|pinotage)\b/i],
  ["white-wine", /\bwhite\b.*\bwine\b|\bwine\b.*\bwhite\b|\b(chardonnay|sauvignon blanc|chenin)\b/i],
  ["rose-wine", /\bros[eé]\b.*\bwine\b|\bwine\b.*\bros[eé]\b/i],
  ["wine", /\bwine\b|\b(four cousins|nederburg|robertson|drostdy[- ]hof|cellar cask|caprice)\b/i],
  ["bucket", /\bbucket\b/i],
  ["basin", /\bbasin\b/i],
  ["hard-broom", /\b(hard|stiff|yard|outdoor)\b.*\bbroom\b/i],
  ["soft-broom", /\bbroom\b/i],
  ["mop", /\bmop\b/i],
  ["dustpan", /\bdust ?pan\b/i],
  ["food-container", /\b(food (storage )?container|lunch box|storage container|tupperware)\b/i],
  ["clothes-pegs", /\b(clothes )?pegs?\b/i],
  ["hangers", /\bhangers?\b/i],
  ["led-bulb", /\b(led )?bulbs?\b/i],
  ["kitchen-cloth", /\b(kitchen|dish|cleaning|microfib(re|er))\s+(cloth|towel)s?\b/i],
  ["doormat", /\b(door ?mat|floor mat)\b/i],
  ["extension-cable", /\bextension (cable|cord|socket)\b/i],
  ["flask", /\b(flask|thermos)\b/i],
  ["sufuria", /\b(sufuria|cooking pot|frying pan|saucepan)\b/i],
];

export function conceptFor(title) {
  for (const [concept, re] of CONCEPTS) if (re.test(title)) return concept;
  return null;
}

export function canonicalKey(title) {
  const concept = conceptFor(title);
  if (!concept) return null;
  const size = parseSize(title);
  return size ? `${concept}-${size.label}` : concept;
}

// ---------------------------------------------------------------- brands

const BRANDS = [
  "Ajab", "Exe", "Soko", "Pembe", "Jogoo", "Hostess", "Taifa", "Fresh Fri", "Rina", "Salit", "Golden Fry", "Elianto",
  "Bahari", "Kimbo", "Prestige", "Blue Band", "Daawat", "Pishori", "Pearl", "Kabras", "Mumias", "Mara Sugar",
  "Kericho Gold", "Ketepa", "Dormans", "Nescafe", "Milo", "Cadbury", "Brookside", "Tuzo", "Ilara", "KCC", "Daima",
  "Fresha", "Festive", "Supa Loaf", "Broadways", "Sunlight", "Omo", "Ariel", "Toss", "Persil", "Ushindi", "Jamaa",
  "Menengai", "White Wash", "Morning Fresh", "Axion", "Harpic", "Jik", "Dettol", "Protex", "Geisha", "Imperial Leather",
  "Nivea", "Vaseline", "Colgate", "Sensodyne", "Always", "Kotex", "Hanan", "Toilex", "Velvex", "Nice & Soft", "Rosy",
  "Kenpoly", "Teepee", "Tusker", "White Cap", "Guinness", "Manyatta", "Savanna", "Snapp", "Jameson", "Johnnie Walker",
  "Gilbey's", "Gordon's", "Smirnoff", "Captain Morgan", "Baileys", "Amarula", "Four Cousins", "Nederburg", "Robertson",
  "Drostdy-Hof", "Cellar Cask", "Royco", "Tropical Heat", "Knorr", "Zesta", "Peptang", "Kenchic", "Farmer's Choice",
].sort((a, b) => b.length - a.length); // longest first, so "Fresh Fri" beats "Fresh"

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BRAND_RES = BRANDS.map((b) => [b, new RegExp(`(^|[^a-z])${escape(b)}(?![a-z])`, "i")]);

// Words that start the product description rather than the brand.
const GENERIC =
  /^(premium|superior|extra|pure|vegetable|veg|cooking|maize|wheat|meal|flour|oil|fat|white|brown|fresh|long|life|original|classic|natural|organic|virgin|x-virgin|100%|sunflower|corn|seed|home|baking|all|purpose|multipurpose|toilet|tissue|bar|soap|lager|beer|gin|whisky|vodka|rum|wine|red|sweet|dry|bucket|broom|mop|sifted|super|special|spesheli|blend|bottle|can|coconut|macadamia|olive|vrgn)$/i;

export function extractBrand(title) {
  for (const [brand, re] of BRAND_RES) if (re.test(title)) return brand;
  const words = title.replace(/ /g, " ").split(/\s+/).filter(Boolean);
  const picked = [];
  for (const w of words) {
    if (GENERIC.test(w) || /\d+(\.\d+)?(kg|g|l|ml|lt|ltr)$/i.test(w)) break;
    if (picked.length && /^\d/.test(w)) break;
    picked.push(w);
    if (picked.length === 3) break;
  }
  return picked.length ? picked.join(" ") : null;
}

// ---------------------------------------------------------------- full row

export function parseProduct({ store, externalSku, title, regularPrice, salePrice = null, categoryGroup, subcategory = null, productUrl = null, breadcrumb = "", inStock = true }) {
  const cleanTitle = String(title).replace(/\s+/g, " ").trim();
  if (!cleanTitle || !regularPrice || isBlocked(cleanTitle, breadcrumb)) return null;

  const size = parseSize(cleanTitle);
  const concept = conceptFor(cleanTitle);
  const sale = salePrice && salePrice < regularPrice ? salePrice : null;
  const effective = sale ?? regularPrice;

  return {
    store,
    external_sku: String(externalSku),
    title: cleanTitle,
    brand: extractBrand(cleanTitle),
    category_group: categoryGroup,
    subcategory,
    canonical_concept: concept,
    canonical_group_key: concept ? (size ? `${concept}-${size.label}` : concept) : null,
    pack_size_label: size ? size.label.toUpperCase() : null,
    normalized_qty: size ? size.qty : null,
    normalized_unit: size ? size.unit : null,
    regular_price: regularPrice,
    sale_price: sale,
    unit_price: size && size.qty > 0 ? Math.round((effective / size.qty) * 100) / 100 : null,
    is_on_sale: Boolean(sale),
    product_url: productUrl,
    in_stock: inStock,
  };
}

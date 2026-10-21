// Weekly Naivas + Quickmart price scraper. Runs in GitHub Actions (never on Vercel/Supabase).
// Reads public category pages politely (honest user agent, 1.5-2.5 s between requests),
// normalizes each product with scripts/lib/product-parser.mjs, and upserts into catalog_products.
// If a store blocks us, we stop that store and record a partial run; we never try to get around it.
//
// Usage:
//   node scripts/scrape-supermarkets.mjs                 # both stores, writes to Supabase
//   node scripts/scrape-supermarkets.mjs --dry-run       # parse only, print a summary
//   node scripts/scrape-supermarkets.mjs --store naivas --categories commodities/flour/maize-flour --max-pages 2
import { createClient } from "@supabase/supabase-js";
import { parsePrice, parseProduct } from "./lib/product-parser.mjs";
import { readEnv } from "./env.mjs";

const USER_AGENT = "KimemiahFamilyPriceBot/1.0 (weekly household price list; github.com/kkkkenya/kimemiah-family)";

// ---------------------------------------------------------------- categories (allowlist)

const NAIVAS = {
  base: "https://www.naivas.online",
  categories: [
    // Deals first, so a product's specific category (scraped later) wins.
    ["promos", "deals"], ["food-cupboard-deals", "deals"], ["beverage-deals", "deals"], ["liqour-deals", "deals"], ["homecare-deals", "deals"],
    ["commodities", "food_cupboard"], ["food-cupboard", "food_cupboard"], ["fats-oils", "food_cupboard"], ["breakfast", "food_cupboard"],
    ["canned-frozen-meals", "food_cupboard"], ["food-additives", "food_cupboard"],
    ["dairy", "dairy_bakery"], ["naivas-bakery", "dairy_bakery"], ["pre-packed-meat-products", "dairy_bakery"],
    ["beverage", "beverages"], ["hot-beverage", "beverages"], ["cold-beverage", "beverages"],
    ["spirits", "liquor_alcohol"], ["beer", "liquor_alcohol"], ["wine", "liquor_alcohol"], ["naivas-liqour", "liquor_alcohol"],
    ["laundry", "cleaning_laundry"], ["dish-washing", "cleaning_laundry"], ["multi-purpose-cleaners", "cleaning_laundry"],
    ["surface-cleaners", "cleaning_laundry"], ["toilet-septic-care", "cleaning_laundry"], ["pest-control", "cleaning_laundry"],
    ["air-fresheners", "cleaning_laundry"], ["cleaning-essentials", "cleaning_laundry"], ["household-essentials", "cleaning_laundry"],
    ["toiletries", "toiletries"], ["tissues-towels", "toiletries"], ["personal-care", "toiletries"], ["body-care", "toiletries"],
    ["haircare-styling", "toiletries"],
    ["household", "home_qol"], ["kitchen-dining", "home_qol"],
  ],
};

const QUICKMART = {
  base: "https://www.quickmart.co.ke",
  categories: [
    ["flour", "food_cupboard"], ["cooking-oils-fats", "food_cupboard"], ["rice-cereals", "food_cupboard"], ["sugar", "food_cupboard"],
    ["pasta-noodles", "food_cupboard"], ["seasoning-condiments", "food_cupboard"], ["processed-canned-foods", "food_cupboard"],
    ["breakfast", "food_cupboard"], ["foods", "food_cupboard"],
    ["dairy-products", "dairy_bakery"], ["cakes-bread", "dairy_bakery"], ["meat-products-eggs", "dairy_bakery"],
    ["beverages", "beverages"], ["juices-carbonates", "beverages"], ["water", "beverages"],
    ["beer", "liquor_alcohol"], ["spirits", "liquor_alcohol"], ["wines", "liquor_alcohol"], ["liquor", "liquor_alcohol"],
    ["soaps-detergents", "cleaning_laundry"], ["cleaners-polish", "cleaning_laundry"], ["homecare", "cleaning_laundry"],
    ["pest-control", "cleaning_laundry"],
    ["tissue", "toiletries"], ["personal-care", "toiletries"], ["personal-wash", "toiletries"], ["oral-care-products", "toiletries"],
    ["sanitary", "toiletries"], ["body-care", "toiletries"], ["hair-care-products", "toiletries"],
    ["households", "home_qol"], ["housekeeping", "home_qol"], ["cleaning-equipments", "home_qol"], ["kitchen-dining", "home_qol"],
    ["light-plastic", "home_qol"],
  ],
  // Quickmart prices by branch; this picks the nearest one. Override with QUICKMART_LAT / QUICKMART_LNG.
  location: { lat: process.env.QUICKMART_LAT ?? "-1.286389", lng: process.env.QUICKMART_LNG ?? "36.817223", address: "Nairobi, Kenya" },
};

// ---------------------------------------------------------------- polite HTTP

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(1500 + Math.random() * 1000);

class BlockedError extends Error {}

const cookies = new Map();
function cookieHeader() {
  return [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
}
function keepCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

async function request(url, { method = "GET", body, headers = {} } = {}) {
  for (let attempt = 1; ; attempt++) {
    await jitter();
    let res;
    try {
      res = await fetch(url, {
        method,
        body,
        redirect: "follow",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/json", cookie: cookieHeader(), ...headers },
      });
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(5000 * attempt);
      continue;
    }
    keepCookies(res);
    const text = await res.text();
    if (res.status === 403 || /Sorry, you have been blocked|Attention Required! \| Cloudflare/i.test(text)) {
      throw new BlockedError(`${new URL(url).host} blocked the request (HTTP ${res.status}); stopping this store.`);
    }
    if (res.status === 404) return { status: 404, text: "" };
    if (res.status >= 500 || res.status === 429) {
      if (attempt >= 3) throw new Error(`HTTP ${res.status} for ${url}`);
      await sleep(10000 * attempt);
      continue;
    }
    return { status: res.status, text, url: res.url };
  }
}

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

// ---------------------------------------------------------------- Naivas (Livewire product cards)

export function parseNaivasPage(html) {
  const blocks = html.split('class="border border-naivas-bg p-3').slice(1);
  const out = [];
  for (const b of blocks) {
    const link = b.match(/href="(https:\/\/www\.naivas\.online\/[^"]+)"\s+title="([^"]+)"\s+class="mx-auto"/);
    const sku = b.match(/name="product_id" value="(\d+)"/);
    const current = b.match(/text-naivas-green[^>]*>\s*KES[\s ]*([\d,.]+)/);
    if (!link || !sku || !current) continue;
    const old = b.match(/line-through[^>]*>\s*KES[\s ]*([\d,.]+)/);
    const now = parsePrice(current[1]);
    const was = old ? parsePrice(old[1]) : null;
    out.push({
      externalSku: sku[1],
      title: decode(link[2]),
      productUrl: link[1],
      regularPrice: was && now && was > now ? was : now,
      salePrice: was && now && was > now ? now : null,
      inStock: !/out of stock/i.test(b.slice(0, 4000)),
    });
  }
  return out;
}

async function scrapeNaivas(categories, maxPages, onProducts) {
  for (const [slug, group] of categories) {
    const seen = new Set();
    for (let page = 1; page <= maxPages; page++) {
      const { status, text } = await request(`${NAIVAS.base}/${slug}${page > 1 ? `?page=${page}` : ""}`);
      if (status === 404) break;
      const products = parseNaivasPage(text).filter((p) => !seen.has(p.externalSku));
      if (products.length === 0) break;
      products.forEach((p) => seen.add(p.externalSku));
      await onProducts(products, group, slug);
    }
    console.log(`  naivas/${slug}: ${seen.size}`);
  }
}

// ---------------------------------------------------------------- Quickmart (branch-priced listing)

export function parseQuickmartPage(html) {
  const blocks = html.split('class="products productInfoJs"').slice(1);
  const out = [];
  for (const b of blocks) {
    const title = b.match(/class="products-title"\s+title="([^"]+)"\s+href="([^"]+)"/);
    const sku = b.match(/name="selprod_id" value="(\d+)"/);
    const current = b.match(/products-price-new">\s*KES[\s ]*([\d,.]+)/);
    if (!title || !sku || !current) continue;
    const old = b.match(/products-price-old">\s*KES[\s ]*([\d,.]+)/);
    const now = parsePrice(current[1]);
    const was = old ? parsePrice(old[1]) : null;
    out.push({
      externalSku: sku[1],
      title: decode(title[1]),
      productUrl: new URL(title[2], QUICKMART.base).toString(),
      regularPrice: was && now && was > now ? was : now,
      salePrice: was && now && was > now ? now : null,
      inStock: !/data-stock="0"|out of stock/i.test(b.slice(0, 3000)),
    });
  }
  return out;
}

async function chooseQuickmartBranch() {
  await request(`${QUICKMART.base}/`);
  const { lat, lng, address } = QUICKMART.location;
  const body = new URLSearchParams({ lat, lng, radius: "15", address, fIsAjax: "1", fOutMode: "json" });
  const { text } = await request(`${QUICKMART.base}/geo-location/set-up-user-location`, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", "x-requested-with": "XMLHttpRequest" },
  });
  if (!cookies.get("_ygShopId")) throw new Error(`Quickmart didn't pick a branch: ${text.slice(0, 200)}`);
  console.log(`  quickmart branch: ${cookies.get("_ygShopId")}`);
}

async function scrapeQuickmart(categories, maxPages, onProducts) {
  await chooseQuickmartBranch();
  for (const [slug, group] of categories) {
    const first = await request(`${QUICKMART.base}/${slug}`);
    const categoryId = first.text.match(/name="category" value="(\d+)"/)?.[1];
    const total = Number(first.text.match(/name="recordDisplayCount" value="(\d+)"/)?.[1] ?? 0);
    if (first.status === 404 || !categoryId || /\/home$/.test(first.url ?? "")) {
      console.log(`  quickmart/${slug}: skipped (no listing)`);
      continue;
    }
    const seen = new Set();
    const take = async (html) => {
      const products = parseQuickmartPage(html).filter((p) => !seen.has(p.externalSku));
      products.forEach((p) => seen.add(p.externalSku));
      if (products.length) await onProducts(products, group, slug);
      return products.length;
    };
    await take(first.text);
    const pages = Math.min(maxPages, Math.max(1, Math.ceil(total / 30)));
    for (let page = 2; page <= pages; page++) {
      const { text } = await request(`${QUICKMART.base}/products/search?category-${categoryId}&pagesize-30&page-${page}`);
      if ((await take(text)) === 0) break;
    }
    console.log(`  quickmart/${slug}: ${seen.size} of ${total}`);
  }
}

// ---------------------------------------------------------------- main

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const dryRun = process.argv.includes("--dry-run");
const onlyStore = arg("store");
const maxPages = Number(arg("max-pages", "40"));
const onlyCategories = arg("categories")?.split(",");

const env = { ...readEnv(), ...process.env };
const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const db = dryRun ? null : createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
if (!dryRun && (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

async function runStore(store, config, scrape) {
  const started = new Date().toISOString();
  const rows = new Map(); // sku -> row (later categories win)
  let run = null;
  if (db) run = (await db.from("scrape_runs").insert({ store, status: "running" }).select("id").single()).data;

  let status = "success";
  let error = null;
  const categories = onlyCategories ? config.categories.filter(([slug]) => onlyCategories.includes(slug)) : config.categories;
  try {
    await scrape(categories, maxPages, async (products, group, slug) => {
      for (const p of products) {
        const row = parseProduct({ ...p, store, categoryGroup: group, subcategory: slug, breadcrumb: slug });
        if (row) rows.set(row.external_sku, { ...row, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      }
    });
  } catch (err) {
    status = rows.size ? "partial" : "failed";
    error = err.message;
    console.error(`  ${store}: ${err.message}`);
  }

  const all = [...rows.values()];
  if (db && all.length) {
    for (let i = 0; i < all.length; i += 500) {
      const { error: upErr } = await db.from("catalog_products").upsert(all.slice(i, i + 500), { onConflict: "store,external_sku" });
      if (upErr) {
        status = "partial";
        error = `${error ?? ""} upsert: ${upErr.message}`.trim();
        break;
      }
    }
    // A full, clean run means anything we didn't see is gone from the shelf.
    if (status === "success" && !onlyCategories) {
      await db.from("catalog_products").update({ in_stock: false, updated_at: new Date().toISOString() }).eq("store", store).lt("last_seen_at", started).eq("in_stock", true);
    }
  }
  const onSale = all.filter((r) => r.is_on_sale).length;
  if (db && run) {
    await db.from("scrape_runs").update({ finished_at: new Date().toISOString(), status, items_upserted: all.length, items_on_sale: onSale, error_summary: error, branch_id: store === "quickmart" ? (cookies.get("_ygShopId") ?? null) : null }).eq("id", run.id);
  }
  console.log(`${store}: ${status}, ${all.length} products, ${onSale} on sale, ${all.filter((r) => r.canonical_concept).length} matched to a household item type`);
  return { status, all };
}

const results = [];
if (!onlyStore || onlyStore === "naivas") results.push(await runStore("naivas", NAIVAS, scrapeNaivas));
cookies.clear();
if (!onlyStore || onlyStore === "quickmart") results.push(await runStore("quickmart", QUICKMART, scrapeQuickmart));

if (dryRun) {
  for (const { all } of results) for (const r of all.slice(0, 8)) console.log(`   ${r.store} | ${r.canonical_group_key ?? "-"} | ${r.brand ?? "-"} | ${r.title} | ${r.sale_price ?? r.regular_price}`);
}
// Naivas currently blocks automated clients; only fail the job when every store failed.
process.exit(results.length && results.every((r) => r.status === "failed") ? 1 : 0);

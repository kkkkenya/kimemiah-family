import { describe, expect, it } from "vitest";
import { canonicalKey, conceptFor, extractBrand, isBlocked, parsePrice, parseProduct, parseSize, tierFor } from "./product-parser.mjs";

// Titles below are real ones seen on naivas.online and quickmart.co.ke (Oct 2026).

describe("parsePrice", () => {
  it("reads KES amounts with commas and decimals", () => {
    expect(parsePrice("KES 1,299.00")).toBe(1299);
    expect(parsePrice(" KES 149 ")).toBe(149);
    expect(parsePrice("KES 162")).toBe(162);
    expect(parsePrice("")).toBeNull();
  });
});

describe("parseSize", () => {
  it("reads weights and volumes in many spellings", () => {
    expect(parseSize("Soko Maize Meal 2Kg")).toMatchObject({ qty: 2, unit: "kg", label: "2kg" });
    expect(parseSize("Pembe Maize Meal 5 Kg")).toMatchObject({ qty: 5, unit: "kg", label: "5kg" });
    expect(parseSize("Kasuku Pure White Cooking Fat 500G")).toMatchObject({ qty: 0.5, unit: "kg", label: "500g" });
    expect(parseSize("Elianto Corn Cooking Oil 2Lt")).toMatchObject({ qty: 2, unit: "liter", label: "2l" });
    expect(parseSize("Top Fry Vegetable Cooking Oil 500Ml")).toMatchObject({ qty: 0.5, unit: "liter", label: "500ml" });
    expect(parseSize("Kentaste Vrgn Coconut Oil(Pet)1000Ml")).toMatchObject({ qty: 1, unit: "liter", label: "1l" });
    expect(parseSize("Kentaste Coconut Oil 200Ml/250Ml")).toMatchObject({ qty: 0.2, unit: "liter" });
  });

  it("multiplies multipacks", () => {
    expect(parseSize("Tusker Lager Can 6 X 500Ml")).toMatchObject({ qty: 3, unit: "liter", label: "6x500ml" });
    expect(parseSize("Coke 500ml x 12")).toMatchObject({ qty: 6, unit: "liter", label: "12x500ml" });
  });

  it("counts rolls, pieces and eggs", () => {
    expect(parseSize("Toilex Toilet Tissue 10 Rolls")).toMatchObject({ qty: 10, unit: "unit", label: "10pk" });
    expect(parseSize("Velvex Serviettes 4Pcs")).toMatchObject({ qty: 4, unit: "unit" });
    expect(parseSize("Kenchic Eggs Tray Of 30")).toMatchObject({ qty: 30, unit: "unit", label: "30pk" });
  });

  it("counts tissue by rolls or packs, not sheets", () => {
    expect(parseSize("Rosy White Toilet Tissue - 40 Sheets Single Pack")).toMatchObject({ qty: 1, label: "1pk" });
    expect(parseSize("Poshy Tissue Roll Poa - 100 Sheets (10 Pack)")).toMatchObject({ qty: 10, label: "10pk" });
    expect(canonicalKey("Rosy Extra Toilet Tissue 10 Pack")).toBe("toilet-tissue-10pk");
    expect(conceptFor("Hanan Pocket Tissue - 10 Sheets")).toBe("facial-tissue");
    expect(conceptFor("Velvex Facial Tissue Silver - 70 Sheets")).toBe("facial-tissue");
  });

  it("returns null when there is no size", () => {
    expect(parseSize("Soft Broom With Handle")).toBeNull();
  });
});

describe("conceptFor", () => {
  it("maps everyday staples", () => {
    expect(conceptFor("Ajab Premium Maize Meal 2Kg")).toBe("maize-flour");
    expect(conceptFor("Dola Gold Superior Maize Flour 2 Kg")).toBe("maize-flour");
    expect(conceptFor("Fresh Fri Vegetable Cooking Oil 2L")).toBe("cooking-oil");
    expect(conceptFor("Pika Veg Oil 20L")).toBe("cooking-oil");
    expect(conceptFor("Rinsun 100% Sunflower Cooking Oil 1L")).toBe("cooking-oil");
    expect(conceptFor("Kasuku Pure White Cooking Fat 1Kg")).toBe("cooking-fat");
  });

  it("keeps look-alikes apart", () => {
    expect(conceptFor("Jogoo Wimbi Flour 2Kg")).not.toBe("maize-flour");
    expect(conceptFor("Borges Extra Virgin Olive Oil 500Ml")).toBe("olive-oil");
    expect(conceptFor("Kentaste Coconut Oil 1L")).toBe("coconut-oil");
    expect(conceptFor("Cadbury Dairy Milk Chocolate 80G")).not.toBe("milk");
  });

  it("knows drinks, cleaning and home upgrades", () => {
    expect(conceptFor("Tusker Lager Can 500Ml")).toBe("lager-beer");
    expect(conceptFor("Guinness Foreign Extra Stout 500Ml")).toBe("stout");
    expect(conceptFor("Gilbey's Gin 750Ml")).toBe("gin");
    expect(conceptFor("Four Cousins Sweet Red Wine 750Ml")).toBe("red-wine");
    expect(canonicalKey("Four Cousins Sweet Red Wine 750Ml")).toBe("red-wine-750ml");
    expect(canonicalKey("Tusker Lager Can 500Ml")).toBe("lager-beer-500ml");
    expect(conceptFor("Sunlight Multipurpose Bar Soap 800G")).toBe("bar-soap");
    expect(conceptFor("Toilex Toilet Tissue 10 Rolls")).toBe("toilet-tissue");
    expect(conceptFor("Kenpoly Bucket 20L With Lid")).toBe("bucket");
    expect(conceptFor("Soft Broom With Handle")).toBe("soft-broom");
    expect(conceptFor("Hard Yard Broom")).toBe("hard-broom");
  });
});

describe("extractBrand", () => {
  it("prefers the Kenyan brand list", () => {
    expect(extractBrand("Fresh Fri Vegetable Cooking Oil 2L")).toBe("Fresh Fri");
    expect(extractBrand("Bidco Kimbo Cooking Vegetable Fat 1Kg")).toBe("Kimbo");
    expect(extractBrand("Gilbey's Gin 750Ml")).toBe("Gilbey's");
  });

  it("falls back to the words before the product noun", () => {
    expect(extractBrand("Top Fry Vegetable Cooking Oil 5L")).toBe("Top Fry");
    expect(extractBrand("210 Maize Meal Flour 2 Kg")).toBe("210");
    expect(extractBrand("Masterchef Premium Maize Meal 2Kg")).toBe("Masterchef");
  });
});

describe("isBlocked", () => {
  it("drops electronics and appliances", () => {
    expect(isBlocked('Hisense 43" Smart TV')).toBe(true);
    expect(isBlocked("Ramtons Electric Kettle 1.7L")).toBe(true);
    expect(isBlocked("Von Air Fryer 4L")).toBe(true);
    expect(isBlocked("Anything", "electronics/televisions")).toBe(true);
  });
  it("keeps groceries and household goods", () => {
    expect(isBlocked("Fresh Fri Vegetable Cooking Oil 2L")).toBe(false);
    expect(isBlocked("Kenpoly Bucket 20L With Lid")).toBe(false);
  });
});

describe("canonicalKey and parseProduct", () => {
  it("joins concept and pack size", () => {
    expect(canonicalKey("Soko Maize Meal 2Kg")).toBe("maize-flour-2kg");
    expect(canonicalKey("Rina Vegetable Cooking Oil 3L")).toBe("cooking-oil-3l");
    expect(canonicalKey("Soft Broom With Handle")).toBe("soft-broom");
    expect(canonicalKey("Some Random Thing")).toBeNull();
  });

  it("builds a full catalog row with sale and unit price", () => {
    const row = parseProduct({
      store: "naivas",
      externalSku: "1670",
      title: "Soko Maize Meal 2Kg",
      regularPrice: 162,
      salePrice: 149,
      categoryGroup: "food_cupboard",
      subcategory: "maize-flour",
      productUrl: "https://www.naivas.online/soko-maize-meal-2kg",
    });
    expect(row).toMatchObject({
      store: "naivas",
      external_sku: "1670",
      brand: "Soko",
      canonical_group_key: "maize-flour-2kg",
      canonical_concept: "maize-flour",
      pack_size_label: "2KG",
      normalized_qty: 2,
      normalized_unit: "kg",
      regular_price: 162,
      sale_price: 149,
      unit_price: 74.5,
      is_on_sale: true,
    });
  });

  it("ignores a 'sale' price that isn't lower, and returns null for blocked items", () => {
    const row = parseProduct({ store: "quickmart", externalSku: "1", title: "Rina Vegetable Cooking Oil 1L", regularPrice: 326, salePrice: 326, categoryGroup: "food_cupboard" });
    expect(row.sale_price).toBeNull();
    expect(row.is_on_sale).toBe(false);
    expect(parseProduct({ store: "naivas", externalSku: "2", title: "Ramtons Electric Kettle", regularPrice: 2500, categoryGroup: "home_qol" })).toBeNull();
  });
});

describe("tierFor", () => {
  it("tags staples as Essentials, home goods as Upgrades, the rest as Full shop", () => {
    expect(tierFor("maize-flour", "food_cupboard")).toBe("essential");
    expect(tierFor("toilet-tissue", "toiletries")).toBe("essential");
    expect(tierFor("bucket", "cleaning_laundry")).toBe("qol");
    expect(tierFor(null, "home_qol")).toBe("qol");
    expect(tierFor("lager-beer", "liquor_alcohol")).toBe("standard");
    expect(tierFor("washing-powder", "cleaning_laundry")).toBe("standard");
    expect(tierFor(null, "beverages")).toBe("standard");
  });

  it("is part of every parsed row", () => {
    const row = parseProduct({ store: "quickmart", externalSku: "1", title: "Soko Maize Meal 2Kg", regularPrice: 149, categoryGroup: "food_cupboard" });
    expect(row?.default_tier).toBe("essential");
  });
});

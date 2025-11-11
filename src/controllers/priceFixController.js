import PriceFix from "../models/priceFixModel.js";
import Catalog from "../models/catalogModel.js"; // you already have this
import { validatePriceFixInput } from "../validations/priceFixValidation.js";

/**
 * POST /api/prices/fixings
 * Accepts a single object or an array and performs upserts.
 * Body example:
 * [
 *   { category:"small_product", serviceName:"EM Proprietary JRT Tissue", currentPrice:10, newPrice:12, frequency:"Weekly", effectiveFrom:"2025-05-01", updatedBy:"pavani@clicksolver.in" }
 * ]
 */
export async function upsertPriceFixings(req, res) {
  try {
    const body = req.body;
    const data = Array.isArray(body) ? body : [body];

    const { ok, errors } = validatePriceFixInput(data);
    if (!ok) return res.status(400).json({ ok: false, errors });

    const ops = data.map((it) => ({
      updateOne: {
        filter: { category: it.category, serviceName: it.serviceName },
        update: {
          $set: {
            category: it.category,
            serviceName: it.serviceName,
            currentPrice: it.currentPrice ?? 0,
            newPrice: it.newPrice ?? 0,
            frequency: it.frequency ?? "",
            effectiveFrom: it.effectiveFrom ? new Date(it.effectiveFrom) : undefined,
            updatedBy: it.updatedBy ?? "",
          },
        },
        upsert: true,
      },
    }));

    if (ops.length) {
      await PriceFix.bulkWrite(ops, { ordered: false });
    }

    return res.status(201).json({ ok: true, count: ops.length });
  } catch (err) {
    // duplicate key or validation error handling
    if (err?.code === 11000) {
      return res.status(409).json({ ok: false, error: "Duplicate (category + serviceName) detected." });
    }
    console.error("upsertPriceFixings error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
}

/**
 * GET /api/prices/fixings
 * Query params: ?category=small_product&search=abc&page=1&pageSize=50
 */
export async function listPriceFixings(req, res) {
  try {
    const { category, search = "", page = 1, pageSize = 50 } = req.query;

    const q = {};
    if (category) q.category = category;
    if (search) q.serviceName = { $regex: search, $options: "i" };

    const p = Math.max(parseInt(page), 1);
    const s = Math.min(Math.max(parseInt(pageSize), 1), 200);

    const [items, total] = await Promise.all([
      PriceFix.find(q).sort({ updatedAt: -1 }).skip((p - 1) * s).limit(s).lean(),
      PriceFix.countDocuments(q),
    ]);

    return res.json({
      ok: true,
      data: { items, page: p, pageSize: s, total },
    });
  } catch (err) {
    console.error("listPriceFixings error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
}

export async function listProductNames(req, res) {
  try {
    const { catalogId } = req.query;

    // 1) Try Catalog
    let smallProducts = [];
    let dispensers = [];
    let bigProducts = [];

    const catalog = catalogId
      ? await Catalog.findById(catalogId).lean()
      : await Catalog.findOne({}).sort({ updatedAt: -1 }).lean();

    if (catalog?.products) {
      smallProducts =
        catalog?.products?.smallProducts?.rows?.map(r => r?.name).filter(Boolean) ?? [];
      dispensers =
        catalog?.products?.dispensers?.rows?.map(r => r?.name).filter(Boolean) ?? [];
      bigProducts =
        catalog?.products?.bigProducts?.rows?.map(r => r?.name).filter(Boolean) ?? [];
    }

    const gotFromCatalog =
      (smallProducts?.length ?? 0) + (dispensers?.length ?? 0) + (bigProducts?.length ?? 0) > 0;

    // 2) Fallback to PriceFix distinct names if catalog empty
    if (!gotFromCatalog) {
      const [sp, dp, bp] = await Promise.all([
        PriceFix.distinct("serviceName", { category: "small_product" }),
        PriceFix.distinct("serviceName", { category: "dispenser" }),
        PriceFix.distinct("serviceName", { category: "big_product" }),
      ]);
      smallProducts = (sp || []).sort();
      dispensers = (dp || []).sort();
      bigProducts = (bp || []).sort();
    } else {
      smallProducts = Array.from(new Set(smallProducts)).sort();
      dispensers = Array.from(new Set(dispensers)).sort();
      bigProducts = Array.from(new Set(bigProducts)).sort();
    }

    return res.json({
      ok: true,
      data: { smallProducts, dispensers, bigProducts },
    });
  } catch (err) {
    console.error("listProductNames error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
}

/**
 * GET /api/product/services
 * Returns ALL docs from pricefixes grouped by category.
 * Useful for filling the frontend grids in one call.
 */
export async function listAllServicesGrouped(req, res) {
  try {
    const rows = await PriceFix.find({}).sort({ serviceName: 1 }).lean();

    const group = {
      smallProducts: [],
      dispensers: [],
      bigProducts: [],
    };

    for (const r of rows) {
      const item = {
        id: String(r._id),
        category: r.category,
        serviceName: r.serviceName,
        currentPrice: r.currentPrice ?? 0,
        newPrice: r.newPrice ?? 0,
        frequency: r.frequency ?? "",
        effectiveFrom: r.effectiveFrom ?? null,
        updatedBy: r.updatedBy ?? "",
        updatedAt: r.updatedAt ?? null,
        createdAt: r.createdAt ?? null,
      };

      if (r.category === "small_product") group.smallProducts.push(item);
      else if (r.category === "dispenser") group.dispensers.push(item);
      else if (r.category === "big_product") group.bigProducts.push(item);
    }

    return res.json({ ok: true, data: group });
  } catch (err) {
    console.error("listAllServicesGrouped error:", err);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
}
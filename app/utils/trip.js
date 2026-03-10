import Extra from "../models/Extras.js";
import mongoose from "mongoose";
import PromoCode from "../models/promoCodes.js";
// ---------- helpers ----------
export const isBlank = (v) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export const parseDateSafe = (v) => {
  if (isBlank(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function buildStop(input) {
  if (!input) return {};
  const when = parseDateSafe(input.when);
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  const hasCoords = !Number.isNaN(lat) && !Number.isNaN(lng);

  return {
    address: input.address || "",
    when: when || null,
    localDate: input.localDate || undefined,
    localTime: input.localTime || undefined,
    location: hasCoords
      ? { type: "Point", coordinates: [lng, lat] }
      : undefined,
  };
}

export function ceilDays(start, end) {
  if (!start || !end) return 1;
  const ms = end.getTime() - start.getTime();
  if (ms <= 0) return 1;
  const days = ms / (1000 * 60 * 60 * 24);
  return Math.ceil(days);
}

export function computePromoDiscount(promo, baseAmount) {
  if (!promo) return 0;
  const amt = Number(baseAmount) || 0;
  if (amt <= 0) return 0;

  let disc = 0;
  if (promo.type === "Percent") {
    disc = (amt * Number(promo.amount)) / 100;
    if (promo.maxAmount != null) {
      disc = Math.min(disc, Number(promo.maxAmount));
    }
  } else if (promo.type === "Flat") {
    disc = Number(promo.amount);
  }
  disc = Math.max(0, Math.min(disc, amt));
  return disc;
}

export async function resolveExtrasLineItems(
  requestedExtras = [],
  requiredMap = new Map()
) {
  const qtyByService = new Map();

  // from request
  for (const e of requestedExtras) {
    if (!e?.serviceId) continue;
    const id = String(e.serviceId);
    const qty = Math.max(1, Number(e.qty || 1));
    qtyByService.set(id, (qtyByService.get(id) || 0) + qty);
  }

  // ensure required extras exist (qty >=1)
  for (const [sid, isReq] of requiredMap.entries()) {
    if (isReq && !qtyByService.has(sid)) qtyByService.set(sid, 1);
  }

  if (qtyByService.size === 0) return { items: [], extrasTotal: 0 };

  // fetch Extra docs
  const serviceIds = [...qtyByService.keys()];
  const extrasDocs = await Extra.find({ _id: { $in: serviceIds } })
    .select("_id name price isQuantityBased minQuantity maxQuantity status")
    .lean();

  const extrasById = new Map(extrasDocs.map((d) => [String(d._id), d]));

  const items = [];
  let extrasTotal = 0;

  for (const [sid, qty] of qtyByService.entries()) {
    const doc = extrasById.get(sid);
    if (!doc) {
      throw new Error(`Extra service not found: ${sid}`);
    }
    // (Optional) enforce active status if present
    if (doc.status === false) {
      throw new Error(`Extra service inactive: ${doc.name || sid}`);
    }
    if (doc.isQuantityBased) {
      if (doc.minQuantity != null && qty < doc.minQuantity) {
        throw new Error(
          `Quantity for ${doc.name} must be >= ${doc.minQuantity}`
        );
      }
      if (doc.maxQuantity != null && qty > doc.maxQuantity) {
        throw new Error(
          `Quantity for ${doc.name} must be <= ${doc.maxQuantity}`
        );
      }
    }

    const unitPrice = Number(doc.price || 0);
    const line = {
      serviceId: doc._id,
      unitPrice,
      qty,
      isRequired: !!requiredMap.get(sid),
    };
    items.push(line);
    extrasTotal += unitPrice * qty;
  }

  return { items, extrasTotal };
}

export function canUseTransactions() {
  try {
    const client = mongoose.connection?.client;
    // if connection string has replicaSet or direct hasSessionSupport()
    const hasRs =
      client?.s?.options?.replicaSet ||
      (client?.s?.url && client.s.url.includes("replicaSet="));
    return !!hasRs;
  } catch {
    return false;
  }
}

/**
 * Reserve promo usage atomically (no txn):
 * - Validates code + window + visibility + usage cap in a single findOneAndUpdate
 * - Increments used by 1 on success
 * Returns the promo doc (after increment) or null if reservation failed.
 */
export async function reservePromoNoTxn(promoCode) {
  if (isBlank(promoCode)) return null;

  const now = new Date();
  const baseMatch = mongoose.Types.ObjectId.isValid(String(promoCode))
    ? { _id: promoCode }
    : { code: String(promoCode).trim().toUpperCase() };

  const reserved = await PromoCode.findOneAndUpdate(
    {
      ...baseMatch,
      // visible or not explicitly false
      $or: [{ visible: { $exists: false } }, { visible: true }],
      // date window
      $or: [{ validFrom: { $exists: false } }, { validFrom: { $lte: now } }],
      $or: [{ validUntil: { $exists: false } }, { validUntil: { $gte: now } }],
      // usage < limit (or unlimited when limit=null)
      $expr: {
        $lt: ["$used", { $ifNull: ["$limit", Infinity] }],
      },
    },
    { $inc: { used: 1 } },
    { new: true }
  );

  return reserved; // null if not matched
}

/**
 * Compensating action for no-txn path
 */
export async function releasePromoReservationNoTxn(promoId) {
  if (!promoId) return;
  await PromoCode.updateOne({ _id: promoId }, { $inc: { used: -1 } });
}

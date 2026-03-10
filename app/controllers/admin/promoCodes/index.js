import PromoCode from "../../../models/promoCodes.js";
import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";

const promoController = {};

/**
 * Utility: normalize and validate payload
 */
function normalizePayload(body, isUpdate = false) {
  const payload = {};

  if ("code" in body && typeof body.code === "string") {
    payload.code = body.code.trim().toUpperCase();
  }

  if ("type" in body) payload.type = body.type; // "Flat" | "Percent"
  if ("amount" in body) payload.amount = Number(body.amount);
  if ("maxAmount" in body)
    payload.maxAmount =
      body.maxAmount === null || body.maxAmount === undefined
        ? null
        : Number(body.maxAmount);

  if ("name" in body) payload.name = String(body.name || "").trim();
  if ("details" in body) payload.details = body.details ?? null;
  if ("level" in body) payload.level = body.level;

  if ("validFrom" in body)
    payload.validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
  if ("validUntil" in body) payload.validUntil = new Date(body.validUntil);

  if ("visible" in body) payload.visible = !!body.visible;

  if ("limit" in body)
    payload.limit =
      body.limit === null || body.limit === undefined
        ? null
        : Number(body.limit);
  if ("used" in body) payload.used = Number(body.used);

  // On create, default validFrom if not provided
  if (!isUpdate && !payload.validFrom) payload.validFrom = new Date();

  return payload;
}

function validateBusinessRules(doc) {
  // basic presence
  if (!doc.code) return "Promo code is required.";
  if (!doc.type) return "Type is required.";
  if (typeof doc.amount !== "number" || isNaN(doc.amount))
    return "Amount must be a valid number.";
  if (!doc.validUntil) return "validUntil (expiry) is required.";

  // type-specific
  if (doc.type === "Percent") {
    if (doc.amount <= 0 || doc.amount > 100)
      return "For Percent type, amount must be between 0 and 100.";
    // maxAmount is recommended but optional; skip hard requirement
  }
  if (doc.type === "Flat" && doc.amount < 0)
    return "For Flat type, amount must be >= 0.";

  // date logic
  const vf = new Date(doc.validFrom || new Date());
  const vu = new Date(doc.validUntil);
  if (vu <= vf) return "validUntil must be later than validFrom.";

  // limit/used sanity
  if (doc.limit !== null && doc.limit !== undefined) {
    if (doc.limit < 0) return "limit cannot be negative.";
    if (doc.used && doc.used > doc.limit) return "used cannot exceed limit.";
  }

  return null;
}

/**
 * CREATE
 */
promoController.createPromoCode = async (req, res) => {
  try {
    const payload = normalizePayload(req.body, false);
    const err = validateBusinessRules(payload);
    if (err) return sendError(res, err, CODES.BAD_REQUEST);

    // Uniqueness guard (case-insensitive handled by uppercase)
    const exists = await PromoCode.findOne({ code: payload.code });
    if (exists)
      return sendError(res, "Promo code already exists.", CODES.CONFLICT);

    const created = await PromoCode.create(payload);
    return sendSuccess(
      res,
      created,
      "Promo code created successfully.",
      CODES.CREATED
    );
  } catch (e) {
    console.error("Create PromoCode Error:", e);
    return sendError(res, e.message || e, CODES.INTERNAL_SERVER_ERROR);
  }
};

/**
 * UPDATE
 */
promoController.updatePromoCode = async (req, res) => {
  try {
    const { promoId } = req.params;
    const promo = await PromoCode.findById(promoId);
    if (!promo) return sendError(res, "Promo code not found.", CODES.NOT_FOUND);

    const update = normalizePayload(req.body, true);

    // If code is changing, enforce uniqueness
    if (update.code && update.code !== promo.code) {
      const dup = await PromoCode.findOne({ code: update.code });
      if (dup)
        return sendError(res, "Promo code already exists.", CODES.CONFLICT);
    }

    const temp = { ...promo.toObject(), ...update };
    const err = validateBusinessRules(temp);
    if (err) return sendError(res, err, CODES.BAD_REQUEST);

    Object.assign(promo, update);
    await promo.save();

    return sendSuccess(
      res,
      promo,
      "Promo code updated successfully.",
      CODES.OK
    );
  } catch (e) {
    console.error("Update PromoCode Error:", e);
    return sendError(res, e.message || e, CODES.INTERNAL_SERVER_ERROR);
  }
};

/**
 * DELETE
 */
promoController.deletePromoCode = async (req, res) => {
  try {
    const { promoId } = req.params;
    const promo = await PromoCode.findById(promoId);
    if (!promo) return sendError(res, "Promo code not found.", CODES.NOT_FOUND);

    await promo.deleteOne();
    return sendSuccess(res, {}, "Promo code deleted successfully.", CODES.OK);
  } catch (e) {
    console.error("Delete PromoCode Error:", e);
    return sendError(res, e.message || e, CODES.INTERNAL_SERVER_ERROR);
  }
};

/**
 * TOGGLE VISIBILITY
 */
promoController.toggleVisibility = async (req, res) => {
  try {
    const { promoId } = req.params;
    const promo = await PromoCode.findById(promoId);
    if (!promo) return sendError(res, "Promo code not found.", CODES.NOT_FOUND);

    promo.visible = !promo.visible;
    await promo.save();

    return sendSuccess(
      res,
      promo,
      `Promo code ${promo.visible ? "made visible" : "hidden"} successfully.`,
      CODES.OK
    );
  } catch (e) {
    console.error("Toggle PromoCode Visibility Error:", e);
    return sendError(res, e.message || e, CODES.INTERNAL_SERVER_ERROR);
  }
};

/**
 * GET ALL with pagination, search, visibility, startDate, endDate
 * Query params:
 * - search: string (matches code | name)
 * - page: number (default 1)
 * - limit: number (default 10)
 * - visibility: "all" | "visible" | "hidden"
 * - startDate, endDate: ISO strings -> filter by createdAt range
 * - valid: "active" | "expired" (optional, filter by validity at now)
 */
promoController.getAllPromoCodes = async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      visibility = "all",
      startDate,
      endDate,
      valid, // optional: "active" (now between validFrom..validUntil) | "expired"
      level, // optional: filter specific level
    } = req.query;

    const query = {};

    // Search by code or name
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    // Visibility filter
    if (visibility === "visible") query.visible = true;
    else if (visibility === "hidden") query.visible = false;

    // Level filter (optional)
    if (level) query.level = level;

    // Date range on createdAt (per your request: startDate/endDate)
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        // end inclusive → set to end-of-day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Validity filter (optional, handy in admin)
    if (valid === "active") {
      const now = new Date();
      query.validFrom = { $lte: now };
      query.validUntil = { $gte: now };
    } else if (valid === "expired") {
      const now = new Date();
      query.validUntil = { $lt: now };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [promos, total] = await Promise.all([
      PromoCode.find(query)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 }),
      PromoCode.countDocuments(query),
    ]);

    return sendSuccess(
      res,
      {
        promos,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
      "Promo codes fetched successfully.",
      CODES.OK
    );
  } catch (e) {
    console.error("Get PromoCodes Error:", e);
    return sendError(res, e.message || e, CODES.INTERNAL_SERVER_ERROR);
  }
};

export default promoController;

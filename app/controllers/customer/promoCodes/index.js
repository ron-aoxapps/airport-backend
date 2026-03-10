import PromoCode from "../../../models/promoCodes.js";
import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";

const promoController = {};

promoController.getValidPromoCodesForCustomer = async (req, res) => {
  try {
    const {
      search = "",
      page = 1,
      limit = 10,
      level, // optional: filter specific level
    } = req.query;

    const now = new Date();

    const query = {
      visible: true, // Only visible promo codes
      validFrom: { $lte: now }, // Started already
      validUntil: { $gte: now }, // Not expired
    };

    // Search by code or name
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    // Level filter (optional)
    if (level) query.level = level;

    const skip = (Number(page) - 1) * Number(limit);

    const [promos, total] = await Promise.all([
      PromoCode.find(query)
        .skip(skip)
        .limit(Number(limit))
        .sort({ validUntil: 1 }), // Expiring soon first
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
      "Valid promo codes fetched successfully.",
      CODES.OK
    );
  } catch (e) {
    console.error("Get Valid PromoCodes Error:", e);
    return sendError(res, e.message || e, CODES.INTERNAL_SERVER_ERROR);
  }
};

export default promoController;

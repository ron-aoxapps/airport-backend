import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import ParkingSpace from "../../../models/parkingSpaces.js";
import ParkingLocation from "../../../models/parkingLocations.js";
import mongoose from "mongoose";

const parkingSpacesController = {};

/* -------------------------- helpers -------------------------- */
const normalizeExtras = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((x) => ({
      extra: x.id || x.extra || x.serviceId, // tolerate different client keys
      isRequired: !!x.isRequired,
      quantity: typeof x.quantity === "number" ? x.quantity : 0,
    }))
    .filter((x) => mongoose.Types.ObjectId.isValid(x.extra));
};

const parseBool = (v, fallback = true) =>
  typeof v === "boolean" ? v : fallback;

/* -------------------------- CREATE --------------------------- */
parkingSpacesController.createParkingSpace = async (req, res) => {
  try {
    const {
      name,
      locationId,
      defaultPrice,
      defaultCount,
      status,
      description,
      extraServices, // [{id, isRequired}]
      seasonalRates,
    } = req.body;

    if (!name || !locationId) {
      return sendError(
        res,
        {},
        "name and locationId are required.",
        CODES.BAD_REQUEST
      );
    }

    // location must exist
    const location = await ParkingLocation.findById(locationId).select("_id");
    if (!location) {
      return sendError(res, {}, "Invalid locationId.", CODES.BAD_REQUEST);
    }

    // prevent duplicate (same location + name, case-insensitive)
    const dup = await ParkingSpace.findOne({
      locationId,
      name: { $regex: new RegExp(`^${String(name).trim()}$`, "i") },
    }).select("_id");
    if (dup) {
      return sendError(
        res,
        {},
        "Parking space with this name already exists for the selected location.",
        CODES.BAD_REQUEST
      );
    }

    const doc = await ParkingSpace.create({
      name: String(name).trim(),
      locationId,
      description: description ? String(description).trim() : undefined,
      defaultPrice: Number(defaultPrice) || 0,
      defaultCount: Number(defaultCount) || 0,
      status: parseBool(status, true),
      seasonalRates: seasonalRates ?? [],
      assignedExtras: normalizeExtras(extraServices),
    });

    return sendSuccess(res, doc, "Parking space created.", CODES.CREATED);
  } catch (err) {
    console.error("Create Parking Space Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

/* --------------------------- UPDATE -------------------------- */
parkingSpacesController.updateParkingSpace = async (req, res) => {
  try {
    const { spaceId } = req.params;
    const {
      name,
      locationId,
      defaultPrice,
      defaultCount,
      status,
      description,
      extraServices, // replace whole list if provided
      seasonalRates,
    } = req.body;

    const space = await ParkingSpace.findById(spaceId);
    if (!space) {
      return sendError(res, {}, "Parking space not found.", CODES.NOT_FOUND);
    }

    // if locationId provided, validate it
    if (locationId) {
      const loc = await ParkingLocation.findById(locationId).select("_id");
      if (!loc) {
        return sendError(res, {}, "Invalid locationId.", CODES.BAD_REQUEST);
      }
      space.locationId = locationId;
    }

    if (name) space.name = String(name).trim();
    if (description !== undefined)
      space.description = description ? String(description).trim() : "";

    if (defaultPrice !== undefined)
      space.defaultPrice = Number(defaultPrice) || 0;
    if (defaultCount !== undefined)
      space.defaultCount = Number(defaultCount) || 0;
    if (status !== undefined) space.status = !!status;
    if (seasonalRates !== undefined) space.seasonalRates = seasonalRates;

    if (extraServices !== undefined) {
      space.assignedExtras = normalizeExtras(extraServices);
    }

    // enforce duplicate rule (same location + name)
    const dup = await ParkingSpace.findOne({
      _id: { $ne: space._id },
      locationId: space.locationId,
      name: { $regex: new RegExp(`^${space.name}$`, "i") },
    }).select("_id");
    if (dup) {
      return sendError(
        res,
        {},
        "Another parking space with this name exists for the selected location.",
        CODES.BAD_REQUEST
      );
    }

    await space.save();

    return sendSuccess(res, space, "Parking space updated.", CODES.OK);
  } catch (err) {
    console.error("Update Parking Space Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

/* --------------------------- DELETE -------------------------- */
parkingSpacesController.deleteParkingSpace = async (req, res) => {
  try {
    const { spaceId } = req.params;

    const deleted = await ParkingSpace.findByIdAndDelete(spaceId);
    if (!deleted) {
      return sendError(res, {}, "Parking space not found.", CODES.NOT_FOUND);
    }

    return sendSuccess(res, {}, "Parking space deleted.", CODES.OK);
  } catch (err) {
    console.error("Delete Parking Space Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

/* ------------------------- TOGGLE STATUS --------------------- */
parkingSpacesController.toggleParkingSpaceStatus = async (req, res) => {
  try {
    const { spaceId } = req.params;

    const current = await ParkingSpace.findById(spaceId).select("status");
    if (!current) {
      return sendError(res, {}, "Parking space not found.", CODES.NOT_FOUND);
    }

    const updated = await ParkingSpace.findByIdAndUpdate(
      spaceId,
      { $set: { status: !current.status } },
      { new: true }
    );

    return sendSuccess(
      res,
      updated,
      `Parking space ${updated.status ? "activated" : "deactivated"}.`,
      CODES.OK
    );
  } catch (err) {
    console.error("Toggle Parking Space Status Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

/* ---------------------------- LIST --------------------------- */
// Replaces your old getAll (no sync). Supports filters & pagination.
parkingSpacesController.getAllParkingSpaces = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = "",
      status, // "active" | "inactive" | undefined
      locationId, // optional
    } = req.query;

    const q = {};

    if (locationId && mongoose.Types.ObjectId.isValid(locationId)) {
      q.locationId = locationId;
    }

    if (status === "Active") q.status = true;
    if (status === "Inactive") q.status = false;

    if (search?.trim()) {
      q.$or = [
        { name: { $regex: new RegExp(search.trim(), "i") } },
        // also search by location name via populate match
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Build the query
    const baseQuery = ParkingSpace.find(q)
      .populate({ path: "locationId", select: "name" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const [items, total] = await Promise.all([
      baseQuery.exec(),
      ParkingSpace.countDocuments(q),
    ]);

    // If searching on location name, post-filter (since regex on populate isn't direct)
    let data = items;
    if (search?.trim()) {
      const term = search.trim().toLowerCase();
      data = items.filter(
        (s) =>
          s.name?.toLowerCase().includes(term) ||
          s.locationId?.name?.toLowerCase().includes(term)
      );
    }

    return sendSuccess(
      res,
      {
        spaces: data,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.max(1, Math.ceil(total / Number(limit))),
        },
      },
      "Parking spaces fetched successfully.",
      CODES.OK
    );
  } catch (err) {
    console.error("Fetch Parking Spaces Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

export default parkingSpacesController;

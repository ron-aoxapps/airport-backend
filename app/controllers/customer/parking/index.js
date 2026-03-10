import { sendSuccess, sendError } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import ParkingLocation from "../../../models/parkingLocations.js";
import ParkingSpace from "../../../models/parkingSpaces.js";

export const parkingController = {};

// ----------------- GET ALL PARKING LOCATIONS -----------------
parkingController.getAllParkingLocations = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10 } = req.query;

    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { address: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    query.status = true;

    const skip = (Number(page) - 1) * Number(limit);

    const [locations, total] = await Promise.all([
      ParkingLocation.find(query)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 }),
      ParkingLocation.countDocuments(query),
    ]);

    return sendSuccess(
      res,
      {
        locations,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      "Parking locations fetched successfully.",
      CODES.OK
    );
  } catch (err) {
    console.error("Get Parking Locations Error:", err);
    return sendError(res, err);
  }
};

// ----------------- GET ALL PARKING SPACES -----------------
parkingController.getAllParkingSpaces = async (req, res) => {
  try {
    const { locationId } = req.query;
    const filter = locationId ? { locationId } : {};
    filter.status = true;

    const spaces = await ParkingSpace.find(filter)
      .populate("locationId", "name")
      .populate({
        path: "assignedExtras.extra",
        model: "Extra",
        select:
          "name description price isQuantityBased minQuantity maxQuantity status", // adjust fields as needed
      })
      .lean();

    // (Optional) drop any extras that were deleted and now resolve to null
    const sanitized = spaces.map((s) => ({
      ...s,
      assignedExtras: (s.assignedExtras || []).filter((x) => x?.extra),
    }));

    return sendSuccess(
      res,
      sanitized,
      "Parking spaces fetched successfully.",
      CODES.OK
    );
  } catch (err) {
    console.error("Fetch Parking Spaces Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

// ----------------- GET EXTRA SERVICES -----------------
parkingController.getExtraServices = async (req, res) => {
  try {
    const { parkingSpaceId } = req.query;

    if (!parkingSpaceId) {
      return sendError(res, "parkingSpaceId is required", CODES.BAD_REQUEST);
    }

    const space = await ParkingSpace.findById(parkingSpaceId)
      .populate("locationId", "name")
      .populate("assignedExtras.extra"); // ✅ populate extras

    if (!space) {
      return sendError(res, "Parking space not found", CODES.NOT_FOUND);
    }

    return sendSuccess(
      res,
      space,
      "Parking space and extras fetched successfully.",
      CODES.OK
    );
  } catch (err) {
    console.error("Fetch Parking Space Extras Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

export default parkingController;

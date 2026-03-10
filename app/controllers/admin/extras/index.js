import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import Extra from "../../../models/Extras.js";

const extrasController = {};

// ----------------- CREATE EXTRA -----------------
extrasController.createExtra = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      isQuantityBased,
      minQuantity,
      maxQuantity,
    } = req.body;

    if (!name || price == null) {
      return sendError(res, "Name and price are required.", CODES.BAD_REQUEST);
    }

    const extra = await Extra.create({
      name,
      description,
      price,
      isQuantityBased,
      minQuantity,
      maxQuantity,
    });

    return sendSuccess(
      res,
      extra,
      "Extra created successfully.",
      CODES.CREATED
    );
  } catch (err) {
    console.error("Create Extra Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

// ----------------- GET ALL EXTRAS -----------------
extrasController.getAllExtras = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10, status } = req.query;

    const query = search ? { name: { $regex: search, $options: "i" } } : {};

    if (status === "Active") query.status = true;
    if (status === "Inactive") query.status = false;

    const skip = (Number(page) - 1) * Number(limit);

    const [extras, total] = await Promise.all([
      Extra.find(query).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
      Extra.countDocuments(query),
    ]);

    return sendSuccess(
      res,
      {
        extras,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      "Extras fetched successfully.",
      CODES.OK
    );
  } catch (err) {
    console.error("Get All Extras Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

// ----------------- GET SINGLE EXTRA -----------------
extrasController.getExtraById = async (req, res) => {
  try {
    const { id } = req.params;

    const extra = await Extra.findById(id);
    if (!extra) {
      return sendError(res, "Extra not found.", CODES.NOT_FOUND);
    }

    return sendSuccess(res, extra, "Extra fetched successfully.", CODES.OK);
  } catch (err) {
    console.error("Get Extra Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

// ----------------- UPDATE EXTRA -----------------
extrasController.updateExtra = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const extra = await Extra.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!extra) {
      return sendError(res, "Extra not found.", CODES.NOT_FOUND);
    }

    return sendSuccess(res, extra, "Extra updated successfully.", CODES.OK);
  } catch (err) {
    console.error("Update Extra Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

extrasController.toggleExtraStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const location = await Extra.findById(id);
    if (!location) {
      return sendError(res, {}, "Service not found.", CODES.NOT_FOUND);
    }

    location.status = !location.status;
    await location.save();

    return sendSuccess(
      res,
      location,
      `Parking Service ${
        location.isActive ? "activated" : "deactivated"
      } successfully.`,
      CODES.OK
    );
  } catch (err) {
    console.error("Toggle Parking Service Error:", err);
    return sendError(res, err);
  }
};

// ----------------- DELETE EXTRA -----------------
extrasController.deleteExtra = async (req, res) => {
  try {
    const { id } = req.params;

    const extra = await Extra.findByIdAndDelete(id);
    if (!extra) {
      return sendError(res, "Extra not found.", CODES.NOT_FOUND);
    }

    return sendSuccess(res, {}, "Extra deleted successfully.", CODES.OK);
  } catch (err) {
    console.error("Delete Extra Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

// ----------------- DELETE EXTRA -----------------
extrasController.getAllExtraWithoutPagination = async (req, res) => {
  try {
    const extras = await Extra.find();

    return sendSuccess(
      res,
      { extras },
      "Extra services fetched successfully.",
      CODES.OK
    );
  } catch (err) {
    console.error("Delete Extra Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};
export default extrasController;

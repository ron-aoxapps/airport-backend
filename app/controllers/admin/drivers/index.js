import User from "../../../models/User.js";
import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import bcrypt from "bcrypt";
import { uploadToS3 } from "../../../utils/uploadToS3.js";
import { DRIVER_OFFLINE, TRIP_FINDING } from "../../../constants/index.js";
import * as constants from "../../../constants/index.js";

const driverController = {};

driverController.getAlldriver = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortBy = "createdAt",
      sortOrder = -1,
    } = req.query;

    const filter = { role: "driver" };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    const driverMembers = await User.find(filter)
      .sort({ [sortBy]: parseInt(sortOrder) })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    return sendSuccess(
      res,
      {
        driver: driverMembers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      "driver members fetched successfully",
    );
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to fetch driver members",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.getAllOnlinedriver = async (req, res) => {
  try {
    const { search = "", sortBy = "createdAt", sortOrder = -1 } = req.query;

    const filter = {
      role: "driver",
      driverStatus: { $ne: DRIVER_OFFLINE },
      isVerified: true,
    };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    const driverMembers = await User.find(filter).sort({
      [sortBy]: parseInt(sortOrder),
    });

    const total = await User.countDocuments(filter);

    return sendSuccess(
      res,
      {
        driver: driverMembers,
      },
      "driver members fetched successfully",
    );
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to fetch driver members",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.getAvailableDrivers = async (req, res) => {
  try {
    const drivers = await User.find({
      role: "driver",
      driverStatus: constants.DRIVER_FINDING_TRIPS,
      isVerified: true,
    }).select(
      "_id name email phoneNumber countryCode profilePicture driverStatus",
    );

    return sendSuccess(
      res,
      drivers,
      "Available drivers fetched successfully",
      CODES.OK,
    );
  } catch (err) {
    console.error("getAvailableDrivers error:", err);
    return sendError(
      res,
      {},
      "Failed to fetch available drivers",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.toggledriverStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await User.findById(id);
    if (!driver) {
      return sendError(res, null, "driver member not found", CODES.NOT_FOUND);
    }

    driver.status = driver.status === "active" ? "inactive" : "active";
    await driver.save();

    return sendSuccess(res, { driver }, "driver status updated successfully");
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to update driver status",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.verifyDriver = async (req, res) => {
  try {
    const { id } = req.params;

    const driver = await User.findById(id);
    if (!driver) {
      return sendError(res, null, "driver member not found", CODES.NOT_FOUND);
    }

    driver.isVerified = true;
    await driver.save();

    return sendSuccess(res, { driver }, "driver status updated successfully");
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to update driver status",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.updatedriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phoneNumber, address, countryCode, country } =
      req.body;
    const profilePicture = req.file ? await uploadToS3(req.file) : null;

    const driver = await User.findById(id);
    if (!driver) {
      return sendError(res, null, "driver not found", CODES.NOT_FOUND);
    }

    // Check if email already exists for another user
    if (email) {
      const emailExists = await User.findOne({ email, _id: { $ne: id } });
      if (emailExists) {
        return sendError(res, {}, "Email already exists", CODES.CONFLICT);
      }
    }

    if (phoneNumber && countryCode) {
      const phoneExists = await User.findOne({
        phoneNumber,
        countryCode,
        _id: { $ne: id },
      });
      if (phoneExists) {
        return sendError(
          res,
          {},
          "Phone number already exists",
          CODES.CONFLICT,
        );
      }
    }

    // --- Update only provided fields ---
    if (name) driver.name = name;
    if (email) driver.email = email;
    if (phoneNumber) driver.phoneNumber = phoneNumber;
    if (address) driver.address = address;
    if (countryCode) driver.countryCode = countryCode;
    if (profilePicture) driver.profilePicture = profilePicture;
    if (country) driver.country = country;

    await driver.save();

    return sendSuccess(res, { driver }, "driver updated successfully");
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to update driver",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.getAlldriverWithoutPagination = async (req, res) => {
  try {
    const driverMembers = await User.find({
      status: "active",
      role: "driver",
    }).sort({
      createdAt: -1,
    });

    return sendSuccess(
      res,
      {
        driver: driverMembers,
      },
      "driver members fetched successfully",
    );
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to fetch driver members",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.adddriver = async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNumber,
      address,
      countryCode,
      country,
      password,
    } = req.body;
    const profilePicture = req.file ? await uploadToS3(req.file) : null;

    // --- Required field validation ---
    if (!name || !email || !phoneNumber || !countryCode || !address) {
      return sendError(
        res,
        {},
        "All required fields must be provided.",
        CODES.BAD_REQUEST,
      );
    }

    // --- Uniqueness checks ---
    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return sendError(res, {}, "Email already exists.", CODES.CONFLICT);
    }

    const phoneExists = await User.findOne({ phoneNumber, countryCode });
    if (phoneExists) {
      return sendError(res, {}, "Phone number already exists.", CODES.CONFLICT);
    }

    const hashpassword = await bcrypt.hash(password, 10);

    // --- Create new driver ---
    const driver = await User.create({
      name,
      email,
      phoneNumber,
      address,
      countryCode,
      role: "driver",
      profilePicture,
      country,
      isVerified: true,
      isNumberVerified: true,
      password: hashpassword,
    });

    return sendSuccess(
      res,
      { driver },
      "driver added successfully.",
      CODES.CREATED,
    );
  } catch (error) {
    console.error("Add driver Error:", error);
    return sendError(
      res,
      error,
      "Failed to add driver",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

driverController.getdriverById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, null, "driver ID is required", CODES.BAD_REQUEST);
    }

    const driver = await User.findById(id);

    if (!driver) {
      return sendError(res, null, "driver not found", CODES.NOT_FOUND);
    }

    return sendSuccess(res, { driver }, "driver member fetched successfully");
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to fetch driver member",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

export default driverController;

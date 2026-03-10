import User from "../../../models/User.js";
import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import bcrypt from "bcrypt";
import { uploadToS3 } from "../../../utils/uploadToS3.js";

const customerController = {};

customerController.getAllCustomer = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sortBy = "createdAt",
      sortOrder = -1,
    } = req.query;

    const filter = { role: "user" };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
      ];
    }

    const CustomerMembers = await User.find(filter)
      .sort({ [sortBy]: parseInt(sortOrder) })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);

    return sendSuccess(
      res,
      {
        customer: CustomerMembers,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      "Customer members fetched successfully",
    );
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to fetch Customer members",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

customerController.toggleCustomerStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await User.findById(id);
    if (!customer) {
      return sendError(res, null, "Customer member not found", CODES.NOT_FOUND);
    }

    customer.status = customer.status === "active" ? "inactive" : "active";
    await customer.save();

    return sendSuccess(
      res,
      { customer },
      "Customer status updated successfully",
    );
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to update Customer status",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

customerController.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phoneNumber, address, countryCode, country } =
      req.body;
    const profilePicture = req.file ? await uploadToS3(req.file) : null;

    const customer = await User.findById(id);
    if (!customer) {
      return sendError(res, null, "Customer not found", CODES.NOT_FOUND);
    }

    // Check if email already exists for another user
    if (email) {
      const emailExists = await User.findOne({ email, _id: { $ne: id } });
      if (emailExists) {
        return sendError(res, {}, "Email already exists", CODES.CONFLICT);
      }
    }

    // Check if phoneNumber + countryCode combination exists for another user
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
    if (name) customer.name = name;
    if (email) customer.email = email;
    if (phoneNumber) customer.phoneNumber = phoneNumber;
    if (address) customer.address = address;
    if (countryCode) customer.countryCode = countryCode;
    if (profilePicture) customer.profilePicture = profilePicture;
    if (country) customer.country = country;

    await customer.save();

    return sendSuccess(res, { customer }, "Customer updated successfully");
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to update customer",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

customerController.getAllCustomerWithoutPagination = async (req, res) => {
  try {
    const CustomerMembers = await User.find({
      status: "active",
      role: "user",
    }).sort({
      createdAt: -1,
    });

    return sendSuccess(
      res,
      {
        Customer: CustomerMembers,
      },
      "Customer members fetched successfully",
    );
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to fetch Customer members",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

customerController.addCustomer = async (req, res) => {
  try {
    const { name, email, phoneNumber, address, countryCode, country } =
      req.body;

    const profilePicture = req.file ? await uploadToS3(req.file) : null;

    /* ================= REQUIRED VALIDATION ================= */

    if (!name || !email) {
      return sendError(
        res,
        {},
        "Name and email are required.",
        CODES.BAD_REQUEST,
      );
    }

    /* ================= EMAIL UNIQUENESS ================= */

    const emailExists = await User.findOne({ email });
    if (emailExists) {
      return sendError(res, {}, "Email already exists.", CODES.CONFLICT);
    }

    /* ================= PHONE UNIQUENESS (ONLY IF PROVIDED) ================= */

    if (phoneNumber && countryCode) {
      const phoneExists = await User.findOne({
        phoneNumber,
        countryCode,
      });

      if (phoneExists) {
        return sendError(
          res,
          {},
          "Phone number already exists.",
          CODES.CONFLICT,
        );
      }
    }

    /* ================= CREATE CUSTOMER ================= */

    const customerData = {
      name,
      email,
      address,
      role: "user",
      profilePicture,
      country,
      isVerified: true,
      isNumberVerified: true, // true only if phone provided
    };

    // Add optional fields only if present
    if (phoneNumber) customerData.phoneNumber = phoneNumber;
    if (countryCode) customerData.countryCode = countryCode;

    const customer = await User.create(customerData);

    return sendSuccess(
      res,
      { customer },
      "Customer added successfully.",
      CODES.CREATED,
    );
  } catch (error) {
    console.error("Add Customer Error:", error);
    return sendError(
      res,
      error,
      "Failed to add customer",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

customerController.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return sendError(res, null, "Customer ID is required", CODES.BAD_REQUEST);
    }

    const Customer = await User.findById(id);

    if (!Customer) {
      return sendError(res, null, "Customer not found", CODES.NOT_FOUND);
    }

    return sendSuccess(
      res,
      { Customer },
      "Customer member fetched successfully",
    );
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to fetch Customer member",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

export default customerController;

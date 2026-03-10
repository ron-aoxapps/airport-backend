import { sendSuccess, sendError } from "../../utils/responseHandler.js";
import { CODES } from "../../utils/statusCodes.js";
import User from "../../models/User.js";
import bcrypt from "bcryptjs";
import { uploadToS3 } from "../../utils/uploadToS3.js";

const commanController = {};

commanController.getUser = async (req, res) => {
  try {
    const userId = req.userId;

    let user = await User.findById(userId);

    if (!user) {
      return sendError(res, {}, "User not found", CODES.NOT_FOUND);
    }

    return sendSuccess(res, user, "User get successfully", CODES.OK);
  } catch (err) {
    return sendError(res, err);
  }
};

commanController.updateUser = async (req, res) => {
  try {
    const userId = req.userId;
    const updates = { ...req.body };
    const image = req.file;

    console.log(req.body, "hhhhhh", req.file);

    if (image) {
      updates.profilePicture = await uploadToS3(image);
    }

    delete updates.role;

    let user = await User.findById(userId);
    if (!user) {
      return sendError(res, {}, "User not found", CODES.NOT_FOUND);
    }

    if (updates.email) {
      const existingEmail = await User.findOne({
        email: updates.email,
        _id: { $ne: userId },
      });
      if (existingEmail) {
        return sendError(res, {}, "Email already in use.", CODES.BAD_REQUEST);
      }
    }

    if (updates.phoneNumber && updates.countryCode) {
      const existingPhone = await User.findOne({
        phoneNumber: updates.phoneNumber,
        countryCode: updates.countryCode,
        _id: { $ne: userId },
      });
      if (existingPhone) {
        return sendError(
          res,
          {},
          "Phone number already in use.",
          CODES.BAD_REQUEST,
        );
      }
    }

    Object.assign(user, updates);
    await user.save();

    return sendSuccess(res, user, "User updated successfully", CODES.OK);
  } catch (err) {
    console.error("Update User Error:", err);
    return sendError(res, err);
  }
};

commanController.updatePassword = async (req, res) => {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(
        res,
        {},
        "Current password and new password are required.",
        CODES.BAD_REQUEST,
      );
    }

    if (newPassword.length < 8) {
      return sendError(
        res,
        {},
        "Password must be at least 8 characters long.",
        CODES.BAD_REQUEST,
      );
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      return sendError(res, {}, "User not found.", CODES.NOT_FOUND);
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return sendError(
        res,
        {},
        "Current password is incorrect.",
        CODES.BAD_REQUEST,
      );
    }

    user.password = await bcrypt.hash(newPassword, 10);

    await user.save();

    return sendSuccess(res, {}, "Password updated successfully.", CODES.OK);
  } catch (error) {
    console.error("Update Password Error:", error);
    return sendError(res, error);
  }
};

export default commanController;

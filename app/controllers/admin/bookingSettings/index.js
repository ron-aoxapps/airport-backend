import BookingSettings from "../../../models/BookingSettings.js";
import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";

const bookingSettingsController = {};

bookingSettingsController.upsertBookingSettings = async (req, res) => {
  try {
    const data = req.body;

    // Check if settings exist
    let settings = await BookingSettings.findOne();

    if (settings) {
      // Update existing settings
      settings = await BookingSettings.findByIdAndUpdate(
        settings._id,
        { $set: data },
        { new: true }
      );

      return sendSuccess(
        res,
        settings,
        "Booking settings updated successfully"
      );
    } else {
      // Create new settings
      const newSettings = new BookingSettings(data);
      await newSettings.save();

      return sendSuccess(
        res,
        newSettings,
        "Booking settings created successfully",
        CODES.CREATED
      );
    }
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to save booking settings",
      CODES.INTERNAL_SERVER_ERROR
    );
  }
};

bookingSettingsController.getBookingSettings = async (req, res) => {
  try {
    const settings = await BookingSettings.findOne();

    return sendSuccess(
      res,
      settings || {},
      "Booking settings fetched successfully"
    );
  } catch (err) {
    return sendError(
      res,
      err,
      "Failed to fetch booking settings",
      CODES.INTERNAL_SERVER_ERROR
    );
  }
};

export default bookingSettingsController;

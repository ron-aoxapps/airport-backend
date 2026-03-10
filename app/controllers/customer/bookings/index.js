import { sendSuccess, sendError } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import Booking from "../../../models/Booking.js";
import User from "../../../models/User.js";
import ParkingSpace from "../../../models/parkingSpaces.js";

const bookingController = {};

bookingController.getAllBookings = async (req, res) => {
  try {
    const userId = req.userId;
    const user = await User.findById(userId).lean();

    if (!user) {
      return sendError(res, "User not found.", CODES.NOT_FOUND);
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const bookings = await Booking.find({
      $and: [
        {
          $or: [
            { "customer.email": user.email },
            { "customer.phone": user.phoneNumber },
          ],
        },
        { from: { $gte: now } },
        { tripId: null },
      ],
    })
      .populate("parkingSpaceId", "name location defaultPrice")
      .sort({ to: 1 })
      .lean();

    // For bookings without parkingSpaceId, find it by matching space_name
    const enrichedBookings = await Promise.all(
      bookings.map(async (booking) => {
        if (!booking.parkingSpaceId && booking.space_name) {
          // Find parking space by name
          const parkingSpace = await ParkingSpace.findOne({
            name: booking.space_name,
          })
            .select("_id name location defaultPrice")
            .lean();

          if (parkingSpace) {
            // Update the booking with the found parkingSpaceId
            await Booking.findByIdAndUpdate(booking._id, {
              parkingSpaceId: parkingSpace._id,
            });

            // Attach parkingSpace details to the response
            booking.parkingSpaceId = parkingSpace;
          }
        }
        return booking;
      })
    );

    return sendSuccess(
      res,
      enrichedBookings,
      "Bookings fetched successfully.",
      CODES.OK
    );
  } catch (err) {
    console.error("Get Bookings Error:", err);
    return sendError(res, err);
  }
};

export default bookingController;

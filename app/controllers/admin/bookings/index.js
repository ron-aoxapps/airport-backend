import Booking from "../../../models/Booking.js";
import mongoose from "mongoose";

const bookingController = {};

bookingController.listBookings = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      from = "",
      to = "",
      sort = "-source_created_at,-createdAt",
    } = req.query;

    page = Math.max(parseInt(page, 10) || 1, 1);
    limit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);

    const q = {};

    // Search across key fields
    if (search) {
      const term = String(search).trim();
      const isMongoId = mongoose.Types.ObjectId.isValid(term);
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          term,
        );

      const orConditions = [
        { externalBookingId: new RegExp(term, "i") },
        { txn_id: new RegExp(term, "i") },
        { "customer.name": new RegExp(term, "i") },
        { "customer.email": new RegExp(term, "i") },
        { "customer.phone": new RegExp(term, "i") },
        { "vehicle.make": new RegExp(term, "i") },
        { "vehicle.model": new RegExp(term, "i") },
        { "vehicle.regno": new RegExp(term, "i") },
      ];

      /* =========================================
     1️⃣ Search Drivers (User)
  ========================================= */

      const users = await mongoose
        .model("User")
        .find({
          $or: [
            { name: { $regex: term, $options: "i" } },
            { email: { $regex: term, $options: "i" } },
          ],
        })
        .select("_id");

      if (users.length) {
        const userIds = users.map((u) => u._id);

        const trips = await mongoose
          .model("Trip")
          .find({
            $or: [
              { driverId: { $in: userIds } },
              { returnDriverId: { $in: userIds } },
            ],
          })
          .select("_id");

        if (trips.length) {
          const tripIds = trips.map((t) => t._id);
          orConditions.push({ tripId: { $in: tripIds } });
        }
      }

      /* =========================================
     2️⃣ Direct Trip Search (MongoId / UUID)
  ========================================= */

      if (isMongoId) {
        orConditions.push({ tripId: term });
      }

      if (isUUID) {
        const tripsByUUID = await mongoose
          .model("Trip")
          .find({
            tripUUID: term, // change to your UUID field
          })
          .select("_id");

        if (tripsByUUID.length) {
          const tripIds = tripsByUUID.map((t) => t._id);
          orConditions.push({ tripId: { $in: tripIds } });
        }
      }

      q.$or = orConditions;
    }
    // Filter by status (optional)
    if (status) {
      q.status = status;
    }

    // Date range over "from" .. "to"
    if (from || to) {
      q.$and = q.$and || [];
      const range = {};
      if (from) range.$gte = new Date(from);
      if (to) range.$lte = new Date(to);
      q.$and.push({ from: range });
    }

    // Sort parser (comma separated fields, prefix '-' for desc)
    const sortObj = {};
    if (String(sort).trim()) {
      String(sort)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((f) => {
          if (f.startsWith("-")) sortObj[f.slice(1)] = -1;
          else sortObj[f] = 1;
        });
    }

    const [items, total] = await Promise.all([
      Booking.find(q)
        .populate({
          path: "tripId",
          populate: [
            {
              path: "driverId",
              model: "User",
              select:
                "_id name email countryCode phoneNumber profilePicture location driverStatus",
            },
            {
              path: "returnDriverId",
              model: "User",
              select:
                "_id name email countryCode phoneNumber profilePicture location driverStatus",
            },
          ],
        })
        .sort(sortObj)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Booking.countDocuments(q),
    ]);

    return res.json({
      success: true,
      data: {
        bookings: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

bookingController.getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }

    const doc = await Booking.findById(id)
      .populate({
        path: "tripId",
        populate: [
          {
            path: "driverId",
            model: "User",
            select:
              "_id name email countryCode phoneNumber profilePicture location driverStatus",
          },
          {
            path: "returnDriverId",
            model: "User",
            select:
              "_id name email countryCode phoneNumber profilePicture location driverStatus",
          },
        ],
      })
      .lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export default bookingController;

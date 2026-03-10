import Notification from "../../../models/Notification.js";
import { CODES } from "../../../utils/statusCodes.js";
import { sendSuccess, sendError } from "../../../utils/responseHandler.js";
import Trip from "../../../models/Trips.js";
import User from "../../../models/User.js";

const notificationController = {};

notificationController.getAllNotifications = async (req, res) => {
  try {
    const userId = req.userId;
    const subAdminId = req.subAdminId;

    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    if (!userId && !subAdminId) {
      return sendError(
        res,
        {},
        "userId or subAdminId is required",
        CODES.BAD_REQUEST,
      );
    }

    const filter = {};
    if (userId) filter.userId = userId;
    if (subAdminId) filter.subAdminId = subAdminId;

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const total = await Notification.countDocuments(filter);

    // Extract unique tripIds and userIds from meta
    const tripIds = [];
    const metaUserIds = [];

    notifications.forEach((n) => {
      if (n.meta?.tripId) tripIds.push(n.meta.tripId);
      if (n.meta?.userId) metaUserIds.push(n.meta.userId);
    });

    // Fetch related data in bulk
    const [trips, users] = await Promise.all([
      Trip.find({ _id: { $in: tripIds } })
        .select("tripStatus")
        .lean(),
      User.find({ _id: { $in: metaUserIds } })
        .select("name email profilePicture")
        .lean(),
    ]);

    // Convert to map for fast lookup
    const tripMap = {};
    trips.forEach((t) => {
      tripMap[t._id.toString()] = t;
    });

    const userMap = {};
    users.forEach((u) => {
      userMap[u._id.toString()] = u;
    });

    // Attach data back to notifications
    const enrichedNotifications = notifications.map((n) => {
      const tripData = n.meta?.tripId
        ? tripMap[n.meta.tripId.toString()]
        : null;

      const userData = n.meta?.userId
        ? userMap[n.meta.userId.toString()]
        : null;

      return {
        ...n,
        meta: {
          ...n.meta,
          trip: tripData || null,
          user: userData || null,
        },
      };
    });

    return sendSuccess(
      res,
      {
        notifications: enrichedNotifications,
        pagination: {
          total,
          page,
          totalPages: Math.ceil(total / limit),
        },
      },
      "Notifications fetched successfully",
    );
  } catch (err) {
    return sendError(res, err, "Failed to fetch notifications");
  }
};

notificationController.getUnreadNotificationCount = async (req, res) => {
  try {
    const userId = req.userId;
    const subAdminId = req.subAdminId;

    if (!userId && !subAdminId) {
      return sendError(
        res,
        {},
        "userId or subAdminId is required",
        CODES.BAD_REQUEST,
      );
    }

    const filter = {
      isRead: false,
    };
    if (userId) filter.userId = userId;
    if (subAdminId) filter.subAdminId = subAdminId;

    const count = await Notification.countDocuments(filter);

    return sendSuccess(
      res,
      {
        count,
      },
      "Unread notification count fetched successfully",
    );
  } catch (err) {
    return sendError(res, err, "Failed to fetch unread count");
  }
};

notificationController.markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    if (!notificationId) {
      return sendError(
        res,
        {},
        "notificationId is required",
        CODES.BAD_REQUEST,
      );
    }

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      {
        isRead: true,
      },
      {
        new: true,
      },
    );

    if (!notification) {
      return sendError(res, {}, "Notification not found", CODES.NOT_FOUND);
    }

    return sendSuccess(
      res,
      {
        notification,
      },
      "Notification marked as read",
    );
  } catch (err) {
    return sendError(res, err, "Error updating notification");
  }
};

notificationController.markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.userId;
    const subAdminId = req.subAdminId;

    if (!userId && !subAdminId) {
      return sendError(
        res,
        {},
        "userId or subAdminId is required",
        CODES.BAD_REQUEST,
      );
    }

    const filter = {};
    if (userId) filter.userId = userId;
    if (subAdminId) filter.subAdminId = subAdminId;

    const result = await Notification.updateMany(filter, {
      isRead: true,
    });
    return sendSuccess(
      res,
      {
        updatedCount: result.modifiedCount,
      },
      "All notifications marked as read",
    );
  } catch (err) {
    return sendError(res, err, "Failed to mark notifications as read");
  }
};

notificationController.createNotification = async (req, res) => {
  try {
    const { message, type, meta } = req.body;
    const userId = req.userId;

    if (!message) {
      return sendError(res, {}, "Message is required", CODES.BAD_REQUEST);
    }

    if (!userId) {
      return sendError(
        res,
        {},
        "Either userId or subAdminId is required",
        CODES.BAD_REQUEST,
      );
    }

    const newNotification = new Notification({
      userId: userId || null,
      message,
      type: type || "general",
      meta: meta || {},
    });

    await newNotification.save();

    const io = req.app.get("io");

    const room = userId ? `user_${userId}` : `subAdmin_${subAdminId}`;
    io.to(room).emit("receiveNotification", newNotification);

    return sendSuccess(
      res,
      {
        notification: newNotification,
      },
      "Notification created successfully",
    );
  } catch (error) {
    return sendError(res, error, "Failed to create notification");
  }
};

export default notificationController;

import User from "../models/User.js";
import Notification from "../models/Notification.js";

export const createAndEmitNotification = async (
  io,
  { message, userId, subAdminId, type = "general", meta = {} },
) => {
  if (!userId) {
    const allAdmins = await User.find({ role: "admin" });

    if (allAdmins.length > 0) {
      for (const admin of allAdmins) {
        const notification = await Notification.create({
          userId: admin._id,
          message,
          type,
          meta,
        });
        io.to(`${admin._id}`).emit("receiveNotification", notification);
      }
      return;
    }
  }

  // Notify single user or subAdmin
  const notification = await Notification.create({
    userId,
    message,
    type,
    meta,
  });

  const room = `${userId}`;
  io.to(room).emit("receiveNotification", notification);
};

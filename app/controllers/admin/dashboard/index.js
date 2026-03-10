import Trip from "../../../models/Trips.js";
import User from "../../../models/User.js";
import Booking from "../../../models/Booking.js";
import { sendSuccess, sendError } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";

const dashboardController = {};

dashboardController.getDashboardData = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    /* ================= DATE FILTER ================= */

    let dateFilter = {};

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      dateFilter = {
        createdAt: { $gte: start, $lte: end },
      };
    }

    /* ================= KPI COUNTS (FILTERED) ================= */

    const tripMatch = Object.keys(dateFilter).length ? { ...dateFilter } : {};

    const [
      totalUsers,
      totalDrivers,
      totalTrips,
      totalBookings,
      activeDrivers,
      onlineDrivers,
      completedTrips,
      cancelledTrips,
      activeTrips,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "driver" }),
      Trip.countDocuments(tripMatch),
      Booking.countDocuments(tripMatch),
      Trip.distinct("driverId", tripMatch).then((d) => d.length),
      User.countDocuments({ role: "driver", isOnline: true }),
      Trip.countDocuments({ ...tripMatch, tripStatus: "COMPLETED" }),
      Trip.countDocuments({ ...tripMatch, tripStatus: "CANCELLED" }),
      Trip.countDocuments({
        ...tripMatch,
        tripStatus: { $nin: ["COMPLETED", "CANCELLED"] },
      }),
    ]);

    /* ================= PERFORMANCE METRICS ================= */

    const completionRate =
      totalTrips > 0 ? ((completedTrips / totalTrips) * 100).toFixed(2) : 0;

    const driverUtilization =
      totalDrivers > 0 ? ((activeDrivers / totalDrivers) * 100).toFixed(2) : 0;

    const avgTripsPerDriver =
      activeDrivers > 0 ? (totalTrips / activeDrivers).toFixed(2) : 0;

    const avgTripsPerUser =
      totalUsers > 0 ? (totalTrips / totalUsers).toFixed(2) : 0;

    /* ================= MONTH-OVER-MONTH GROWTH ================= */

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59,
      999,
    );

    const [thisMonthTrips, lastMonthTrips] = await Promise.all([
      Trip.countDocuments({ createdAt: { $gte: thisMonthStart } }),
      Trip.countDocuments({
        createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
      }),
    ]);

    const tripGrowth =
      lastMonthTrips > 0
        ? (((thisMonthTrips - lastMonthTrips) / lastMonthTrips) * 100).toFixed(
            2,
          )
        : 0;

    /* ================= WEEKLY TREND (ALWAYS LAST 7 DAYS) ================= */

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);

    const weeklyAgg = await Trip.aggregate([
      { $match: { createdAt: { $gte: weekStart } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          trips: { $sum: 1 },
        },
      },
    ]);

    const weeklyMap = new Map();
    weeklyAgg.forEach((item) => weeklyMap.set(item._id, item.trips));

    const weeklyTrips = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const key = d.toISOString().split("T")[0];

      weeklyTrips.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        trips: weeklyMap.get(key) || 0,
      });
    }

    /* ================= TOP DRIVERS (FILTERED) ================= */

    const topDrivers = await Trip.aggregate([
      ...(Object.keys(dateFilter).length ? [{ $match: dateFilter }] : []),
      {
        $group: {
          _id: "$driverId",
          tripCount: { $sum: 1 },
        },
      },
      { $sort: { tripCount: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: "$driver" },
      {
        $project: {
          _id: 1,
          tripCount: 1,
          name: "$driver.name",
          email: "$driver.email",
        },
      },
    ]);

    /* ================= RECENT TRIPS ================= */

    const recentTrips = await Trip.find(tripMatch)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("customerId", "name email")
      .populate("driverId", "name email")
      .select("tripStatus createdAt");

    /* ================= RESPONSE ================= */

    return sendSuccess(
      res,
      {
        kpis: {
          totalUsers,
          totalDrivers,
          totalTrips,
          totalBookings,
          activeTrips,
          completedTrips,
          cancelledTrips,
          completionRate,
          onlineDrivers,
          driverUtilization,
          avgTripsPerDriver,
          avgTripsPerUser,
          tripGrowth,
        },
        weeklyTrips,
        topDrivers,
        recentTrips,
      },
      "Dashboard data fetched successfully",
      CODES.OK,
    );
  } catch (error) {
    console.error("Dashboard Error:", error);
    return sendError(
      res,
      error,
      "Failed to fetch dashboard data",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

export default dashboardController;

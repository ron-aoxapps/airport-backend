import Review from "../models/Review.js";

export async function updateUserRatingSummary(userId) {
  try {
    const agg = await Review.aggregate([
      { $match: { $or: [{ driverId: userId }, { customerId: userId }] } },
      // if you want “about this user” only, call this fn with either driverId or customerId intent
    ]);
    // For clarity, compute separately:
    const aboutUser = await Review.aggregate([
      { $match: { $or: [{ driverId: userId }, { customerId: userId }] } },
      { $group: { _id: null, avg: { $avg: "$rating" }, cnt: { $sum: 1 } } },
    ]);
    const { avg = 0, cnt = 0 } = aboutUser[0] || {};
    await User.findByIdAndUpdate(userId, {
      $set: { avgRating: avg, ratingsCount: cnt },
    }).catch(() => {});
  } catch (_) {}
}

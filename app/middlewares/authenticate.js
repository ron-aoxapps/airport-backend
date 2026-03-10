import jwt from "jsonwebtoken";
import { CODES } from "../utils/statusCodes.js";
import User from "../models/User.js";

export const authenticateJWT = (req, res, next) => {
  const authHeader = req.header("Authorization");

  if (authHeader) {
    const token = authHeader.split(" ")[1];
    if (!token) {
      return res
        .status(CODES.UNAUTHORIZED)
        .json({ message: "Unauthorized: Token not provided" });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        if (err.name === "TokenExpiredError") {
          return res
            .status(CODES.FORBIDDEN)
            .json({ message: "Forbidden: Token expired" });
        }
        return res
          .status(CODES.FORBIDDEN)
          .json({ message: "Forbidden: Invalid token" });
      }

      let user = await User.findById(decoded.userId);

      if (!user) {
        return res
          .status(CODES.UNAUTHORIZED)
          .json({ message: "Unauthorized: User not found" });
      }

      if (user.token !== token) {
        return res
          .status(CODES.FORBIDDEN)
          .json({ message: "Forbidden: Token mismatch, please login again" });
      }

      req.userId = user._id;
      req.role = user.role;
      next();
    });
  } else {
    res
      .status(CODES.UNAUTHORIZED)
      .json({ message: "Unauthorized: Authorization header not provided" });
  }
};

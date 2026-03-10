import { CODES } from "../utils/statusCodes.js";

export const authorizeRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.role || !allowedRoles.includes(req.role)) {
      return res.status(CODES.FORBIDDEN).json({
        message: "Access denied: You do not have the required permissions",
      });
    }
    next();
  };
};

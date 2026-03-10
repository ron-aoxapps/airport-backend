import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../../models/User.js";
import { sendVerificationSMS } from "../../utils/sendSMS.js";
import { CODES } from "../../utils/statusCodes.js";
import { sendSuccess, sendError } from "../../utils/responseHandler.js";
import { createAndEmitNotification } from "../../utils/sendNotification.js";
import dotenv from "dotenv";
import { upload } from "../../middlewares/multer.js";
import sendEmail from "../../utils/sendEmail.js";
import { uploadToS3 } from "../../utils/uploadToS3.js";
import { resetPasswordTemplate } from "../../helpers/emailtemplate.js";
import crypto from "crypto";

dotenv.config();

const authController = {};

// ----------------- SIGNUP -----------------
authController.signup = async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNumber,
      address,
      countryCode,
      role,
      country,
      password,
    } = req.body;

    // Basic validation
    if (!name || !email || !phoneNumber || !countryCode || !password) {
      return sendError(res, {}, "All fields are required.", CODES.BAD_REQUEST);
    }

    if (!["user", "driver"].includes(role)) {
      return sendError(
        res,
        {},
        "Invalid role. Must be 'user' or 'driver'.",
        CODES.BAD_REQUEST,
      );
    }

    // Check existing email
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return sendError(res, {}, "Email is already in use.", CODES.BAD_REQUEST);
    }

    // Check existing phone number
    const existingNumber = await User.findOne({ phoneNumber, countryCode });
    if (existingNumber) {
      return sendError(
        res,
        {},
        "Phone number already exist.",
        CODES.BAD_REQUEST,
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    let profilePicturePath = "";
    let drivingLicensePath = "";

    // Upload profile picture
    if (req.files?.profilePicture?.[0]) {
      profilePicturePath = await uploadToS3(req.files.profilePicture[0]);
    }

    // Driver specific validation
    if (role === "driver") {
      if (!req.files?.drivingLicense?.[0]) {
        return sendError(
          res,
          {},
          "Driving license image is required for drivers.",
          CODES.BAD_REQUEST,
        );
      }

      drivingLicensePath = await uploadToS3(req.files.drivingLicense[0]);
    }

    // Create user
    const user = await User.create({
      name,
      email,
      phoneNumber,
      countryCode,
      address: address || "",
      role,
      country,
      password: hashedPassword,
      profilePicture: profilePicturePath,
      drivingLicense: drivingLicensePath,
      status: "active",
    });

    // ================= ADMIN NOTIFICATION =================

    const io = req.app.get("io");

    const adminNotification = {
      type: "NEW_USER_SIGNUP",
      message:
        role === "driver"
          ? `New driver registered: ${name}`
          : `New user registered: ${name}`,
      meta: {
        userId: user._id,
        link: role === "driver" ? "/drivers" : "/customers",
      },
    };

    await createAndEmitNotification(io, adminNotification);

    return sendSuccess(
      res,
      { userId: user._id },
      "Signup completed successfully.",
      CODES.CREATED,
    );
  } catch (error) {
    console.error("Signup Error:", error);
    return sendError(res, {}, error.message, CODES.INTERNAL_SERVER_ERROR);
  }
};

// ----------------- LOGIN -----------------
authController.checkUser = async (req, res) => {
  try {
    const { phoneNumber, countryCode, country, role } = req.body;

    if (!phoneNumber || !countryCode || !country) {
      return sendError(
        res,
        {},
        "Phone number, country code, and country are required.",
        CODES.BAD_REQUEST,
      );
    }

    // Check if user exists
    let user = await User.findOne({
      phoneNumber,
      countryCode,
      country,
    });

    if (user) {
      if (user.isNumberVerified) {
        // User exists and verified, no action needed
        return sendSuccess(
          res,
          {},
          "User already exists and verified.",
          CODES.OK,
        );
      } else {
        // User exists but not verified, generate new OTP
        const verificationCode = Math.floor(
          1000 + Math.random() * 9000,
        ).toString();
        const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);

        user.verificationCode = verificationCode;
        user.verificationCodeExpires = verificationCodeExpires;
        await user.save();

        // await sendVerificationSMS(`${countryCode}${phoneNumber}`, verificationCode);

        return sendSuccess(
          res,
          { userId: user._id },
          "OTP sent to existing unverified user.",
          CODES.OK,
        );
      }
    } else {
      // User does not exist, create new
      const verificationCode = Math.floor(
        1000 + Math.random() * 9000,
      ).toString();
      const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);

      user = await User.create({
        phoneNumber,
        countryCode,
        country,
        role,
        verificationCode,
        verificationCodeExpires,
      });

      // await sendVerificationSMS(`${countryCode}${phoneNumber}`, verificationCode);

      return sendSuccess(
        res,
        { userId: user._id },
        "New user created and OTP sent successfully.",
        CODES.CREATED,
      );
    }
  } catch (error) {
    console.error("Check User (Send OTP) Error:", error);
    return sendError(res, error);
  }
};

authController.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(
        res,
        {},
        "Email and password are required.",
        CODES.BAD_REQUEST,
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return sendError(res, {}, "Invalid email.", CODES.BAD_REQUEST);
    }

    if (user.status === "inactive") {
      return sendError(
        res,
        {},
        "Your account is not active.",
        CODES.BAD_REQUEST,
      );
    }

    if (user.role === "driver" && !user.isVerified) {
      return sendError(
        res,
        {},
        "Your account is pending administrative verification.",
        CODES.BAD_REQUEST,
      );
    }

    if (!user.password) {
      return sendError(
        res,
        {},
        "Set your password for login.",
        CODES.BAD_REQUEST,
      );
    }

    // 2️⃣ Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return sendError(res, {}, "Password is incorrect.", CODES.BAD_REQUEST);
    }

    // 3️⃣ Generate JWT
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    user.token = token;
    await user.save();

    return sendSuccess(
      res,
      {
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          status: user.status,
        },
      },
      "Login successful.",
      CODES.OK,
    );
  } catch (error) {
    console.error("Login Error:", error);
    return sendError(res, error.message, CODES.INTERNAL_SERVER_ERROR);
  }
};

// ----------------- VERIFY OTP -----------------
authController.verifyLoginOTP = async (req, res) => {
  try {
    const { phoneNumber, countryCode, otp } = req.body;

    if (!phoneNumber || !countryCode || !otp) {
      return sendError(
        res,
        {},
        "Phone number, country code, and OTP are required.",
        CODES.BAD_REQUEST,
      );
    }

    const user = await User.findOne({
      phoneNumber,
      countryCode: countryCode,
    });
    if (!user) {
      return sendError(res, {}, "User not found.", CODES.NOT_FOUND);
    }

    if (!user.verificationCode || !user.verificationCodeExpires) {
      return sendError(
        res,
        {},
        "No OTP request found for this user.",
        CODES.BAD_REQUEST,
      );
    }

    if (user.verificationCode !== otp) {
      return sendError(res, {}, "Invalid OTP.", CODES.BAD_REQUEST);
    }

    if (user.verificationCodeExpires < new Date()) {
      return sendError(
        res,
        {},
        "OTP has expired. Please request a new one.",
        CODES.BAD_REQUEST,
      );
    }

    user.verificationCode = null;
    user.verificationCodeExpires = null;
    user.isNumberVerified = true;

    // const token = jwt.sign(
    //   { userId: user._id, role: user.role },
    //   process.env.JWT_SECRET,
    //   { expiresIn: "7d" }
    // );

    // user.token = token;
    await user.save();

    return sendSuccess(res, {}, "OTP Verified.", CODES.OK);
  } catch (error) {
    console.error("Verify Login OTP Error:", error);
    return sendError(res, error);
  }
};

// ----------------- RESEND OTP -----------------
authController.resendOTP = async (req, res) => {
  try {
    const { phoneNumber, countryCode } = req.body;

    if (!phoneNumber || !countryCode) {
      return sendError(
        res,
        {},
        "Phone number and country code are required.",
        CODES.BAD_REQUEST,
      );
    }

    const user = await User.findOne({
      phoneNumber,
      countryCode: countryCode,
    });
    if (!user) {
      return sendError(res, {}, "User not found.", CODES.NOT_FOUND);
    }

    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    const newExpires = new Date(Date.now() + 10 * 60 * 1000);

    user.verificationCode = newCode;
    user.verificationCodeExpires = newExpires;
    await user.save();

    // await sendVerificationSMS(`${countryCode}${phoneNumber}`, newCode);

    return sendSuccess(res, {}, "Verification code resent.", CODES.OK);
  } catch (err) {
    return sendError(res, err);
  }
};

// ----------------- VERIFY TOKEN -----------------
authController.verifyToken = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader)
    return sendError(res, {}, "No token provided", CODES.FORBIDDEN);

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { userId, role } = decoded;
    return sendSuccess(res, { userId, role }, "Valid token", CODES.OK);
  } catch {
    return sendError(res, {}, "Invalid or expired token", CODES.UNAUTHORIZED);
  }
};

// ----------------- ADMIN LOGIN -----------------
authController.adminLogin = async (req, res) => {
  try {
    let { email, password } = req.body;

    // Sanitize inputs
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    password = typeof password === "string" ? password.trim() : "";

    if (!email || !password) {
      return sendError(
        res,
        {},
        "Email and password required",
        CODES.BAD_REQUEST,
      );
    }

    const admin = await User.findOne({
      email: email,
      role: "admin",
    });

    if (!admin) {
      return sendError(res, {}, "You do not have access", CODES.BAD_REQUEST);
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return sendError(res, {}, "Invalid password", CODES.BAD_REQUEST);
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: admin._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    admin.token = token;
    await admin.save();

    // ================= ADMIN LOGIN NOTIFICATION =================
    try {
      const io = req.app.get("io");

      const adminNotification = {
        type: "ADMIN_LOGIN",
        message: `Admin logged in: ${admin.name}`,
        meta: {
          userId: admin._id,
          email: admin.email,
          loginAt: new Date(),
        },
      };

      await createAndEmitNotification(io, adminNotification);
    } catch (notifyErr) {
      console.error("Admin login notification error:", notifyErr.message);
    }

    return sendSuccess(
      res,
      {
        token,
        user: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
          phoneNumber: admin.phoneNumber,
          status: admin.status,
          role: "admin",
        },
      },
      "Login successful",
      CODES.OK,
    );
  } catch (err) {
    console.error("Admin login error:", err);
    return sendError(res, err);
  }
};

// ----------------- FORGOT PASSWORD: SEND OTP (email) -----------------
authController.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return sendError(res, {}, "Email is required.", CODES.BAD_REQUEST);
    }

    const user = await User.findOne({ email });
    if (!user)
      return sendSuccess(
        res,
        {},
        "You will get email regarding password reset if your account exists.",
        CODES.OK,
      );

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    user.passwordResetCode = code;
    user.passwordResetExpires = expires;
    await user.save();

    const subject = "Airport valley Password Reset OTP";

    const html = resetPasswordTemplate(code);

    try {
      await sendEmail({
        to: user.email,
        subject,
        html,
      });
    } catch (error) {
      console.log("Error in sending email", error);
    }

    return sendSuccess(
      res,
      {},
      "You will get email soon regarding password reset if your account exists.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Forgot Password Error:", err);
    return sendError(res, err);
  }
};

authController.verifyForgotOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return sendError(
        res,
        {},
        "Email and OTP are required.",
        CODES.BAD_REQUEST,
      );
    }

    const user = await User.findOne({ email });
    if (!user) return sendError(res, {}, "User not found.", CODES.NOT_FOUND);

    if (!user.passwordResetCode || !user.passwordResetExpires) {
      return sendError(
        res,
        {},
        "No password reset requested.",
        CODES.BAD_REQUEST,
      );
    }

    if (user.passwordResetCode !== otp) {
      return sendError(res, {}, "Invalid OTP.", CODES.BAD_REQUEST);
    }

    if (user.passwordResetExpires < new Date()) {
      return sendError(res, {}, "OTP has expired.", CODES.BAD_REQUEST);
    }

    return sendSuccess(res, {}, "OTP verified.", CODES.OK);
  } catch (err) {
    console.error("Verify OTP Error:", err);
    return sendError(res, err.message, CODES.INTERNAL_SERVER_ERROR);
  }
};

authController.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
      return sendError(res, {}, "All fields are required.", CODES.BAD_REQUEST);
    }

    if (newPassword !== confirmPassword) {
      return sendError(res, {}, "Passwords do not match.", CODES.BAD_REQUEST);
    }

    const user = await User.findOne({ email });
    if (!user) return sendError(res, {}, "User not found.", CODES.NOT_FOUND);

    if (user.passwordResetCode !== otp) {
      return sendError(res, {}, "Invalid OTP.", CODES.BAD_REQUEST);
    }

    if (user.passwordResetExpires < new Date()) {
      return sendError(res, {}, "OTP has expired.", CODES.BAD_REQUEST);
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    user.password = hashed;
    user.passwordResetCode = null;
    user.passwordResetExpires = null;

    await user.save();

    return sendSuccess(res, {}, "Password reset successful.", CODES.OK);
  } catch (err) {
    console.error("Reset Password Error:", err);
    return sendError(res, err.message, CODES.INTERNAL_SERVER_ERROR);
  }
};

authController.logout = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return sendError(res, {}, "Unauthorized.", CODES.UNAUTHORIZED);
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, {}, "User not found.", CODES.BAD_REQUEST);
    }

    // 🔥 Remove token
    user.token = null;
    await user.save();

    return sendSuccess(res, {}, "Logged out successfully.", CODES.OK);
  } catch (error) {
    console.error("Logout Error:", error);
    return sendError(
      res,
      {},
      error.message || "Internal Server Error",
      CODES.INTERNAL_SERVER_ERROR,
    );
  }
};

authController.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.params;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return sendError(res, {}, "Invalid or expired token", CODES.BAD_REQUEST);
    }

    return sendSuccess(res, {}, "Token valid", CODES.OK);
  } catch (err) {
    return sendError(res, err);
  }
};

authController.setPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetTokenExpires: { $gt: Date.now() },
    });

    if (!user) {
      return sendError(res, {}, "Invalid or expired token", CODES.BAD_REQUEST);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user.password = hashedPassword;
    user.passwordResetToken = null;
    user.passwordResetExpires = null;

    await user.save();

    return sendSuccess(res, {}, "Password set successfully");
  } catch (err) {
    return sendError(res, err);
  }
};

// controllers/userController.js

authController.sendActivationLinkByUserId = async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return sendError(res, {}, "User ID is required", CODES.BAD_REQUEST);
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendError(res, {}, "User not found", CODES.NOT_FOUND);
    }

    // 🔐 Generate secure token
    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.passwordResetToken = hashedToken;
    user.passwordResetTokenExpires = Date.now() + 15 * 60 * 1000; // 15 mins
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;

    return sendSuccess(
      res,
      { resetLink },
      "Activation link sent successfully",
      CODES.OK,
    );
  } catch (error) {
    console.error("Send Activation Link Error:", error);
    return sendError(res, error);
  }
};

export default authController;

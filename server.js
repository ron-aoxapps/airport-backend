import express from "express";
import cors from "cors";
import allRoutes from "./app/routes/index.js";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Server } from "socket.io";
import http from "http";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import "./app/config/db.js";
import "./app/utils/cron.js";
// import { handleStripeWebhook } from "./app/controllers/webhooks/stripe.js";
import { initSocket } from "./app/socket/index.js";
// import { bindFirebaseToApp } from "./app/firebase/client.js";
import { initFirebase } from "./app/firebase/client.js";

dotenv.config();

// initFirebase();

const PORT = process.env.PORT || 4000;
const app = express();
// bindFirebaseToApp(app);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:8000",
  "http://localhost:3001",
  "https://hrrxmgf8-8000.inc1.devtunnels.ms",
  "https://hrrxmgf8-3000.inc1.devtunnels.ms",
  "https://manasic-calista-unelectronic.ngrok-free.dev",
];

const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: allowedOrigins,
//     methods: ["GET", "POST"],
//   },
// });
// app.set("io", io);

const io = initSocket(server, allowedOrigins);
app.set("io", io);

app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "uploads")),
);

// app.use('/webhook', express.raw({ type: 'application/json' , verify: (req, res, buf) => {req.rawBody = buf;} }), handleStripeWebhook);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, try again later.",
});
// app.use((req, res, next) => {
//   req.io = io;
//   next();
// });
// app.use("/api/", limiter);

// setupSocket(io);

app.get("/", (req, res) => {
  res.send("🚀 Server is running successfully on Railway!");
});

app.use((req, res, next) => {
  const authHeader = req.headers["authorization"];
  let tokenPayload = null;

  console.log("===================================================");

  console.log("📌 API Request Log:");
  console.log("➡️ Endpoint:", req.method, req.originalUrl);
  console.log("🔑 Token Payload:", authHeader);

  next();
});

app.use("/api/v1", allRoutes);

app.use((req, res, next) => {
  res.status(404).json({
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: "Internal Server Error",
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server is running on PORT ${PORT}`);
});

// import admin from "firebase-admin";
// import dotenv from "dotenv";
// import path from "path";

// dotenv.config();

// //wrong for now

// const serviceAccount = process.env.FIREBASE_JSON
//   ? path.resolve(process.env.FIREBASE_JSON)
//   : path.resolve("./airportvalley.json");

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// if (!admin.apps || admin.apps.length === 0) {
//   console.log("Firebase admin not initialized");
// }

// const messaging = admin.messaging();

// export const sendFirebaseNotification = async ({
//   token,
//   title,
//   body,
//   data = {},
//   androidChannelId = "default",
// }) => {
//   if (!token) return false;

//   const message = {
//     notification: {
//       title,
//       body,
//     },
//     token,
//     data: Object.fromEntries(
//       Object.entries(data).map(([k, v]) => [k, String(v)]),
//     ),
//     android: {
//       notification: {
//         sound: "default",
//         channelId: androidChannelId,
//       },
//     },
//     apns: {
//       payload: {
//         aps: {
//           sound: "default",
//         },
//       },
//     },
//   };

//   try {
//     await messaging.send(message);
//     return true;
//   } catch (error) {
//     console.error("❌ Firebase push failed:", error.message);
//     return false;
//   }
// };

import admin from "firebase-admin";
import path from "path";

let firebaseApp;

export const initFirebase = () => {
  if (admin.apps.length > 0) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  const serviceAccount = path.resolve("./airportvalley.json");

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin Initialized");

  return firebaseApp;
};

const getMessaging = () => {
  if (!firebaseApp) initFirebase();
  return admin.messaging();
};

export const sendFirebaseNotification = async ({
  token,
  title,
  body,
  data = {},
  androidChannelId = "default",
}) => {
  if (!token) return false;

  const messaging = getMessaging();

  const message = {
    notification: { title, body },
    token,
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)]),
    ),
    android: {
      notification: {
        sound: "default",
        channelId: androidChannelId,
      },
    },
    apns: {
      payload: {
        aps: { sound: "default" },
      },
    },
  };

  try {
    await messaging.send(message);
    return true;
  } catch (error) {
    console.error("❌ Firebase push failed:", error.message);
    return false;
  }
};

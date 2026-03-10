import dotenv from "dotenv";
import axios from "axios";
import ParkingLocation from "../models/parkingLocations.js";
import { GET_PARKING_LOCATIONS } from "../constants/parkingSoftwareApis.js";

dotenv.config();

const normalizeLocationName = (name) => name?.replace(/\s+/g, "").toLowerCase();

function mapExternalLocation(payload) {
  return {
    name: payload.name?.trim(),
    address: payload.address || null,
    countryCode: payload.country_id || null,
    country: payload.country || null,
    email: payload.email || null,
    phone: payload.phone || null,
    zip: payload.zip || null,
    coordinates: {
      type: "Point",
      coordinates: [Number(payload.lng) || 0, Number(payload.lat) || 0],
    },
    time: payload.time || null,
    status:
      payload.status === "True" ||
      payload.status === true ||
      payload.status === 1,
    thumbs: payload.thumbs || [],
  };
}

async function upsertParkingLocation(doc) {
  if (!doc.name) return null;

  const res = await ParkingLocation.findOneAndUpdate(
    { name: doc.name },
    {
      $set: {
        ...doc,
        status: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return res;
}

export async function fetchAndIngestLocations() {
  const { data } = await axios.get(GET_PARKING_LOCATIONS, { timeout: 20000 });

  const items = data?.data || [];

  const locationMap = new Map();

  await ParkingLocation.updateMany({}, { $set: { status: false } });

  for (const raw of items) {
    const doc = mapExternalLocation(raw);
    const saved = await upsertParkingLocation(doc);

    if (saved?._id) {
      locationMap.set(normalizeLocationName(saved.name), saved._id);
    }
  }

  return locationMap; // name → ObjectId
}

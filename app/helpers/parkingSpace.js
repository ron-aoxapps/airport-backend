import dotenv from "dotenv";
import axios from "axios";
import ParkingSpace from "../models/parkingSpaces.js";
import { GET_PARKING_SPACES } from "../constants/parkingSoftwareApis.js";

dotenv.config();

const normalizeLocationName = (name) => name?.replace(/\s+/g, "").toLowerCase();

function mapExternalParkingSpace(payload, locationMap = new Map()) {
  const locationName = normalizeLocationName(payload.location);

  return {
    name: payload.name || payload.space_name,
    description: payload.description || null,
    defaultCount: Number(payload.default_count) || 0,
    defaultPrice: Number(payload.default_price) || Number(payload.price) || 0,
    status:
      payload.status === "True" ||
      payload.status === true ||
      payload.status === 1,
    locationId: locationMap.get(locationName) || null,
  };
}

async function upsertParkingSpace(doc) {
  if (!doc.name) return { skipped: true, reason: "no name" };

  const res = await ParkingSpace.findOneAndUpdate(
    { name: doc.name },
    {
      $set: {
        ...doc,
        status: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return { upsertedId: res._id.toString() };
}

export async function fetchAndIngestParkingSpaces(locationMap) {
  const start = Date.now();
  console.log(
    `[ParkingSpacesCron] Fetch started @ ${new Date().toISOString()}`,
  );

  try {
    const { data } = await axios.get(GET_PARKING_SPACES, { timeout: 20_000 });
    const items = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : [];

    if (!Array.isArray(items)) {
      console.warn(
        "[ParkingSpacesCron] Unexpected response shape. No items array.",
      );
      return { fetched: 0, upserts: 0, errors: 0 };
    }

    let upserts = 0;
    let errors = 0;

    await ParkingSpace.updateMany({}, { $set: { status: false } });

    // Process with concurrency control
    const concurrency = 10;
    const queue = [...items];

    async function worker() {
      while (queue.length) {
        const raw = queue.shift();
        try {
          const doc = mapExternalParkingSpace(raw, locationMap);
          const r = await upsertParkingSpace(doc);
          if (r.upsertedId) upserts += 1;
        } catch (e) {
          errors += 1;
          console.error("[ParkingSpacesCron] upsert error:", e?.message);
        }
      }
    }

    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[ParkingSpacesCron] Fetch done — fetched=${items.length}, upserts=${upserts}, errors=${errors}, duration=${elapsed}s`,
    );
    return { fetched: items.length, upserts, errors };
  } catch (e) {
    console.error("[ParkingSpacesCron] fetch failed:", e?.message);
    return { fetched: 0, upserts: 0, errors: 1 };
  }
}

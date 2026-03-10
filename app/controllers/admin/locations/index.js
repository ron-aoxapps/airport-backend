import { sendError, sendSuccess } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import ParkingLocation from "../../../models/parkingLocations.js";
import axios from "axios";
import { GET_PARKING_LOCATIONS } from "../../../constants/parkingSoftwareApis.js";

const parkingController = {};

parkingController.syncParkingLocations = async (req, res) => {
  try {
    const { data } = await axios.get(GET_PARKING_LOCATIONS);

    if (!data?.data || !Array.isArray(data.data)) {
      return sendError(
        res,
        "Invalid data format from external API",
        CODES.BAD_REQUEST,
      );
    }

    const locations = data.data;

    for (const loc of locations) {
      const lat = parseFloat(loc.lat);
      const lng = parseFloat(loc.lng);

      const parkingData = {
        parkingId: loc.id,
        name: loc.name || "Unnamed",
        address: loc.address || "",
        email: loc.email || null,
        phone: loc.phone || null,
        zip: loc.zip || null,
        country_id: loc.country_id || null,
        country: loc.country || null,
        country_title: loc.country_title || null,
        time: loc.time || null,
        lat: loc.lat || null,
        lng: loc.lng || null,
        status: loc.status?.toLowerCase() === "true",
        thumbs: loc.thumbs || [],
        coordinates: {
          type: "Point",
          coordinates: !isNaN(lng) && !isNaN(lat) ? [lng, lat] : [0, 0],
        },
        isActive: loc.status?.toLowerCase() === "true",
      };

      await ParkingLocation.findOneAndUpdate(
        { parkingId: loc.id },
        { $set: parkingData },
        { upsert: true, new: true },
      );
    }

    return sendSuccess(
      res,
      { count: locations.length },
      "Parking locations synced successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Sync Parking Locations Error:", err);
    return sendError(res, err.message || err, CODES.INTERNAL_SERVER_ERROR);
  }
};

// ----------------- GET ALL PARKING LOCATIONS -----------------
parkingController.getAllParkingLocations = async (req, res) => {
  try {
    const { search = "", page = 1, limit = 10, status } = req.query;

    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { address: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    if (status === "active") {
      query.status = true;
    } else if (status === "inactive") {
      query.status = false;
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [locations, total] = await Promise.all([
      ParkingLocation.find(query)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 }),
      ParkingLocation.countDocuments(query),
    ]);

    return sendSuccess(
      res,
      {
        locations,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
      "Parking locations fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Get Parking Locations Error:", err);
    return sendError(res, err);
  }
};

parkingController.getAllParkingLocationsWithoutPagination = async (
  req,
  res,
) => {
  try {
    const locations = await ParkingLocation.find();

    return sendSuccess(
      res,
      {
        locations,
      },
      "Parking locations fetched successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Get Parking Locations Error:", err);
    return sendError(res, err);
  }
};

// ----------------- DELETE PARKING LOCATION -----------------
parkingController.deleteParkingLocation = async (req, res) => {
  try {
    const { locationId } = req.params;

    const location = await ParkingLocation.findById(locationId);
    if (!location) {
      return sendError(res, {}, "Parking location not found.", CODES.NOT_FOUND);
    }

    await location.deleteOne();

    return sendSuccess(
      res,
      {},
      "Parking location deleted successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Delete Parking Location Error:", err);
    return sendError(res, err);
  }
};

// ----------------- TOGGLE ACTIVE/INACTIVE PARKING LOCATION -----------------
parkingController.toggleParkingLocation = async (req, res) => {
  try {
    const { locationId } = req.params;

    const location = await ParkingLocation.findById(locationId);
    if (!location) {
      return sendError(res, {}, "Parking location not found.", CODES.NOT_FOUND);
    }

    location.status = !location.status;
    await location.save();

    return sendSuccess(
      res,
      location,
      `Parking location ${
        location.isActive ? "activated" : "deactivated"
      } successfully.`,
      CODES.OK,
    );
  } catch (err) {
    console.error("Toggle Parking Location Error:", err);
    return sendError(res, err);
  }
};

// ----------------- UPDATE PARKING LOCATION -----------------
parkingController.updateParkingLocationDetails = async (req, res) => {
  try {
    const { locationId } = req.params;

    const {
      name,
      address,
      latitude,
      longitude,
      capacity,
      email,
      country,
      zip,
      countryCode,
      phoneNumber,
      status,
    } = req.body;

    // Find existing record
    const location = await ParkingLocation.findById(locationId);
    if (!location) {
      return sendError(res, {}, "Parking location not found.", CODES.NOT_FOUND);
    }

    // Validate required fields
    if (!name || !address) {
      return sendError(
        res,
        {},
        "Name and address are required.",
        CODES.BAD_REQUEST,
      );
    }

    // Validate coordinates if provided
    if (latitude !== undefined && longitude !== undefined) {
      const lat = Number(latitude);
      const lng = Number(longitude);

      if (Number.isNaN(lat) || lat < -90 || lat > 90) {
        return sendError(res, {}, "Invalid latitude.", CODES.BAD_REQUEST);
      }
      if (Number.isNaN(lng) || lng < -180 || lng > 180) {
        return sendError(res, {}, "Invalid longitude.", CODES.BAD_REQUEST);
      }

      location.coordinates = { type: "Point", coordinates: [lng, lat] };
      location.lat = String(lat);
      location.lng = String(lng);
    }

    // Update fields
    location.name = String(name).trim();
    location.address = String(address).trim();
    location.email = email ? String(email).trim() : null;
    location.country = country ? String(country).trim() : null;
    location.zip =
      zip !== undefined && zip !== null ? String(zip).trim() : null;
    location.countryCode = countryCode ? String(countryCode).trim() : null;
    location.phone = phoneNumber || null;
    location.capacity = Number(capacity) || 0;

    if (typeof status === "boolean") location.status = status;

    await location.save();

    return sendSuccess(
      res,
      location,
      "Parking location updated successfully.",
      CODES.OK,
    );
  } catch (err) {
    console.error("Update Parking Location Error:", err);
    return sendError(res, err);
  }
};

// ----------------- ADD NEW PARKING LOCATION -----------------
parkingController.addParkingLocation = async (req, res) => {
  try {
    const {
      name,
      address,
      latitude,
      longitude,
      capacity,
      email,
      country,
      zip,
      countryCode,
      phoneNumber,
    } = req.body;

    if (
      !name ||
      !address ||
      latitude === undefined ||
      longitude === undefined
    ) {
      return sendError(
        res,
        {},
        "Name, address, and coordinates are required.",
        CODES.BAD_REQUEST,
      );
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (Number.isNaN(lat) || lat < -90 || lat > 90) {
      return sendError(res, {}, "Invalid latitude.", CODES.BAD_REQUEST);
    }
    if (Number.isNaN(lng) || lng < -180 || lng > 180) {
      return sendError(res, {}, "Invalid longitude.", CODES.BAD_REQUEST);
    }

    // Check if location already exists
    const existingLocation = await ParkingLocation.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, "i") } },
        { "coordinates.coordinates": [Number(longitude), Number(latitude)] },
      ],
    });

    if (existingLocation) {
      return sendError(
        res,
        {},
        "Parking location already exists.",
        CODES.BAD_REQUEST,
      );
    }

    const newLocation = await ParkingLocation.create({
      name: String(name).trim(),
      address: String(address).trim(),
      coordinates: { type: "Point", coordinates: [lng, lat] },
      capacity: Number(capacity) || 0,
      email: email ? String(email).trim() : null,
      country: country ? String(country).trim() : null,
      zip: zip !== undefined && zip !== null ? String(zip).trim() : undefined,
      countryCode: countryCode ? String(countryCode).trim() : undefined,
      phone: phoneNumber,
    });

    return sendSuccess(
      res,
      newLocation,
      "Parking location added successfully.",
      CODES.CREATED,
    );
  } catch (err) {
    console.error("Add Parking Location Error:", err);
    return sendError(res, err);
  }
};

export default parkingController;

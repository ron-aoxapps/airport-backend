import { sendSuccess, sendError } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";
import Car from "../../../models/Cars.js";

const carController = {};

carController.getAllCars = async (req, res) => {
  try {
    const userId = req.userId;

    const cars = await Car.find({ customerId: userId });

    return sendSuccess(res, cars, "Cars fetched successfully.", CODES.OK);
  } catch (err) {
    console.error("Get Cars Error:", err);
    return sendError(res, err);
  }
};

carController.addCar = async (req, res) => {
  try {
    const userId = req.userId;
    const { carMake, carColor, plateNumber, carModel } = req.body;

    if (!carMake || !carColor || !plateNumber || !carModel) {
      return sendError(res, {}, "All fields are required.", CODES.BAD_REQUEST);
    }

    // Check for duplicate plate number
    const existingCar = await Car.findOne({ plateNumber });
    if (existingCar) {
      return sendError(
        res,
        {},
        "Car with this plate number already exists.",
        CODES.BAD_REQUEST,
      );
    }

    let carImage = "";
    if (req.file) {
      carImage = `/uploads/${req.file.filename}`;
    }

    const newCar = await Car.create({
      carMake,
      carColor,
      plateNumber,
      carModel,
      carImage,
      customerId: userId,
    });

    return sendSuccess(res, newCar, "Car added successfully.", CODES.CREATED);
  } catch (err) {
    console.error("Add Car Error:", err);
    return sendError(res, err);
  }
};

carController.deleteCar = async (req, res) => {
  try {
    const userId = req.userId;
    const { carId } = req.params;

    const car = await Car.findOne({ _id: carId, customerId: userId });
    if (!car) {
      return sendError(
        res,
        {},
        "Car not found or not authorized.",
        CODES.NOT_FOUND,
      );
    }

    await car.deleteOne();

    return sendSuccess(res, {}, "Car deleted successfully.", CODES.OK);
  } catch (err) {
    console.error("Delete Car Error:", err);
    return sendError(res, err);
  }
};

export default carController;

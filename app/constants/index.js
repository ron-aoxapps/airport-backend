export const TRIP_FINDING = "FindingDrivers";
export const TRIP_ACCEPTED = "Accepted";
export const TRIP_PICKUP_INROUTE = "PickupInroute";
export const TRIP_ARRIVED = "PickupArrived";
export const TRIP_PARKING_INROUTE = "ParkingInRoute";
export const TRIP_PARKED = "Parked";
export const TRIP_RETURN_INROUTE = "ReturnInRoute";
export const TRIP_RETURN_ARRIVED = "ReturnArrived";
export const TRIP_COMPLETED = "Completed";
export const TRIP_CANCELLED = "Cancelled";

//not used
export const TRIP_NO_DRIVER_FOUND = "NoDriverFound";
export const TRIP_PENDING = "Pending";

// Driver Status Constants
export const DRIVER_FINDING_TRIPS = "FindingTrips";
export const DRIVER_OFFLINE = "Offline";
export const DRIVER_ONLINE = "online";
export const DRIVER_ON_PICKUP = "onPickup";
export const DRIVER_DESTINATION_INROUTE = "DestinationInRoute";

export const TRIP_STATUS_GROUPS = {
  ONGOING: [
    TRIP_ACCEPTED,
    TRIP_PICKUP_INROUTE,
    TRIP_ARRIVED,
    TRIP_PARKING_INROUTE,

    TRIP_RETURN_INROUTE,
    TRIP_RETURN_ARRIVED,

    //all
    // TRIP_FINDING,
    // TRIP_PARKED,
    // TRIP_COMPLETED,
  ],
};

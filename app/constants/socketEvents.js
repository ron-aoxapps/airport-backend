export const SOCKET_EVENTS = {
  CONNECT: "connect",
  DISCONNECT: "disconnect",

  // customer notifications
  TRIP_ACCEPTED: "tripAccepted",
  TRIP_STARTED: "tripStarted",
  DRIVER_ARRIVED: "driverArrived",
  CAR_PARKED: "carParked",
  TRIP_COMPLETED: "tripCompleted",
  DRIVER_LIVE_LOCATION: "driverLiveLocation",
  CUSTOMER_LOCATION_UPDATE: "customerLocationChanged", //emit

  //driver notifications

  // not used yet
  TRIP_CANCELLED_BY_DRIVER: "tripCancelledByDriver",
  CUSTOMER_RATING_UPDATED: "customerRatingUpdated",

  // driver notifications
  // TRIP_CANCELLED_BY_CUSTOMER: "tripCancelledByCustomer",
  // DRIVER_RATING_UPDATED: "driverRatingUpdated",
  TRIP_CREATED: "newTripRequest",
  DRIVER_LOCATION_UPDATE: "driverLocationChanged", //emit
  CUSTOMER_LIVE_LOCATION: "customerLiveLocation",
  TRIP_PARKING_INROUTE: "tripParkingInRoute",
};

export const sendSuccess = (
  res,
  data = {},
  message = "Success",
  status = 200
) => {
  res.status(status).json({
    success: true,
    message,
    data,
  });
};

export const sendError = (
  res,
  error = {},
  message = "Something went wrong. Please try again.",
  status = 500,
  data = {}
) => {
  console.error(error);
  res.status(status).json({
    success: false,
    message,
    data,
  });
};

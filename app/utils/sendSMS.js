import twilio from "twilio";
import dotenv from "dotenv";
dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export const sendVerificationSMS = async (toPhoneNumber, code) => {
  try {
    const message = await client.messages.create({
      body: `Your verification code is: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: toPhoneNumber,
    });
    return message.sid;
  } catch (err) {
    console.error("Error sending SMS:", err);
    throw err;
  }
};

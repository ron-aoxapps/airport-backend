import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export const uploadToS3 = async (file) => {
  try {
    if (!file?.path) {
      throw new Error("File path missing.");
    }

    if (!fs.existsSync(file.path)) {
      throw new Error("File does not exist on disk.");
    }

    const fileStream = fs.createReadStream(file.path);

    const ext = path.extname(file.originalname);
    const fileName = `images/${uuidv4()}${ext}`;

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: fileStream,
        ContentType: file.mimetype,
      },
    });

    await upload.done();

    fs.unlink(file.path, (err) => {
      if (err) console.error("Failed to delete local file:", err);
    });

    return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
  } catch (error) {
    console.error("S3 Upload Error:", error.message);
  }
};

function extractBuffer(raw) {
  if (!raw) throw new Error("No raw image data provided");

  let buffer;
  let contentType = "image/jpeg";

  if (typeof raw !== "string") {
    // just in case client sends something weird
    raw = String(raw);
  }

  // 1️⃣ If it's a data URL (recommended)
  if (raw.startsWith("data:image")) {
    const [meta, base64Data] = raw.split(",");
    const match = meta.match(/data:(image\/[a-zA-Z0-9.+-]+);base64/);
    if (match) contentType = match[1];
    buffer = Buffer.from(base64Data, "base64");
  } else {
    // 2️⃣ Accept only clean base64 strings (no control chars)
    const isLikelyBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(raw.trim());

    if (!isLikelyBase64) {
      throw new Error("Invalid image encoding: expected base64 or data URL");
    }

    buffer = Buffer.from(raw.trim(), "base64");
  }

  return { buffer, contentType };
}

export const uploadBodyImageToS3 = async (
  rawImageString,
  folder = "task-images",
) => {
  try {
    const { buffer, contentType } = extractBuffer(rawImageString);

    const fileName = `profile-images/${uuidv4()}.jpg`;

    const upload = new Upload({
      client: s3,
      params: {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileName,
        Body: buffer,
        ContentType: contentType,
      },
    });

    await upload.done();

    const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;
    console.log(url, "check url");

    return url;
  } catch (err) {
    console.error("S3 upload error:", err);
    throw err;
  }
};

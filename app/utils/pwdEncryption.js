import crypto from 'crypto'
import dotenv from "dotenv";

dotenv.config()

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env.KEY, 'hex');
const IV = Buffer.from(process.env.IV, 'hex');
const SALT = process.env.SALT;

export function encryptPassword(password) {
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, IV);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted
}

export function decryptPassword(encryptedData, iv) {
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function comparePassword(inputPassword, storedEncryptedPassword) {
  const decryptedStoredPassword = decryptPassword(storedEncryptedPassword, IV);
  return inputPassword === decryptedStoredPassword;
}

export function encryptText(text) {
  const iv = crypto.randomBytes(16); 
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    iv: iv.toString('hex'),
    content: encrypted,
  };
}

export function decryptText({ iv, content }) {
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
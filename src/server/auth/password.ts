import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, salt, encodedKey] = storedHash.split(":");

  if (algorithm !== "scrypt" || !salt || !encodedKey) return false;

  try {
    const storedKey = Buffer.from(encodedKey, "base64url");
    const derivedKey = (await scrypt(
      password,
      salt,
      storedKey.length,
    )) as Buffer;

    return (
      storedKey.length === derivedKey.length &&
      timingSafeEqual(storedKey, derivedKey)
    );
  } catch {
    return false;
  }
}

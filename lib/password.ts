import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const HASH_PREFIX = "scrypt:v1";
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

function safeEqual(left: Buffer, right: Buffer) {
  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function safeEqualString(left: string, right: string) {
  return safeEqual(Buffer.from(left), Buffer.from(right));
}

async function derivePasswordKey(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

export function isPasswordHash(value: string) {
  return value.startsWith(`${HASH_PREFIX}:`);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(24).toString("base64url");
  const hash = await derivePasswordKey(password, salt);
  return `${HASH_PREFIX}:${salt}:${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedValue: string) {
  if (!isPasswordHash(storedValue)) {
    return safeEqualString(password, storedValue);
  }

  const parts = storedValue.split(":");
  const [, version, salt, expectedHash] = parts;

  if (parts.length !== 4 || version !== "v1" || !salt || !expectedHash) {
    return false;
  }

  const actualHash = await derivePasswordKey(password, salt);
  return safeEqual(actualHash, Buffer.from(expectedHash, "base64url"));
}

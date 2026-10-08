import "server-only";

import {
  createHash,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";

const KEY_LENGTH = 64;

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function derivePasswordHash(
  password: string,
  salt = randomBytes(16).toString("base64"),
): Promise<Readonly<{ salt: string; hash: string }>> {
  const key = await new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(
      password,
      Buffer.from(salt, "base64"),
      KEY_LENGTH,
      { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
  return { salt, hash: key.toString("base64") };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const derived = await derivePasswordHash(password, salt);
  const actual = Buffer.from(derived.hash, "base64");
  const expected = Buffer.from(expectedHash, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

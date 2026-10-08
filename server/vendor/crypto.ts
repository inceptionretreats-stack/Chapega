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

type ScryptParameters = Readonly<{ N: number; r: number; p: number }>;

/**
 * OWASP Password Storage Cheat Sheet minimum for scrypt: N=2^17, r=8, p=1
 * (128 MiB per hash). New hashes record their parameters as
 * `scrypt$N=…,r=…,p=…$<base64 key>` so they can be raised again later while
 * every stored hash keeps verifying.
 */
export const CURRENT_SCRYPT_PARAMETERS: ScryptParameters = Object.freeze({
  N: 131_072,
  r: 8,
  p: 1,
});

/** Hashes stored before parameters were recorded used N=2^14, r=8, p=1. */
const LEGACY_SCRYPT_PARAMETERS: ScryptParameters = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
});

const HASH_PREFIX = "scrypt$";
const ENCODED_HASH = /^scrypt\$N=(\d{1,8}),r=(\d{1,2}),p=(\d{1,2})\$([A-Za-z0-9+/]+={0,2})$/;

/**
 * A credential with current parameters that no password matches, used to
 * spend one full verification on unknown accounts so response time does not
 * reveal which emails exist.
 */
export const DUMMY_PASSWORD_SALT = "UbZ9ZsL99vuETx9PeyWhgg==";
export const DUMMY_PASSWORD_HASH =
  "scrypt$N=131072,r=8,p=1$roPRXqfGmYTt4aZsfnCY0IPQz3A1ps34Q71BpHAVX+H2VxTF+cHsU/q0EcUE3/he5rqMKyUxVl36SdsxmkT3sw==";

/**
 * At most this many derivations run at once. Each needs 128·N·r bytes
 * (128 MiB at the current parameters), so two bound the process to 256 MiB of
 * scrypt memory however many sign-ins arrive together; the rest wait.
 */
const MAX_CONCURRENT_DERIVATIONS = 2;
let activeDerivations = 0;
const waiting: Array<() => void> = [];

async function withDerivationSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activeDerivations >= MAX_CONCURRENT_DERIVATIONS) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeDerivations += 1;
  try {
    return await operation();
  } finally {
    activeDerivations -= 1;
    waiting.shift()?.();
  }
}

function acceptable(parameters: ScryptParameters): boolean {
  const { N, r, p } = parameters;
  return (
    Number.isSafeInteger(N) &&
    N >= LEGACY_SCRYPT_PARAMETERS.N &&
    N <= 1_048_576 &&
    (N & (N - 1)) === 0 &&
    r >= 1 &&
    r <= 16 &&
    p >= 1 &&
    p <= 4
  );
}

function scryptKey(
  password: string,
  salt: string,
  parameters: ScryptParameters,
): Promise<Buffer> {
  const { N, r, p } = parameters;
  return withDerivationSlot(
    () =>
      new Promise<Buffer>((resolve, reject) => {
        nodeScrypt(
          password,
          Buffer.from(salt, "base64"),
          KEY_LENGTH,
          // maxmem must exceed 128·N·r·p; allow twice that for overhead.
          { N, r, p, maxmem: 256 * N * r * p },
          (error, derivedKey) => {
            if (error) reject(error);
            else resolve(derivedKey);
          },
        );
      }),
  );
}

function encodeHash(parameters: ScryptParameters, key: Buffer): string {
  return `${HASH_PREFIX}N=${parameters.N},r=${parameters.r},p=${parameters.p}$${key.toString("base64")}`;
}

type DecodedHash = Readonly<{ parameters: ScryptParameters; key: Buffer }>;

function decodeHash(stored: string): DecodedHash | null {
  if (!stored) return null;
  if (!stored.startsWith(HASH_PREFIX)) {
    // Legacy format: the bare base64 key derived with the legacy parameters.
    const key = Buffer.from(stored, "base64");
    return key.length === KEY_LENGTH
      ? { parameters: LEGACY_SCRYPT_PARAMETERS, key }
      : null;
  }
  const match = ENCODED_HASH.exec(stored);
  if (!match) return null;
  const parameters = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
  const key = Buffer.from(match[4], "base64");
  if (!acceptable(parameters) || key.length !== KEY_LENGTH) return null;
  return { parameters, key };
}

/**
 * Hash a new password with the current parameters. The signature is kept from
 * the original API; `hash` now carries its parameters.
 */
export async function derivePasswordHash(
  password: string,
  salt = randomBytes(16).toString("base64"),
): Promise<Readonly<{ salt: string; hash: string }>> {
  const key = await scryptKey(password, salt, CURRENT_SCRYPT_PARAMETERS);
  return { salt, hash: encodeHash(CURRENT_SCRYPT_PARAMETERS, key) };
}

/**
 * Verify against a stored hash in either format. Unparseable hashes or
 * parameters outside a safe range never verify (and are never used to hash).
 */
export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const decoded = decodeHash(expectedHash);
  if (!decoded) return false;
  const actual = await scryptKey(password, salt, decoded.parameters);
  return (
    actual.length === decoded.key.length && timingSafeEqual(actual, decoded.key)
  );
}

/** True when a verified password should be re-hashed with current parameters. */
export function passwordHashNeedsRehash(storedHash: string): boolean {
  const decoded = decodeHash(storedHash);
  if (!decoded) return true;
  const current = CURRENT_SCRYPT_PARAMETERS;
  return (
    decoded.parameters.N < current.N ||
    decoded.parameters.r < current.r ||
    decoded.parameters.p < current.p ||
    !storedHash.startsWith(HASH_PREFIX)
  );
}

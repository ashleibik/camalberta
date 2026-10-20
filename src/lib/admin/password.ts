import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"

/**
 * The admin password is stored only as a scrypt hash (ADMIN_PASSWORD_HASH),
 * one string: scrypt$N$r$p$salt$hash (salt and hash in base64url). Make one
 * with `npm run admin:hash`. No server-only import: the script uses it too.
 *
 * N = 2^15, r = 8, p = 1 needs 32 MiB and takes roughly 50-100 ms, a slow
 * hash by design: a leaked hash can't be brute-forced cheaply. Verification
 * reads the parameters from the string, so they can be raised later
 * without breaking existing hashes.
 */
export const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const
const SALT_BYTES = 16
const KEY_BYTES = 32
// 128 * N * r bytes, with headroom (Node's default cap is exactly 32 MiB).
const maxmem = (N: number, r: number) => 256 * N * r

const HASH_PATTERN =
  /^scrypt\$(\d{1,8})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{16,128})\$([A-Za-z0-9_-]{32,128})$/

interface ParsedHash {
  N: number
  r: number
  p: number
  salt: Buffer
  hash: Buffer
}

function derive(
  password: string,
  salt: Buffer,
  length: number,
  { N, r, p }: { N: number; r: number; p: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      length,
      { N, r, p, maxmem: maxmem(N, r) },
      (error, key) => (error ? reject(error) : resolve(key))
    )
  )
}

/** A stored hash's parts, or null if it isn't one we accept. */
export function parseScryptHash(stored: string): ParsedHash | null {
  const m = HASH_PATTERN.exec(stored)
  if (!m) return null
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])]
  // Power of two between 2^14 and 2^20; sane block size and parallelism.
  const powerOfTwo = (N & (N - 1)) === 0
  if (
    !powerOfTwo ||
    N < 2 ** 14 ||
    N > 2 ** 20 ||
    r < 1 ||
    r > 32 ||
    p < 1 ||
    p > 16
  ) {
    return null
  }
  return {
    N,
    r,
    p,
    salt: Buffer.from(m[4]!, "base64url"),
    hash: Buffer.from(m[5]!, "base64url"),
  }
}

export function isScryptHash(stored: string): boolean {
  return parseScryptHash(stored) !== null
}

/** A new hash string for `password`, with a fresh random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await derive(password, salt, KEY_BYTES, SCRYPT_PARAMS)
  const { N, r, p } = SCRYPT_PARAMS
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${key.toString("base64url")}`
}

/** Whether `password` matches the stored hash (constant-time compare). */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  const parsed = parseScryptHash(stored)
  if (!parsed) return false
  const key = await derive(password, parsed.salt, parsed.hash.length, parsed)
  return key.length === parsed.hash.length && timingSafeEqual(key, parsed.hash)
}

/**
 * Constant-time string compare without hashing: both values are copied into
 * equal-size buffers and compared in full; the length check comes last.
 * Values longer than `size` bytes never match.
 */
export function constantTimeEqual(a: string, b: string, size = 512): boolean {
  const ea = Buffer.from(a, "utf8")
  const eb = Buffer.from(b, "utf8")
  const pa = Buffer.alloc(size)
  const pb = Buffer.alloc(size)
  ea.copy(pa, 0, 0, size)
  eb.copy(pb, 0, 0, size)
  const same = timingSafeEqual(pa, pb)
  return same && ea.length === eb.length && ea.length <= size
}

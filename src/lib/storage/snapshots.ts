import "server-only"

import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { AwsClient } from "aws4fetch"

import { env } from "@/lib/env"
import { readBodyLimited } from "@/lib/proxy/upstream"

/**
 * Where road condition snapshots live: an S3-compatible bucket in production
 * (Cloudflare R2; Supabase Storage's S3 endpoint works too), a local folder
 * in development. Keys are built only by `snapshotKey`.
 */
export interface SnapshotStorage {
  readonly kind: "local" | "s3"
  put(key: string, data: Uint8Array, contentType: string): Promise<void>
  /** The stored bytes, or null if the key doesn't exist. */
  get(key: string): Promise<Uint8Array | null>
}

// snapshots/<source>_<id>/<yyyy>/<mm>/<dd>/<hhmmss>-<hash>.jpg
const KEY_PATTERN =
  /^snapshots\/[a-z0-9]+_[a-z0-9-]+\/\d{4}\/\d{2}\/\d{2}\/\d{6}-[0-9a-f]{12}\.jpg$/

export function isSnapshotKey(key: string): boolean {
  return KEY_PATTERN.test(key)
}

/** The storage key for a snapshot (UTC dates, so keys sort by time). */
export function snapshotKey(
  cameraId: string,
  takenAt: Date,
  sha256: string
): string {
  const iso = takenAt.toISOString() // 2026-10-19T22:33:08.000Z
  const [date, time] = iso.split("T") as [string, string]
  const [yyyy, mm, dd] = date.split("-")
  const hhmmss = time.slice(0, 8).replaceAll(":", "")
  const key = `snapshots/${cameraId.replace(":", "_")}/${yyyy}/${mm}/${dd}/${hhmmss}-${sha256.slice(0, 12)}.jpg`
  if (!isSnapshotKey(key)) throw new Error("invalid snapshot key")
  return key
}

// A stored snapshot is ~20 KB; anything near this is not one of ours.
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024
const S3_TIMEOUT_MS = 15_000

export function localFolderStorage(root: string): SnapshotStorage {
  // Runtime data, not source: keep Turbopack from tracing/watching it.
  const base = path.resolve(/*turbopackIgnore: true*/ root)
  // Defense in depth: keys are validated, and the path must stay in `base`.
  const resolve = (key: string) => {
    if (!isSnapshotKey(key)) throw new Error("invalid snapshot key")
    const file = path.resolve(/*turbopackIgnore: true*/ base, key)
    if (!file.startsWith(base + path.sep)) throw new Error("path escapes root")
    return file
  }
  return {
    kind: "local",
    async put(key, data) {
      const file = resolve(key)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, data)
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(resolve(key)))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
        throw error
      }
    },
  }
}

export function s3Storage(config: {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  region: string
}): SnapshotStorage {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
  })
  const url = (key: string) => {
    if (!isSnapshotKey(key)) throw new Error("invalid snapshot key")
    return `${config.endpoint.replace(/\/$/, "")}/${config.bucket}/${key}`
  }
  return {
    kind: "s3",
    async put(key, data, contentType) {
      const response = await client.fetch(url(key), {
        method: "PUT",
        body: data as BodyInit,
        headers: {
          "content-type": contentType,
          // Sign the body too (aws4fetch defaults to UNSIGNED-PAYLOAD), so
          // the bucket rejects bytes that changed on the way.
          "x-amz-content-sha256": createHash("sha256")
            .update(data)
            .digest("hex"),
        },
        signal: AbortSignal.timeout(S3_TIMEOUT_MS),
      })
      void response.body?.cancel().catch(() => {})
      // Never include the URL or response body: they name the bucket.
      if (!response.ok)
        throw new Error(`storage PUT failed (${response.status})`)
    },
    async get(key) {
      const response = await client.fetch(url(key), {
        signal: AbortSignal.timeout(S3_TIMEOUT_MS),
      })
      if (response.status === 404) {
        void response.body?.cancel().catch(() => {})
        return null
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        throw new Error(`storage GET failed (${response.status})`)
      }
      const bytes = await readBodyLimited(response, MAX_SNAPSHOT_BYTES)
      if (!bytes) throw new Error("stored snapshot too large")
      return bytes
    },
  }
}

let storage: SnapshotStorage | null = null

/** The configured storage: the S3 bucket if set, else the local folder. */
export function getSnapshotStorage(): SnapshotStorage {
  if (storage) return storage
  storage =
    env.S3_ENDPOINT &&
    env.S3_BUCKET &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY
      ? s3Storage({
          endpoint: env.S3_ENDPOINT,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          region: env.S3_REGION,
        })
      : localFolderStorage(
          path.resolve(
            /*turbopackIgnore: true*/ process.cwd(),
            env.SNAPSHOT_DIR
          )
        )
  return storage
}

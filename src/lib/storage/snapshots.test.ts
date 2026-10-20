import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  isSnapshotKey,
  localFolderStorage,
  s3Storage,
  snapshotKey,
} from "./snapshots"

const HASH = "0123456789abcdef".repeat(4)
const AT = new Date("2026-10-19T22:33:08.512Z")

describe("snapshotKey", () => {
  it("builds a dated key from the camera id, UTC time and hash", () => {
    expect(snapshotKey("alberta511:42-1", AT, HASH)).toBe(
      "snapshots/alberta511_42-1/2026/10/19/223308-0123456789ab.jpg"
    )
  })

  it("refuses camera ids that would leave the key pattern", () => {
    expect(() => snapshotKey("banff:../../etc", AT, HASH)).toThrow()
    expect(() => snapshotKey("banff:A/B", AT, HASH)).toThrow()
  })

  it("rejects anything that isn't one of our keys", () => {
    for (const key of [
      "",
      "../secret.jpg",
      "snapshots/banff_x/2026/10/19/223308-0123456789ab.jpg/../../x",
      "snapshots/banff_x/2026/10/19/223308-0123456789ab.png",
      "/snapshots/banff_x/2026/10/19/223308-0123456789ab.jpg",
    ]) {
      expect(isSnapshotKey(key)).toBe(false)
    }
  })
})

describe("localFolderStorage", () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "camalberta-snapshots-"))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("writes and reads a snapshot under the root", async () => {
    const storage = localFolderStorage(root)
    const key = snapshotKey("banff:bear-street", AT, HASH)
    await storage.put(key, new Uint8Array([1, 2, 3]), "image/jpeg")
    expect(await readFile(path.join(root, key))).toEqual(Buffer.from([1, 2, 3]))
    expect(await storage.get(key)).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("returns null for a missing snapshot", async () => {
    const key = snapshotKey("banff:bear-street", AT, HASH)
    expect(await localFolderStorage(root).get(key)).toBeNull()
  })

  it("refuses keys that aren't ours", async () => {
    const storage = localFolderStorage(root)
    await expect(storage.get("../../etc/passwd")).rejects.toThrow()
    await expect(
      storage.put("../x.jpg", new Uint8Array([1]), "image/jpeg")
    ).rejects.toThrow()
  })
})

describe("s3Storage", () => {
  const config = {
    endpoint: "https://account.r2.cloudflarestorage.com/",
    bucket: "camalberta-snapshots",
    accessKeyId: "AKIDEXAMPLE",
    secretAccessKey: "secret-example",
    region: "auto",
  }
  const key = snapshotKey("alberta511:42-1", AT, HASH)
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("PUTs a signed, path-style request", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    await s3Storage(config).put(key, new Uint8Array([1, 2]), "image/jpeg")

    const request = fetchMock.mock.calls[0]?.[0]
    expect(request).toBeInstanceOf(Request)
    if (!(request instanceof Request)) return
    expect(request.method).toBe("PUT")
    expect(request.url).toBe(
      `https://account.r2.cloudflarestorage.com/camalberta-snapshots/${key}`
    )
    expect(request.headers.get("content-type")).toBe("image/jpeg")
    expect(request.headers.get("authorization")).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=.*host.*, Signature=[0-9a-f]{64}$/
    )
    // The body's SHA-256 is signed, not UNSIGNED-PAYLOAD.
    expect(request.headers.get("x-amz-content-sha256")).toBe(
      "a12871fee210fb8619291eaea194581cbd2531e4b23759d225f6806923f63222"
    )
    expect(request.headers.get("authorization")).toContain(
      "x-amz-content-sha256"
    )
  })

  it("reports a failed PUT without the URL", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }))
    const error = await s3Storage(config)
      .put(key, new Uint8Array([1]), "image/jpeg")
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe("storage PUT failed (403)")
  })

  it("GETs a snapshot, and null when it's missing", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([7, 8, 9]), { status: 200 })
    )
    expect(await s3Storage(config).get(key)).toEqual(new Uint8Array([7, 8, 9]))
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }))
    expect(await s3Storage(config).get(key)).toBeNull()
  })

  it("refuses oversized objects and keys that aren't ours", async () => {
    fetchMock.mockResolvedValue(
      new Response(new Uint8Array(3 * 1024 * 1024), { status: 200 })
    )
    await expect(s3Storage(config).get(key)).rejects.toThrow("too large")
    await expect(s3Storage(config).get("../other-bucket/x")).rejects.toThrow(
      "invalid snapshot key"
    )
  })
})

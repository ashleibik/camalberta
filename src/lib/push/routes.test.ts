import { randomBytes } from "node:crypto"

import webpush from "web-push"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// The push routes must reject a bad request (403/415/400) before they ever
// look at whether push is configured, so they behave the same in CI (no
// VAPID keys) as in production. Called as plain functions; any database
// access fails the test instead of opening a real database.

type Route = { POST: (request: Request) => Promise<Response> }

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123"
const KEYS = {
  p256dh: Buffer.concat([Buffer.from([4]), randomBytes(64)]).toString(
    "base64url"
  ),
  auth: randomBytes(16).toString("base64url"),
}
const subscribeBody = (endpoint = ENDPOINT) => ({
  trip: "banff",
  subscription: { endpoint, keys: KEYS },
})

// A fresh address per request, so the push rate limit never interferes.
let ip = 0
function post(
  body: unknown,
  headers: Record<string, string> = {},
  path = "/api/push/subscribe"
): Request {
  return new Request(`https://camalberta.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      "x-real-ip": `198.51.100.${++ip % 250}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

type DbGlobal = typeof globalThis & { __camalbertaDb?: unknown }
const noDatabase = new Proxy(
  {},
  {
    get() {
      throw new Error("the database must not be touched")
    },
  }
)

beforeAll(() => {
  ;(globalThis as DbGlobal).__camalbertaDb = noDatabase
})

afterAll(() => {
  ;(globalThis as DbGlobal).__camalbertaDb = undefined
  vi.unstubAllEnvs()
})

async function loadRoutes(pushConfigured: boolean) {
  vi.resetModules()
  const keys = webpush.generateVAPIDKeys()
  vi.stubEnv("VAPID_PUBLIC_KEY", pushConfigured ? keys.publicKey : "")
  vi.stubEnv("VAPID_PRIVATE_KEY", pushConfigured ? keys.privateKey : "")
  vi.stubEnv("VAPID_SUBJECT", pushConfigured ? "mailto:test@example.com" : "")
  const subscribe = (await import("@/app/api/push/subscribe/route")) as Route
  const unsubscribe =
    (await import("@/app/api/push/unsubscribe/route")) as Route
  return { subscribe, unsubscribe }
}

describe.each([
  ["not configured", false],
  ["configured", true],
])("push routes with push %s", (_label, pushConfigured) => {
  let routes: Awaited<ReturnType<typeof loadRoutes>>
  beforeAll(async () => {
    routes = await loadRoutes(pushConfigured)
  })

  it("refuses a cross-site request with 403", async () => {
    const crossSite = { "sec-fetch-site": "cross-site" }
    expect(
      (await routes.subscribe.POST(post(subscribeBody(), crossSite))).status
    ).toBe(403)
    expect(
      (
        await routes.unsubscribe.POST(
          post({ endpoint: ENDPOINT }, crossSite, "/api/push/unsubscribe")
        )
      ).status
    ).toBe(403)
  })

  it("refuses a foreign Origin with 403", async () => {
    const response = await routes.subscribe.POST(
      post(subscribeBody(), { origin: "https://evil.example" })
    )
    expect(response.status).toBe(403)
  })

  it("refuses a non-JSON body with 415", async () => {
    const response = await routes.subscribe.POST(
      post(JSON.stringify(subscribeBody()), { "content-type": "text/plain" })
    )
    expect(response.status).toBe(415)
  })

  it("refuses endpoints outside the push services with 400", async () => {
    for (const endpoint of [
      "https://169.254.169.254/latest/meta-data",
      "http://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com.evil.example/x",
    ]) {
      expect(
        (await routes.subscribe.POST(post(subscribeBody(endpoint)))).status,
        endpoint
      ).toBe(400)
      expect(
        (
          await routes.unsubscribe.POST(
            post({ endpoint }, {}, "/api/push/unsubscribe")
          )
        ).status,
        endpoint
      ).toBe(400)
    }
  })

  it("refuses malformed or unexpected bodies with 400", async () => {
    expect((await routes.subscribe.POST(post("{not json"))).status).toBe(400)
    expect(
      (await routes.subscribe.POST(post({ ...subscribeBody(), extra: 1 })))
        .status
    ).toBe(400)
    expect(
      (
        await routes.subscribe.POST(
          post({ ...subscribeBody(), trip: "jasper" })
        )
      ).status
    ).toBe(400)
  })
})

describe("a valid subscribe request", () => {
  it("gets 503 only after passing every check, when push is off", async () => {
    const { subscribe } = await loadRoutes(false)
    const response = await subscribe.POST(post(subscribeBody()))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      error: "Alerts are not available",
    })
  })
})

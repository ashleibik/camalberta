import { describe, expect, it } from "vitest"

import { computeVerdict } from "@/lib/trip/verdict"

import { isAllowedPushEndpoint } from "./endpoints"
import { ALERT_COOLDOWN_MS, alertMessage, decideAlert } from "./policy"
import { subscribeBodySchema, unsubscribeBodySchema } from "./schema"

// Real-shaped keys: a 65-byte uncompressed P-256 point and a 16-byte secret.
const P256DH = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]).toString(
  "base64url"
)
const AUTH = Buffer.alloc(16, 9).toString("base64url")
const FCM = "https://fcm.googleapis.com/fcm/send/abc123:APA91bExample"

describe("isAllowedPushEndpoint", () => {
  it("accepts the browsers' push services", () => {
    expect(isAllowedPushEndpoint(FCM)).toBe(true)
    expect(
      isAllowedPushEndpoint(
        "https://updates.push.services.mozilla.com/wpush/v2/gAAA"
      )
    ).toBe(true)
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGRiZmY")).toBe(
      true
    )
    expect(
      isAllowedPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=x")
    ).toBe(true)
  })

  it("rejects anything that could point our server elsewhere (SSRF)", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(
      false
    )
    expect(isAllowedPushEndpoint("https://localhost/push")).toBe(false)
    expect(
      isAllowedPushEndpoint("https://169.254.169.254/latest/meta-data")
    ).toBe(false)
    expect(
      isAllowedPushEndpoint("https://fcm.googleapis.com.evil.example/x")
    ).toBe(false)
    expect(
      isAllowedPushEndpoint("https://evilnotify.windows.com.example/x")
    ).toBe(false)
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x")).toBe(
      false
    )
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(
      false
    )
    expect(isAllowedPushEndpoint("not a url")).toBe(false)
    expect(isAllowedPushEndpoint(`${FCM}${"a".repeat(1100)}`)).toBe(false)
  })
})

describe("subscribe and unsubscribe bodies", () => {
  const valid = {
    trip: "banff",
    subscription: {
      endpoint: FCM,
      expirationTime: null,
      keys: { p256dh: P256DH, auth: AUTH },
    },
  }

  it("accepts what PushSubscription.toJSON() returns", () => {
    expect(subscribeBodySchema.safeParse(valid).success).toBe(true)
  })

  it("rejects unknown trips, extra fields and bad keys", () => {
    expect(
      subscribeBodySchema.safeParse({ ...valid, trip: "jasper" }).success
    ).toBe(false)
    expect(
      subscribeBodySchema.safeParse({ ...valid, email: "a@b.c" }).success
    ).toBe(false)
    const badKey = { ...valid.subscription, keys: { p256dh: AUTH, auth: AUTH } }
    expect(
      subscribeBodySchema.safeParse({ ...valid, subscription: badKey }).success
    ).toBe(false)
    const badAuth = {
      ...valid.subscription,
      keys: { p256dh: P256DH, auth: P256DH },
    }
    expect(
      subscribeBodySchema.safeParse({ ...valid, subscription: badAuth }).success
    ).toBe(false)
    const otherHost = {
      ...valid.subscription,
      endpoint: "https://example.com/push",
    }
    expect(
      subscribeBodySchema.safeParse({ ...valid, subscription: otherHost })
        .success
    ).toBe(false)
  })

  it("unsubscribes one trip or all trips for an endpoint", () => {
    expect(
      unsubscribeBodySchema.safeParse({ endpoint: FCM, trip: "edmonton" })
        .success
    ).toBe(true)
    expect(unsubscribeBodySchema.safeParse({ endpoint: FCM }).success).toBe(
      true
    )
    expect(
      unsubscribeBodySchema.safeParse({ endpoint: "https://x.example" }).success
    ).toBe(false)
  })
})

describe("decideAlert", () => {
  const now = new Date("2026-10-19T22:00:00Z")
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)

  it("alerts when the trip gets worse", () => {
    expect(
      decideAlert({ baseline: "green", lastNotifiedAt: null }, "yellow", now)
    ).toBe("send")
    expect(
      decideAlert({ baseline: "yellow", lastNotifiedAt: null }, "red", now)
    ).toBe("send")
    expect(
      decideAlert({ baseline: "green", lastNotifiedAt: null }, "red", now)
    ).toBe("send")
  })

  it("stays quiet when nothing changed or it got better, and lowers the bar", () => {
    expect(
      decideAlert({ baseline: "yellow", lastNotifiedAt: null }, "yellow", now)
    ).toBe("none")
    expect(
      decideAlert({ baseline: "red", lastNotifiedAt: null }, "green", now)
    ).toBe("set-baseline")
  })

  it("sends at most one alert per hour", () => {
    const recent = {
      baseline: "yellow" as const,
      lastNotifiedAt: minutesAgo(20),
    }
    expect(decideAlert(recent, "red", now)).toBe("none")
    const anHourAgo = {
      baseline: "yellow" as const,
      lastNotifiedAt: minutesAgo(61),
    }
    expect(decideAlert(anHourAgo, "red", now)).toBe("send")
    expect(ALERT_COOLDOWN_MS).toBe(3_600_000)
  })

  it("records a baseline the first time it sees a verdict", () => {
    expect(
      decideAlert({ baseline: null, lastNotifiedAt: null }, "red", now)
    ).toBe("set-baseline")
  })
})

describe("alertMessage", () => {
  it("names the trip, the new verdict and the main reason, linking to the trip", () => {
    const verdict = computeVerdict({
      segments: [
        {
          primary: "Closed",
          secondary: [],
          visibility: null,
          fromKm: 140,
          toKm: 150,
        },
      ],
      events: [],
      dataUpdatedAt: new Date(),
      now: new Date(),
      placeAt: () => "Lake Louise",
    })
    expect(alertMessage("lake-louise", verdict)).toEqual({
      title: "Calgary to Lake Louise: Check before you go",
      body: "Road closed near Lake Louise",
      url: "/trip?to=lake-louise",
      tag: "trip-lake-louise",
    })
  })
})

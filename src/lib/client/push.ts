"use client"

import { useSyncExternalStore } from "react"
import { isTripId, TRIP_IDS, type TripId } from "@/lib/trip/trips"

/**
 * Browser side of Trip Check alerts: the service worker, the push
 * subscription, and which trips this device asked about. No account: the
 * subscription itself is the only identity, and the server stores nothing
 * else about the person.
 */

const SW_URL = "/sw.js"
// Which trips have alerts on, for this device. A convenience for the UI only;
// the server's copy is what sends alerts.
const KEY = "camalberta:alerts"

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

/** iPhone and iPad only allow web push from a site added to the Home Screen. */
export function needsHomeScreen(): boolean {
  if (typeof window === "undefined") return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const standalone = window.matchMedia("(display-mode: standalone)").matches
  return ios && !standalone
}

// --- Trips with alerts on (localStorage, untrusted, try/catch wrapped) ----

const EMPTY: ReadonlySet<TripId> = new Set()
let trips: ReadonlySet<TripId> = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function load(): ReadonlySet<TripId> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return new Set()
    // Untrusted: keep only known trip ids from a reasonably sized list.
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length > TRIP_IDS.length * 4) {
      return new Set()
    }
    return new Set(parsed.filter(isTripId))
  } catch {
    return new Set()
  }
}

function save(next: ReadonlySet<TripId>) {
  trips = next
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {
    // Storage blocked: the change still applies for this page view.
  }
  for (const listener of listeners) listener()
}

function subscribeStore(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): ReadonlySet<TripId> {
  if (!loaded) {
    loaded = true
    trips = load()
  }
  return trips
}

/** Trips this device has alerts on for. Empty on the server. */
export function useAlertTrips(): ReadonlySet<TripId> {
  return useSyncExternalStore(subscribeStore, snapshot, () => EMPTY)
}

// --- Push subscription --------------------------------------------------

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function sameKey(a: ArrayBuffer | null, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false
  const view = new Uint8Array(a)
  return view.every((byte, i) => byte === b[i])
}

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SW_URL, { scope: "/" })
  return navigator.serviceWorker.ready
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

export class AlertError extends Error {
  override name = "AlertError"
}

/**
 * Turn on alerts for a trip: ask for permission, subscribe this browser to
 * push (reusing its existing subscription), and register it for the trip.
 */
export async function enableAlerts(
  trip: TripId,
  publicKey: string
): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    throw new AlertError(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in your browser settings."
        : "Notifications weren't allowed."
    )
  }

  const reg = await registration()
  const serverKey = keyBytes(publicKey)
  let subscription = await reg.pushManager.getSubscription()
  // A subscription made for different server keys can't receive our alerts.
  if (
    subscription &&
    !sameKey(subscription.options.applicationServerKey, serverKey)
  ) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: serverKey,
  })

  const res = await postJson("/api/push/subscribe", {
    trip,
    subscription: subscription.toJSON(),
  })
  if (!res.ok) {
    throw new AlertError(
      res.status === 429
        ? "Too many tries. Wait a minute and try again."
        : "Couldn't turn on alerts. Try again later."
    )
  }
  save(new Set([...snapshot(), trip]))
}

/**
 * Turn off alerts for a trip. When no trips are left, the browser's push
 * subscription is removed too.
 */
export async function disableAlerts(trip: TripId): Promise<void> {
  const next = new Set(snapshot())
  next.delete(trip)

  const reg = await navigator.serviceWorker.getRegistration("/")
  const subscription = await reg?.pushManager.getSubscription()
  if (subscription) {
    const res = await postJson("/api/push/unsubscribe", {
      endpoint: subscription.endpoint,
      trip,
    })
    if (!res.ok) throw new AlertError("Couldn't turn off alerts. Try again.")
    if (next.size === 0) await subscription.unsubscribe()
  }
  save(next)
}

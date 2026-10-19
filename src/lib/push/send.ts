import "server-only"

import webpush, { WebPushError } from "web-push"

import { env } from "@/lib/env"

import { isAllowedPushEndpoint } from "./endpoints"
import type { PushMessage } from "./policy"

export function isPushConfigured(): boolean {
  return Boolean(
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
  )
}

/** The VAPID public key the browser needs to subscribe, if push is on. */
export function vapidPublicKey(): string | null {
  return isPushConfigured() ? env.VAPID_PUBLIC_KEY! : null
}

export interface StoredSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

/**
 * - "ok": the push service accepted it.
 * - "gone": the subscription is dead or invalid (expired, unsubscribed, or
 *   keys that don't match); delete it.
 * - "failed": a temporary problem (push service down, rate limited, timeout);
 *   keep the subscription and try again next time.
 */
export type SendResult = "ok" | "gone" | "failed"

// 404/410: expired or unsubscribed. 400/401/403: malformed, or the
// subscription was made for different VAPID keys. All permanent.
const PERMANENT_FAILURES = new Set([400, 401, 403, 404, 410])

export async function sendPush(
  subscription: StoredSubscription,
  message: PushMessage
): Promise<SendResult> {
  if (!isPushConfigured()) return "failed"
  // Checked at subscribe time too; this guards rows from any other path.
  if (!isAllowedPushEndpoint(subscription.endpoint)) return "gone"

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(message),
      {
        vapidDetails: {
          subject: env.VAPID_SUBJECT!,
          publicKey: env.VAPID_PUBLIC_KEY!,
          privateKey: env.VAPID_PRIVATE_KEY!,
        },
        // Undelivered alerts expire after 4 hours (a stale road alert is
        // worse than none), and a newer one for the same trip replaces it.
        TTL: 4 * 60 * 60,
        urgency: "high",
        topic: message.tag,
        timeout: 10_000,
      }
    )
    return "ok"
  } catch (error) {
    if (
      error instanceof WebPushError &&
      PERMANENT_FAILURES.has(error.statusCode)
    ) {
      return "gone"
    }
    // Never log the endpoint: it's a capability URL for that browser.
    const status = error instanceof WebPushError ? ` ${error.statusCode}` : ""
    const name = error instanceof Error ? error.name : "Error"
    console.error(`[push] delivery failed:${status} ${name}`)
    return "failed"
  }
}

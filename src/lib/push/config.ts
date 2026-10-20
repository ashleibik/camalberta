import "server-only"

import { env } from "@/lib/env"

/** Push alerts are on only when all three VAPID settings are present. */
export function isPushConfigured(): boolean {
  return Boolean(
    env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
  )
}

/**
 * The VAPID public key browsers need to subscribe, or null when alerts are
 * off. Public by design; the Trip Check page receives it as a prop.
 */
export function vapidPublicKey(): string | null {
  return isPushConfigured() ? env.VAPID_PUBLIC_KEY! : null
}

import { z } from "zod"

import { tripIdSchema } from "@/lib/trip/trip-schema"

import { isAllowedPushEndpoint, MAX_ENDPOINT_LENGTH } from "./endpoints"

/**
 * Request bodies for the push endpoints. Strict: unknown keys are a 400. The
 * subscription is exactly what `PushSubscription.toJSON()` returns.
 */

function decodedLength(value: string): number {
  return Buffer.from(value, "base64url").length
}

const base64url = z.string().regex(/^[A-Za-z0-9_-]+={0,2}$/, "not base64url")

const endpointSchema = z
  .string()
  .max(MAX_ENDPOINT_LENGTH)
  .refine(isAllowedPushEndpoint, "unsupported push service")

export const pushSubscriptionSchema = z.strictObject({
  endpoint: endpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    // The browser's P-256 public key, uncompressed: 65 bytes starting 0x04.
    p256dh: base64url
      .max(100)
      .refine(
        (v) => decodedLength(v) === 65 && Buffer.from(v, "base64url")[0] === 4,
        "not a P-256 public key"
      ),
    // The 16-byte authentication secret.
    auth: base64url.max(32).refine((v) => decodedLength(v) === 16, "bad auth"),
  }),
})

export const subscribeBodySchema = z.strictObject({
  trip: tripIdSchema,
  subscription: pushSubscriptionSchema,
})

/** Unsubscribe one trip, or every trip for this browser when `trip` is omitted. */
export const unsubscribeBodySchema = z.strictObject({
  endpoint: endpointSchema,
  trip: z.optional(tripIdSchema),
})

export type SubscribeBody = z.infer<typeof subscribeBodySchema>
export type UnsubscribeBody = z.infer<typeof unsubscribeBodySchema>

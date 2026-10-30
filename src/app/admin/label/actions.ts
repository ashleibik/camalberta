"use server"

import { headers } from "next/headers"
import { z } from "zod"

import { isAdminAuthorized, isAdminEnabled } from "@/lib/auth"
import { ROAD_LABELS } from "@/lib/collect/labels"
import { setHumanLabel } from "@/lib/collect/review"
import { clientIpFromHeaders, rateLimit, RATE_LIMITS } from "@/lib/rate-limit"

const inputSchema = z.strictObject({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  // A label, "none" (reviewed, no label fits), or null (undo the review).
  label: z.enum([...ROAD_LABELS, "none"]).nullable(),
})

export type SaveLabelResult = { ok: true } | { ok: false; error: string }

/**
 * Save a human label from /admin/label. A server action POSTs to the page's
 * own URL, so the browser sends the admin login with it and Next.js checks
 * that the request comes from our own origin. Checked again here: rate
 * limit, login, then strict input validation.
 */
export async function saveLabel(input: unknown): Promise<SaveLabelResult> {
  if (!isAdminEnabled()) return { ok: false, error: "Not available." }
  const h = await headers()
  const limit = rateLimit(`admin:${clientIpFromHeaders(h)}`, RATE_LIMITS.admin)
  if (!limit.ok) return { ok: false, error: "Too many changes. Wait a minute." }
  if (!(await isAdminAuthorized(h.get("authorization")))) {
    return { ok: false, error: "Not signed in." }
  }
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "Invalid label." }
  try {
    const found = await setHumanLabel(parsed.data.id, parsed.data.label)
    return found ? { ok: true } : { ok: false, error: "Snapshot not found." }
  } catch {
    return { ok: false, error: "Couldn't save. Try again." }
  }
}

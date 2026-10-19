import "server-only"

import { z } from "zod"

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Unset in local dev: we fall back to embedded PGlite.
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z.url({ protocol: /^postgres(ql)?$/ }).optional()
  ),
  PGLITE_DATA_DIR: z.preprocess(
    emptyToUndefined,
    z.string().default(".data/pglite")
  ),
  // Protects /api/sync and admin routes. Unset means those routes reject every
  // request (fail closed).
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  // 511 Alberta developer key (query-string `key`). Unset means the 511
  // adapter is skipped, so a Calgary-only sync still works.
  ALBERTA_511_API_KEY: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional()
  ),
  // Web Push (Trip Check alerts). Generate with `npx web-push
  // generate-vapid-keys`. All three unset means alerts are off: the button is
  // hidden and the sync sends nothing.
  VAPID_PUBLIC_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{86,88}$/, "expected a base64url P-256 public key")
      .optional()
  ),
  VAPID_PRIVATE_KEY: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{42,44}$/, "expected a base64url P-256 private key")
      .optional()
  ),
  // Who push services can contact about our alerts: mailto: or https: URL.
  VAPID_SUBJECT: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^(mailto:\S+@\S+|https:\/\/\S+)$/, "expected mailto: or https:")
      .optional()
  ),
})

export type Env = z.infer<typeof envSchema>

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    // Only variable names and messages, never values.
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n")
    throw new Error(`Invalid environment variables:\n${problems}`)
  }
  return parsed.data
}

export const env = loadEnv()

import "server-only"

import { z } from "zod"

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value

const envSchema = z
  .object({
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
        .regex(
          /^[A-Za-z0-9_-]{86,88}$/,
          "expected a base64url P-256 public key"
        )
        .optional()
    ),
    VAPID_PRIVATE_KEY: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(
          /^[A-Za-z0-9_-]{42,44}$/,
          "expected a base64url P-256 private key"
        )
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
    // Road condition snapshots (Phase 9). With the S3_* settings below they go
    // to an S3-compatible bucket (Cloudflare R2 in production); without them,
    // to this local folder.
    SNAPSHOT_DIR: z.preprocess(
      emptyToUndefined,
      z.string().default(".data/snapshots")
    ),
    // R2: https://<account id>.r2.cloudflarestorage.com (no bucket in the URL).
    S3_ENDPOINT: z.preprocess(
      emptyToUndefined,
      z.url({ protocol: /^https$/ }).optional()
    ),
    S3_BUCKET: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, "invalid bucket name")
        .optional()
    ),
    S3_ACCESS_KEY_ID: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional()
    ),
    S3_SECRET_ACCESS_KEY: z.preprocess(
      emptyToUndefined,
      z.string().min(1).optional()
    ),
    // R2 uses "auto".
    S3_REGION: z.preprocess(emptyToUndefined, z.string().default("auto")),
    // The public site origin (https://...), for absolute link-preview URLs.
    // Unset: Vercel's production domain, else http://localhost:3000.
    NEXT_PUBLIC_SITE_URL: z.preprocess(
      emptyToUndefined,
      z.url({ protocol: /^https?$/ }).optional()
    ),
    // The /admin pages (label review). In production they exist only while
    // ADMIN_ENABLED is "true" (404 otherwise); in development, unless it's
    // "false". Either way they need ADMIN_USERNAME and ADMIN_PASSWORD, a login
    // separate from CRON_SECRET.
    ADMIN_ENABLED: z.preprocess(emptyToUndefined, z.string().optional()),
    ADMIN_USERNAME: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(
          /^[A-Za-z0-9._@-]{1,64}$/,
          "letters, digits and . _ @ - only (no colon), at most 64"
        )
        .optional()
    ),
    ADMIN_PASSWORD: z.preprocess(
      emptyToUndefined,
      z.string().min(16).max(256).optional()
    ),
  })
  .superRefine((value, ctx) => {
    if (
      value.ADMIN_ENABLED?.trim().toLowerCase() === "true" &&
      (!value.ADMIN_USERNAME || !value.ADMIN_PASSWORD)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["ADMIN_ENABLED"],
        message: "ADMIN_ENABLED=true needs ADMIN_USERNAME and ADMIN_PASSWORD",
      })
    }
    if (value.ADMIN_PASSWORD && value.ADMIN_PASSWORD === value.CRON_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["ADMIN_PASSWORD"],
        message: "must not be the same as CRON_SECRET",
      })
    }
    // All four bucket settings, or none: a half-configured bucket would
    // silently fall back to local storage on a server that has no disk.
    const s3 = [
      value.S3_ENDPOINT,
      value.S3_BUCKET,
      value.S3_ACCESS_KEY_ID,
      value.S3_SECRET_ACCESS_KEY,
    ]
    const set = s3.filter((v) => v !== undefined).length
    if (set > 0 && set < s3.length) {
      ctx.addIssue({
        code: "custom",
        path: ["S3_ENDPOINT"],
        message:
          "set all of S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or none",
      })
    }
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

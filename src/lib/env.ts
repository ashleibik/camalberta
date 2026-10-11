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

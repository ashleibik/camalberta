import { z } from "zod"

/** Our own camera id: `<source>:<sourceId>`. Never a URL. */
export const cameraIdSchema = z
  .string()
  .max(128)
  .regex(/^[a-z0-9]+:[a-z0-9-]+$/, "invalid camera id")

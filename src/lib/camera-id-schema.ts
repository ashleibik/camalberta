import { z } from "zod"

import { CAMERA_ID_PATTERN, MAX_CAMERA_ID_LENGTH } from "./camera-id"

/** Route-param validation for our camera ids (server side). */
export const cameraIdSchema = z
  .string()
  .max(MAX_CAMERA_ID_LENGTH)
  .regex(CAMERA_ID_PATTERN, "invalid camera id")

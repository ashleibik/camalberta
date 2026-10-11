import { alberta511Adapter } from "./alberta511"
import { calgaryAdapter } from "./calgary"
import type { Adapter } from "./types"

/** Every camera source. Add a new adapter here to include it in sync. */
export const adapters: readonly Adapter[] = [calgaryAdapter, alberta511Adapter]

export type { Adapter, NormalizedCamera } from "./types"

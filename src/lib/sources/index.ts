import { alberta511Adapter } from "./alberta511"
import { banffAdapter } from "./banff"
import { calgaryAdapter } from "./calgary"
import { edmontonAdapter } from "./edmonton"
import { sunshineAdapter } from "./sunshine"
import type { Adapter } from "./types"

/** Every camera source. Add a new adapter here to include it in sync. */
export const adapters: readonly Adapter[] = [
  calgaryAdapter,
  alberta511Adapter,
  banffAdapter,
  sunshineAdapter,
  edmontonAdapter,
]

export type { Adapter, NormalizedCamera } from "./types"

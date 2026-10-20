import { config } from "zod/mini"

// Zod 4 compiles object parsers with `new Function` when it can, and probes
// for that on first use. Our CSP blocks eval, so every page logged a
// securitypolicyviolation (and lost Lighthouse best-practices points) even
// though Zod falls back fine. `jitless` skips both the probe and the JIT.
// Imported first by the client modules that use Zod (only the wall config:
// other browser code validates with plain guards to stay light). The setting
// lives in Zod's shared core, so it would cover `zod` too.
config({ jitless: true })

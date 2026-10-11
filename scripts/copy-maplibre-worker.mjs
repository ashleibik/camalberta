// Copy MapLibre's web worker (and the shared chunk it imports) into public/ so
// we can serve it from our own origin. MapLibre otherwise loads the worker via
// `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, which Turbopack dev
// does not serve, leaving the map stuck "not loaded". We point MapLibre at the
// copied file with `setWorkerUrl` (see map-view.tsx). Runs on predev/prebuild.
import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

const require = createRequire(import.meta.url)
const distDir = path.dirname(require.resolve("maplibre-gl/package.json"))
const srcDir = path.join(distDir, "dist")
const outDir = path.resolve("public/vendor/maplibre")

mkdirSync(outDir, { recursive: true })
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(srcDir, file), path.join(outDir, file))
}
console.log(`Copied MapLibre worker to ${outDir}`)

// Lighthouse, the way Phase 8 measured it: three runs per page and form
// factor against a warm production server, reporting the median.
//
//   npm run build
//   PGLITE_DATA_DIR=.data/pglite-perf npm run db:migrate
//   PGLITE_DATA_DIR=.data/pglite-perf npx next start -p 3100
//   (sync once so the pages have data, then:)
//   npm run lighthouse              # or: npm run lighthouse -- http://host:port
//
// Use its own PGlite folder: two servers must never share one. Lighthouse is
// pinned and run through npx (not a project dependency). Raw reports go to
// .lighthouse/ (gitignored).
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"

const LIGHTHOUSE = "lighthouse@13.5.0"
const BASE = new URL(process.argv[2] ?? "http://localhost:3100")
if (BASE.protocol !== "http:" && BASE.protocol !== "https:") {
  throw new Error("Give an http(s) base URL, e.g. http://localhost:3100")
}
const RUNS = 3
const PAGES = [
  ["trip", "/trip?to=banff"],
  ["map", "/map"],
  ["wall", "/wall"],
]
const OUT = path.join(import.meta.dirname, "..", ".lighthouse")
mkdirSync(OUT, { recursive: true })

function run(url, mode, file) {
  const args = [
    "-y",
    LIGHTHOUSE,
    url,
    ...(mode === "desktop" ? ["--preset=desktop"] : []),
    "--only-categories=performance,accessibility,best-practices,seo",
    "--output=json",
    `--output-path=${file}`,
    "--chrome-flags=--headless=new",
    "--quiet",
  ]
  // Windows needs a shell to run npx.cmd; quote every argument so cmd.exe
  // never interprets characters in a URL (& | < > ^).
  const windows = process.platform === "win32"
  const result = spawnSync(
    "npx",
    windows ? args.map((arg) => `"${arg.replaceAll('"', "")}"`) : args,
    { stdio: "inherit", shell: windows }
  )
  if (result.status !== 0)
    throw new Error(`lighthouse failed for ${url} (${mode})`)
  const report = JSON.parse(readFileSync(file, "utf8"))
  if (report.runtimeError) return null // e.g. NO_NAVSTART: a flaky trace; skip
  const c = report.categories
  const a = report.audits
  return {
    perf: Math.round(c.performance.score * 100),
    a11y: Math.round(c.accessibility.score * 100),
    bp: Math.round(c["best-practices"].score * 100),
    seo: Math.round(c.seo.score * 100),
    lcp: a["largest-contentful-paint"].numericValue,
    tbt: a["total-blocking-time"].numericValue,
    cls: a["cumulative-layout-shift"].numericValue,
  }
}

const rows = []
for (const [name, pathname] of PAGES) {
  const url = new URL(pathname, BASE).toString()
  // Warm the server (and its report cache) first. A server that has only
  // just started can reset the first connections, so retry briefly.
  for (let ok = 0, tries = 0; ok < 3 && tries < 10; tries++) {
    try {
      await fetch(url).then((r) => r.arrayBuffer())
      ok++
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  for (const mode of ["mobile", "desktop"]) {
    const results = []
    for (let i = 1; i <= RUNS; i++) {
      const result = run(url, mode, path.join(OUT, `${name}-${mode}-${i}.json`))
      if (result) results.push(result)
    }
    results.sort((x, y) => x.perf - y.perf)
    const median = results[Math.floor(results.length / 2)]
    if (median)
      rows.push({ name, mode, runs: results.map((r) => r.perf), ...median })
  }
}

console.log(
  "\n| Page | Form factor | Performance (runs) | A11y | Best practices | SEO | LCP | TBT | CLS |"
)
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
for (const r of rows) {
  console.log(
    `| ${r.name} | ${r.mode} | ${r.perf} (${r.runs.join(", ")}) | ${r.a11y} | ${r.bp} | ${r.seo} | ${(r.lcp / 1000).toFixed(1)} s | ${Math.round(r.tbt)} ms | ${r.cls.toFixed(3)} |`
  )
}

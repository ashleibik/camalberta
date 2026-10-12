// hls.js ships types for its full build only; the light build (no subtitles,
// alternate audio or DRM) has the same API surface we use.
declare module "hls.js/light" {
  export * from "hls.js"
  export { default } from "hls.js"
}

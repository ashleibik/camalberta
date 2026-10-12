import { describe, expect, it } from "vitest"

import { isVideoSource, sourceFromId } from "./media"

describe("media", () => {
  it("only Edmonton is live video", () => {
    expect(isVideoSource("edmonton")).toBe(true)
    expect(isVideoSource("calgary")).toBe(false)
    expect(isVideoSource("sunshine")).toBe(false)
  })

  it("reads the source from one of our ids", () => {
    expect(sourceFromId("edmonton:12")).toBe("edmonton")
    expect(sourceFromId("banff:banff-moose")).toBe("banff")
    expect(sourceFromId("nope:1")).toBeNull()
    expect(sourceFromId("calgary")).toBeNull()
    expect(sourceFromId("toString:1")).toBeNull()
  })
})

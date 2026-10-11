import { describe, expect, it } from "vitest"

import { isAllowedImageUrl } from "./hosts"

describe("isAllowedImageUrl", () => {
  it("accepts the Calgary image host over http and https", () => {
    expect(
      isAllowedImageUrl("calgary", "http://trafficcam.calgary.ca/loc1.jpg")
    ).toBe(true)
    expect(
      isAllowedImageUrl("calgary", "https://trafficcam.calgary.ca/loc1.jpg")
    ).toBe(true)
  })

  it("accepts the 511 image host", () => {
    expect(
      isAllowedImageUrl("alberta511", "https://511.alberta.ca/map/Cctv/11")
    ).toBe(true)
  })

  it("rejects a different host for the source", () => {
    expect(
      isAllowedImageUrl("calgary", "https://evil.example.com/loc1.jpg")
    ).toBe(false)
    // Right host but wrong source.
    expect(
      isAllowedImageUrl("alberta511", "http://trafficcam.calgary.ca/loc1.jpg")
    ).toBe(false)
  })

  it("rejects non-http(s) and malformed urls", () => {
    expect(isAllowedImageUrl("calgary", "ftp://trafficcam.calgary.ca/x")).toBe(
      false
    )
    expect(isAllowedImageUrl("calgary", "file:///etc/passwd")).toBe(false)
    expect(isAllowedImageUrl("calgary", "not a url")).toBe(false)
  })

  it("is not fooled by a lookalike subdomain", () => {
    expect(
      isAllowedImageUrl(
        "calgary",
        "https://trafficcam.calgary.ca.evil.com/loc1.jpg"
      )
    ).toBe(false)
  })
})

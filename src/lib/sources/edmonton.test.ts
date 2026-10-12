import { describe, expect, it } from "vitest"

import edmontonFixture from "./__fixtures__/edmonton.json"
import {
  normalizeEdmonton,
  parseEdmontonRecords,
  type EdmontonCamera,
} from "./edmonton"

const records = parseEdmontonRecords(edmontonFixture)

const sample: EdmontonCamera = {
  Code: 12,
  Forge: 2,
  Latitude: 53.4538,
  Longitude: -113.493,
  MMSUrl: "cityed1-winkcdn1.winkcdn.com",
  PrimaryRoad: "23 Avenue",
  SecondaryRoad: "Gateway Boulevard",
  Status: "1",
  StreamCode: "WF05-6212-B834-BD83-1FC4_ab",
}

describe("edmonton adapter", () => {
  it("parses every camera in the saved real response", () => {
    expect(records).toHaveLength(58)
  })

  it("normalizes the real response into Edmonton video cameras", () => {
    const cameras = normalizeEdmonton(records)
    expect(cameras).toHaveLength(58)
    for (const camera of cameras) {
      expect(camera.source).toBe("edmonton")
      expect(camera.id).toBe(`edmonton:${camera.sourceId}`)
      expect(camera.area).toBe("edmonton")
      expect(camera.imageUrl).toMatch(
        /^https:\/\/cityed1-winkcdn1\.winkcdn\.com\/\d+\/public\/hls\/[A-Za-z0-9-]+_[a-z0-9]+\.m3u8$/
      )
    }
  })

  it("builds the stream URL, name and id from one record", () => {
    const [camera] = normalizeEdmonton([sample])
    expect(camera).toMatchObject({
      id: "edmonton:12",
      name: "23 Avenue & Gateway Boulevard",
      road: "23 Avenue",
      lat: 53.4538,
      lng: -113.493,
      imageUrl:
        "https://cityed1-winkcdn1.winkcdn.com/2/public/hls/WF05-6212-B834-BD83-1FC4_ab.m3u8",
    })
  })

  it("uses the primary road alone when there is no cross street", () => {
    const [camera] = normalizeEdmonton([{ ...sample, SecondaryRoad: null }])
    expect(camera?.name).toBe("23 Avenue")
  })

  it("skips cameras the City lists as unavailable", () => {
    expect(normalizeEdmonton([{ ...sample, Status: "2" }])).toHaveLength(0)
  })

  it("rejects a stream host that is not the City's CDN", () => {
    expect(
      normalizeEdmonton([{ ...sample, MMSUrl: "evil.example.com" }])
    ).toHaveLength(0)
  })

  it("drops a record with a malformed stream code instead of failing", () => {
    const raw = {
      d: [
        { ...sample, StreamCode: "../../etc/passwd" },
        { ...sample, Code: 13, Latitude: "53.5", Longitude: "-113.5" },
      ],
    }
    const parsed = parseEdmontonRecords(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.Latitude).toBe(53.5)
  })
})

import { z } from "zod"

import { readBodyLimited } from "@/lib/proxy/upstream"

/** For routes that take no query parameters: any parameter is a 400. */
export const noQuery = z.strictObject({})

export type QueryResult<T> =
  { ok: true; data: T } | { ok: false; response: Response }

function invalidQuery(): Response {
  return Response.json({ error: "Invalid query" }, { status: 400 })
}

/**
 * Validate a request's query string with Zod. Unknown keys fail when the
 * schema is strict, and a repeated key always fails (`?t=1&t=2` is ambiguous).
 * On failure, `response` is a ready 400 that names no internals.
 */
export function parseQuery<T extends z.ZodType>(
  request: Request,
  schema: T
): QueryResult<z.output<T>> {
  const params = new URL(request.url).searchParams
  const keys = [...params.keys()]
  if (new Set(keys).size !== keys.length) {
    return { ok: false, response: invalidQuery() }
  }
  const parsed = schema.safeParse(Object.fromEntries(params))
  if (!parsed.success) return { ok: false, response: invalidQuery() }
  return { ok: true, data: parsed.data }
}

const MAX_JSON_BODY_BYTES = 4 * 1024

function bodyError(status: number, error: string): QueryResult<never> {
  return { ok: false, response: Response.json({ error }, { status }) }
}

/**
 * Read and validate a small JSON request body (the push routes are the only
 * ones that take a body). Same-origin requests only: browsers mark
 * cross-site requests with Sec-Fetch-Site and Origin, and requiring
 * `application/json` means another site can't send one without a CORS
 * preflight we never approve. The body is size-capped while it streams in.
 */
export async function parseJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxBytes: number = MAX_JSON_BODY_BYTES
): Promise<QueryResult<z.output<T>>> {
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return bodyError(403, "Forbidden")
  const origin = request.headers.get("origin")
  if (origin) {
    let originHost: string | null = null
    try {
      originHost = new URL(origin).host
    } catch {
      // Malformed Origin: treated as a mismatch.
    }
    if (originHost !== request.headers.get("host")) {
      return bodyError(403, "Forbidden")
    }
  }

  const type = request.headers.get("content-type") ?? ""
  if (!/^application\/json\s*(;|$)/i.test(type)) {
    return bodyError(415, "Expected application/json")
  }

  const bytes = await readBodyLimited(request, maxBytes)
  if (!bytes) return bodyError(413, "Body too large")

  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return bodyError(400, "Invalid JSON")
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) return bodyError(400, "Invalid body")
  return { ok: true, data: parsed.data }
}

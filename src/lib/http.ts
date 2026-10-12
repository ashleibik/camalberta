import { z } from "zod"

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

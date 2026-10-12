"use client"

import type { CameraSource } from "@/lib/db/schema"
import { useHealth } from "@/lib/client/queries"
import { useNow } from "@/lib/client/use-now"
import { SOURCE_CREDITS, timeAgo } from "@/lib/format"

const CALGARY_TERMS_URL =
  "https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa"
const ALBERTA_511_URL = "https://511.alberta.ca/"

// Credited after the required "Data: ..." line; each owns its pictures.
const OTHER_SOURCES: CameraSource[] = ["banff", "sunshine", "edmonton"]

const linkClass = "underline-offset-2 hover:text-foreground hover:underline"

export function StatusBar() {
  const { data, isError } = useHealth()
  const now = useNow()

  const online = data?.totals.live ?? 0
  const lastSync = isError
    ? "unavailable"
    : now === null
      ? "…"
      : timeAgo(data?.lastSyncAt ?? null, now)

  return (
    <footer className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t bg-sidebar px-4 py-1.5 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full bg-status-live"
            aria-hidden="true"
          />
          <span>
            <span className="font-mono text-foreground">{online}</span> cameras
            online
          </span>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Last sync <span className="font-mono">{lastSync}</span>
        </span>
      </div>
      <p>
        Data:{" "}
        <a
          href={CALGARY_TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          City of Calgary (Open Government Licence)
        </a>{" "}
        and{" "}
        <a
          href={ALBERTA_511_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          511 Alberta
        </a>
        . Cameras also ©{" "}
        {OTHER_SOURCES.map((source, i) => (
          <span key={source}>
            {i > 0 && (i === OTHER_SOURCES.length - 1 ? " and " : ", ")}
            <a
              href={SOURCE_CREDITS[source].url}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              {SOURCE_CREDITS[source].owner}
            </a>
          </span>
        ))}
        .
      </p>
    </footer>
  )
}

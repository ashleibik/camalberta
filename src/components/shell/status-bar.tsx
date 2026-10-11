const CALGARY_TERMS_URL =
  "https://data.calgary.ca/stories/s/Open-Calgary-Terms-of-Use/u45n-7awa"
const ALBERTA_511_URL = "https://511.alberta.ca/"

export function StatusBar() {
  return (
    <footer className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t bg-sidebar px-4 py-1.5 text-xs text-muted-foreground">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full bg-status-live"
            aria-hidden="true"
          />
          <span>
            <span className="font-mono text-foreground">0</span> cameras online
          </span>
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Last sync <span className="font-mono">never</span>
        </span>
      </div>
      <p>
        Data:{" "}
        <a
          href={CALGARY_TERMS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          City of Calgary (Open Government Licence)
        </a>{" "}
        and{" "}
        <a
          href={ALBERTA_511_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          511 Alberta
        </a>
      </p>
    </footer>
  )
}

/**
 * "Skip to content": the first thing a keyboard user tabs to, hidden until
 * focused. Pages give their main region `id="main"` and `tabIndex={-1}`.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-3 focus:ring-ring/50"
    >
      Skip to content
    </a>
  )
}

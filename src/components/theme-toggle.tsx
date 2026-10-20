"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  // Both icons are rendered and swapped with CSS, so the server markup matches
  // the client before the theme is known (no hydration mismatch). A native
  // title instead of a Radix tooltip: this button is on every page, and the
  // tooltip library (~30 KB) was the only reason Trip Check loaded it.
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle light and dark theme"
      title="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" aria-hidden="true" />
      <Moon className="block dark:hidden" aria-hidden="true" />
    </Button>
  )
}

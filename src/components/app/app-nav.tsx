import { Map as MapIcon, Route } from "lucide-react"

import { cn } from "@/lib/utils"

import { IntentLink } from "./intent-link"

const LINKS = [
  {
    href: "/trip",
    key: "trip",
    label: "Trip Check",
    short: "Trip",
    Icon: Route,
  },
  {
    href: "/map",
    key: "map",
    label: "Camera map",
    short: "Map",
    Icon: MapIcon,
  },
] as const

/**
 * The two main views, side by side: Trip Check (the homepage) and the full
 * camera map, each one tap from the other.
 */
export function AppNav({
  active,
  className,
}: {
  active: "trip" | "map"
  className?: string
}) {
  return (
    <nav
      aria-label="Views"
      className={cn("flex rounded-lg bg-muted p-0.5", className)}
    >
      {LINKS.map(({ href, key, label, short, Icon }) => {
        const current = key === active
        return (
          <IntentLink
            key={key}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              current
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{label}</span>
          </IntentLink>
        )
      })}
    </nav>
  )
}

import { Brand } from "@/components/shell/brand"
import { DetailPanel } from "@/components/shell/detail-panel"
import { MapPlaceholder } from "@/components/shell/map-placeholder"
import { Sidebar } from "@/components/shell/sidebar"
import { StatusBar } from "@/components/shell/status-bar"
import { ThemeToggle } from "@/components/theme-toggle"

/**
 * Desktop: sidebar | map | detail panel, with the status bar underneath.
 * Mobile: header + full-width map. The sidebar becomes a bottom Sheet in
 * Phase 4.
 */
export function AppShell() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-12 shrink-0 items-center justify-between border-b bg-sidebar px-4 md:hidden">
        <Brand />
        <ThemeToggle />
      </header>

      <div className="flex min-h-0 flex-1">
        <Sidebar className="hidden w-80 shrink-0 border-r md:flex" />
        <main className="relative min-w-0 flex-1">
          <MapPlaceholder />
        </main>
        <DetailPanel className="hidden w-96 shrink-0 border-l xl:flex" />
      </div>

      <StatusBar />
    </div>
  )
}

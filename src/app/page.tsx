import { AppShell } from "@/components/app/app-shell"
import { AppStateProvider } from "@/components/app/app-state"

export default function HomePage() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  )
}

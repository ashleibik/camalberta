import type { Metadata } from "next"

import { AppShell } from "@/components/app/app-shell"
import { AppStateProvider } from "@/components/app/app-state"

export const metadata: Metadata = {
  title: "Camera map",
  description:
    "Every public traffic camera in Calgary, the Bow Valley, along the QEII and in Edmonton, on one live map.",
}

export default function MapPage() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  )
}

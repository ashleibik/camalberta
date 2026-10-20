import type { Metadata } from "next"

import { AppShell } from "@/components/app/app-shell"
import { AppStateProvider } from "@/components/app/app-state"
import { pageMetadata } from "@/lib/site"

export const metadata: Metadata = pageMetadata({
  title: "Camera map",
  description:
    "Every public traffic camera in Calgary, the Bow Valley, along the QEII and in Edmonton, on one live map. Photos refresh on their own; Edmonton's cameras are live video.",
  path: "/map",
})

export default function MapPage() {
  return (
    <AppStateProvider>
      <AppShell />
    </AppStateProvider>
  )
}

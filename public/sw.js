// CamAlberta service worker. It does one thing: show Trip Check alerts
// ("this trip got worse") and open the trip when one is tapped. No caching,
// no offline mode, no background requests.

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

function text(value, fallback, max) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : fallback
}

// Only paths on this site may be opened (never another origin).
function samePath(value) {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\")
    ? value
    : "/trip"
}

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = text(data.title, "CamAlberta", 120)
  // Notifications render plain text, never HTML.
  const options = {
    body: text(data.body, "", 300),
    tag: text(data.tag, "camalberta", 64),
    renotify: true,
    data: { url: samePath(data.url) },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL(
    samePath(event.notification.data?.url),
    self.location.origin
  )
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      })
      for (const client of windows) {
        if (new URL(client.url).origin === url.origin && "focus" in client) {
          await client.focus()
          if ("navigate" in client) await client.navigate(url.href)
          return
        }
      }
      await self.clients.openWindow(url.href)
    })()
  )
})

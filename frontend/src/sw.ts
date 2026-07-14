/// <reference lib="webworker" />
import type { PrecacheEntry } from 'workbox-precaching'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] }

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'POST' || url.pathname !== '/share-target') return

  e.respondWith(
    e.request.formData().then(async (form) => {
      await saveSharePayload({
        title: form.get('title') as string | null,
        text: form.get('text') as string | null,
        files: form.getAll('files') as File[],
      })
      return Response.redirect('/share', 303)
    }),
  )
})

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/api\//],
  }),
)

function saveSharePayload(data: { title: string | null; text: string | null; files: File[] }): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('keni-share', 1)
    open.onupgradeneeded = () => open.result.createObjectStore('pending')
    open.onsuccess = () => {
      const db = open.result
      const tx = db.transaction('pending', 'readwrite')
      tx.objectStore('pending').put({ ...data, ts: Date.now() }, 'latest')
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
    open.onerror = () => reject(open.error)
  })
}

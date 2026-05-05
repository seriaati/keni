export interface SharedPayload {
  title: string | null
  text: string | null
  files: File[]
  ts: number
}

const DB_NAME = 'keni-share'
const DB_VERSION = 1
const STORE = 'pending'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getAndClearSharedPayload(): Promise<SharedPayload | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const get = store.get('latest')
    get.onsuccess = () => {
      const data = get.result as SharedPayload | undefined
      if (data) store.delete('latest')
      tx.oncomplete = () => { db.close(); resolve(data ?? null) }
    }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

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

export async function getSharedPayload(): Promise<SharedPayload | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const get = tx.objectStore(STORE).get('latest')
    get.onsuccess = () => { db.close(); resolve((get.result as SharedPayload | undefined) ?? null) }
    get.onerror = () => { db.close(); reject(get.error) }
  })
}

export async function clearSharedPayload(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
    tx.objectStore(STORE).delete('latest')
  })
}

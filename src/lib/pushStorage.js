// Shared contract with public/push-worker.js. No endpoints, keys or JWTs here.
export const PUSH_DB = 'futari-push-consent-v1'
export const PUSH_STORE = 'device'

export function createPushStorage(indexedDB) {
  function update(change) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(PUSH_DB, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(PUSH_STORE)
      open.onerror = () => reject(new Error('端末の通知設定を保存できません。'))
      open.onblocked = () => reject(new Error('他のタブを閉じて再試行してください。'))
      open.onsuccess = () => {
        const db = open.result
        const tx = db.transaction(PUSH_STORE, 'readwrite')
        const table = tx.objectStore(PUSH_STORE)
        const request = table.get('consent')
        let result
        request.onsuccess = () => {
          try {
            result = change(request.result || { revision: 0, sessionOwner: null, record: null })
            table.put(result, 'consent')
          } catch { tx.abort() }
        }
        tx.oncomplete = () => { db.close(); resolve(result) }
        tx.onabort = tx.onerror = () => { db.close(); reject(new Error('端末の通知設定を保存できません。')) }
      }
    })
  }
  return { update, read: () => update((value) => value) }
}

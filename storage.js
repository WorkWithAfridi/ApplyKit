const ApplyKitStorage = (() => {
  const databaseName = "applykit-private";
  const storeName = "files";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(storeName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open browser storage."));
    });
  }

  async function transact(mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const result = operation(tx.objectStore(storeName));
      tx.oncomplete = () => { db.close(); resolve(result?.result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || result?.error || new Error("Could not save browser data.")); };
    });
  }

  return {
    async saveResume(file) {
      if (!file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");
      const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...header) !== "%PDF-") throw new Error("That file does not appear to be a valid PDF.");
      return transact("readwrite", store => store.put({ name: file.name, file }, "resume"));
    },
    getResume() {
      return transact("readonly", store => store.get("resume"));
    },
    removeResume() {
      return transact("readwrite", store => store.delete("resume"));
    }
  };
})();

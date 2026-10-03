(function () {
  "use strict";

  const DATABASE_NAME = "umdgg-learner-notes";
  const DATABASE_VERSION = 1;
  const STORE_NAME = "notes";
  let databasePromise = null;
  let warningShown = false;

  function warn(error) {
    if (warningShown) return;
    warningShown = true;
    console.warn("Learner notes could not use IndexedDB; notes will remain available only in this session.", error);
  }

  function openDatabase() {
    if (databasePromise) return databasePromise;
    if (!window.indexedDB) {
      warn(new Error("IndexedDB is unavailable."));
      databasePromise = Promise.resolve(null);
      return databasePromise;
    }

    databasePromise = new Promise(resolve => {
      let request;
      try {
        request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      } catch (error) {
        warn(error);
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: ["appUuid", "slideUuid"] });
          store.createIndex("appUuid", "appUuid", { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => {
        warn(request.error);
        resolve(null);
      };
      request.onblocked = () => warn(new Error("The learner notes database upgrade is blocked by another tab."));
    });
    return databasePromise;
  }

  async function getNote(appUuid, slideUuid) {
    const database = await openDatabase();
    if (!database) return null;
    return new Promise(resolve => {
      let request;
      try {
        const transaction = database.transaction(STORE_NAME, "readonly");
        request = transaction.objectStore(STORE_NAME).get([appUuid, slideUuid]);
      } catch (error) {
        warn(error);
        resolve(null);
        return;
      }
      request.onsuccess = () => resolve(request.result ? request.result.text : null);
      request.onerror = () => {
        warn(request.error);
        resolve(null);
      };
    });
  }

  async function saveNote(appUuid, slideUuid, text) {
    const database = await openDatabase();
    if (!database) return false;
    return new Promise(resolve => {
      let transaction;
      let store;
      try {
        transaction = database.transaction(STORE_NAME, "readwrite");
        store = transaction.objectStore(STORE_NAME);
      } catch (error) {
        warn(error);
        resolve(false);
        return;
      }
      if (text === "") {
        store.delete([appUuid, slideUuid]);
      } else {
        store.put({
          appUuid,
          slideUuid,
          text,
          updatedAt: new Date().toISOString(),
          schemaVersion: 1
        });
      }
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        warn(transaction.error);
        resolve(false);
      };
      transaction.onabort = () => {
        warn(transaction.error);
        resolve(false);
      };
    });
  }

  async function getAllNotes(appUuid) {
    const database = await openDatabase();
    if (!database) return [];
    return new Promise(resolve => {
      let request;
      try {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const index = transaction.objectStore(STORE_NAME).index("appUuid");
        request = index.getAll(window.IDBKeyRange.only(appUuid));
      } catch (error) {
        warn(error);
        resolve([]);
        return;
      }
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => {
        warn(request.error);
        resolve([]);
      };
    });
  }

  async function replaceAllNotes(appUuid, notes) {
    const database = await openDatabase();
    if (!database) return false;
    return new Promise(resolve => {
      let transaction;
      let store;
      let cursorRequest;
      try {
        transaction = database.transaction(STORE_NAME, "readwrite");
        store = transaction.objectStore(STORE_NAME);
        cursorRequest = store.index("appUuid").openKeyCursor(window.IDBKeyRange.only(appUuid));
      } catch (error) {
        warn(error);
        resolve(false);
        return;
      }

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          cursor.continue();
          return;
        }
        notes.forEach(note => store.put({
          appUuid,
          slideUuid: note.slideUuid,
          text: note.text,
          updatedAt: note.updatedAt || new Date().toISOString(),
          slideTitle: note.slideTitle || null,
          routeAtExport: note.routeAtExport || null,
          schemaVersion: 1
        }));
      };
      cursorRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => {
        warn(transaction.error);
        resolve(false);
      };
      transaction.onabort = () => {
        warn(transaction.error);
        resolve(false);
      };
    });
  }

  window.UMDGGLearnerNotes = { getNote, saveNote, getAllNotes, replaceAllNotes };
})();

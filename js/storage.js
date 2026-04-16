/* storage.js — Promisified wrappers for chrome.storage */

const StorageSync = {
  get(key) {
    return new Promise(resolve =>
      chrome.storage.sync.get(key, data => resolve(data[key] ?? null))
    );
  },
  set(key, val) {
    return new Promise(resolve =>
      chrome.storage.sync.set({ [key]: val }, resolve)
    );
  },
  remove(key) {
    return new Promise(resolve =>
      chrome.storage.sync.remove(key, resolve)
    );
  }
};

const StorageLocal = {
  get(key) {
    return new Promise(resolve =>
      chrome.storage.local.get(key, data => resolve(data[key] ?? null))
    );
  },
  set(key, val) {
    return new Promise(resolve =>
      chrome.storage.local.set({ [key]: val }, resolve)
    );
  },
  remove(key) {
    return new Promise(resolve =>
      chrome.storage.local.remove(key, resolve)
    );
  }
};

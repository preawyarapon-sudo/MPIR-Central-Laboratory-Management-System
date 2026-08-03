// Polyfill for window.storage (the Claude-artifact persistence API) so this
// component works as a normal deployed web app. Backed by Firebase Realtime
// Database so data is shared live across everyone using the app — same
// get/set/delete/list method signatures as the original API.
import { db } from "./firebase.js";
import { ref, get as dbGet, set as dbSet, remove as dbRemove } from "firebase/database";

const ROOT = "labtrack";

if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key /*, shared */) {
      const snap = await dbGet(ref(db, `${ROOT}/${key}`));
      if (!snap.exists()) {
        throw new Error(`Key not found: ${key}`);
      }
      // Firebase stores JS values directly; the rest of the app expects a
      // JSON string in `value` (it does JSON.parse on the result), so we
      // re-stringify whatever we stored.
      return { key, value: JSON.stringify(snap.val()), shared: true };
    },

    async set(key, value /*, shared */) {
      // `value` arrives as a JSON string (the app does JSON.stringify before
      // calling set) — parse it so Firebase stores real objects/arrays
      // instead of one giant string, which makes the DB browsable.
      const parsed = JSON.parse(value);
      await dbSet(ref(db, `${ROOT}/${key}`), parsed);
      return { key, value, shared: true };
    },

    async delete(key /*, shared */) {
      await dbRemove(ref(db, `${ROOT}/${key}`));
      return { key, deleted: true, shared: true };
    },

    async list(prefix = "" /*, shared */) {
      const snap = await dbGet(ref(db, ROOT));
      const all = snap.exists() ? Object.keys(snap.val()) : [];
      return { keys: all.filter((k) => k.startsWith(prefix)), prefix, shared: true };
    },
  };
}

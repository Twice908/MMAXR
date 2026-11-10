import { describe, expect, it } from "vitest";
import { SESSION_KEY, SESSION_TTL_MS, createSessionStore, type KeyValueStorage } from "./session.js";

function memoryStorage(): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

function setup(start = 1_000) {
  const storage = memoryStorage();
  let now = start;
  let counter = 0;
  const store = createSessionStore({
    storage,
    now: () => now,
    newId: () => `id${(counter += 1)}`,
  });
  return { storage, store, advance: (ms: number) => void (now += ms) };
}

describe("session store", () => {
  it("starts signed out", () => {
    expect(setup().store.get()).toBeNull();
  });

  it("signs in with an opaque studentRef and a 12 hour expiry", () => {
    const { store } = setup(1_000);
    const session = store.signIn("Asha");
    expect(session).toEqual({
      username: "Asha",
      studentRef: "stu_id1",
      signedInAt: 1_000,
      expiresAt: 1_000 + SESSION_TTL_MS,
    });
    expect(store.get()).toEqual(session);
  });

  it("keeps the name out of the studentRef", () => {
    const { store } = setup();
    expect(store.signIn("Asha Rao").studentRef).not.toContain("Asha");
  });

  it("expires and removes the stored session", () => {
    const { store, storage, advance } = setup();
    store.signIn("Asha");
    advance(SESSION_TTL_MS - 1);
    expect(store.get()).not.toBeNull();
    advance(1);
    expect(store.get()).toBeNull();
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });

  it("renames without extending the session", () => {
    const { store, advance } = setup();
    const original = store.signIn("Asha");
    advance(5_000);
    const renamed = store.rename("Asha R");
    expect(renamed).toEqual({ ...original, username: "Asha R" });
    expect(store.get()?.username).toBe("Asha R");
  });

  it("does not rename when signed out", () => {
    expect(setup().store.rename("Nobody")).toBeNull();
  });

  it("signs out", () => {
    const { store, storage } = setup();
    store.signIn("Asha");
    store.signOut();
    expect(store.get()).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("treats corrupt or wrongly shaped data as signed out and clears it", () => {
    const { store, storage } = setup();
    storage.data.set(SESSION_KEY, "{not json");
    expect(store.get()).toBeNull();
    expect(storage.data.has(SESSION_KEY)).toBe(false);

    storage.data.set(SESSION_KEY, JSON.stringify({ username: "", studentRef: "x", signedInAt: 1, expiresAt: 2 }));
    expect(store.get()).toBeNull();
    storage.data.set(SESSION_KEY, JSON.stringify({ username: "A", studentRef: "x", signedInAt: "1", expiresAt: 9e12 }));
    expect(store.get()).toBeNull();
  });

  it("keeps working for this page load when storage is blocked", () => {
    const blocked: KeyValueStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const store = createSessionStore({ storage: blocked, now: () => 0, newId: () => "x" });
    const session = store.signIn("Asha");
    expect(store.get()).toEqual(session);
    store.signOut();
    expect(store.get()).toBeNull();
  });
});

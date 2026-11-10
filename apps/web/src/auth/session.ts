/** A signed-in student on this device. Holds no real-world identifiers beyond the typed display name. */
export interface Session {
  /** Display name typed at login. Stays on this device and never goes into telemetry. */
  readonly username: string;
  /** Random opaque id for telemetry (CLAUDE.md section 5). Not derived from the name or the code. */
  readonly studentRef: string;
  /** Epoch ms when the student signed in. */
  readonly signedInAt: number;
  /** Epoch ms after which the session is no longer valid. */
  readonly expiresAt: number;
}

/** The storage methods the session store needs. `localStorage` fits. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Create, read, rename and clear the signed-in session. */
export interface SessionStore {
  /** The valid session, or null when signed out or expired (expired data is removed). */
  get(): Session | null;
  /** Start a new session for `username`. */
  signIn(username: string): Session;
  /** Change the display name of the current session. Returns null when signed out. */
  rename(username: string): Session | null;
  /** End the session. */
  signOut(): void;
}

/** Key under which the session is stored. */
export const SESSION_KEY = "mma.session.v1";
/** Default session length: 12 hours. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Options for {@link createSessionStore}. Time and ids are injected so tests are deterministic. */
export interface SessionStoreOptions {
  readonly storage: KeyValueStorage;
  readonly now: () => number;
  readonly newId: () => string;
  readonly ttlMs?: number;
}

/** Create a session store. Storage errors fall back to an in-memory session for this page load. */
export function createSessionStore(options: SessionStoreOptions): SessionStore {
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  let memory: Session | null = null;

  const save = (session: Session): void => {
    memory = session;
    try {
      options.storage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage is blocked (private mode, full): the in-memory copy still works until reload.
    }
  };
  const clear = (): void => {
    memory = null;
    try {
      options.storage.removeItem(SESSION_KEY);
    } catch {
      // Nothing to remove.
    }
  };
  const read = (): Session | null => {
    let raw: string | null;
    try {
      raw = options.storage.getItem(SESSION_KEY);
    } catch {
      return memory;
    }
    if (raw === null) return memory;
    try {
      const parsed = parseSession(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // Corrupt data is treated as signed out.
    }
    clear();
    return null;
  };

  const get = (): Session | null => {
    const session = read();
    if (!session) return null;
    if (session.expiresAt <= options.now()) {
      clear();
      return null;
    }
    return session;
  };

  return {
    get,
    signIn(username) {
      const now = options.now();
      const session: Session = {
        username,
        studentRef: `stu_${options.newId()}`,
        signedInAt: now,
        expiresAt: now + ttlMs,
      };
      save(session);
      return session;
    },
    rename(username) {
      const current = get();
      if (!current) return null;
      const renamed: Session = { ...current, username };
      save(renamed);
      return renamed;
    },
    signOut: clear,
  };
}

function parseSession(value: unknown): Session | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const { username, studentRef, signedInAt, expiresAt } = record;
  if (
    typeof username !== "string" || username.length === 0 ||
    typeof studentRef !== "string" || studentRef.length === 0 ||
    typeof signedInAt !== "number" || !Number.isFinite(signedInAt) ||
    typeof expiresAt !== "number" || !Number.isFinite(expiresAt)
  ) {
    return null;
  }
  return { username, studentRef, signedInAt, expiresAt };
}

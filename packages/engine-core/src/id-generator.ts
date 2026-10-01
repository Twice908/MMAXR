/** Crypto operations used by the injectable ID generator. */
export interface IdGeneratorCrypto {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
}

/** Dependencies for an ID generator; inject time and crypto for deterministic tests. */
export interface IdGeneratorOptions {
  readonly crypto?: IdGeneratorCrypto;
  readonly now?: () => number;
}

/** Create IDs using UUID APIs when available, then a deterministic UUID-shaped fallback. */
export function createIdGenerator(options: IdGeneratorOptions = {}): () => string {
  const cryptoSource = options.crypto;
  const now = options.now ?? (() => 0);
  let counter = 0;

  return () => {
    if (typeof cryptoSource?.randomUUID === "function") {
      return cryptoSource.randomUUID();
    }
    if (typeof cryptoSource?.getRandomValues === "function") {
      const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      return formatUuid(bytes);
    }

    counter += 1;
    const timestamp = Math.max(0, Math.floor(now()));
    const seed = `${timestamp.toString(16).padStart(16, "0")}${counter.toString(16).padStart(16, "0")}`;
    const bytes = Uint8Array.from(
      Array.from({ length: 16 }, (_, index) => Number.parseInt(seed.slice(index * 2, index * 2 + 2), 16)),
    );
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    return formatUuid(bytes);
  };
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
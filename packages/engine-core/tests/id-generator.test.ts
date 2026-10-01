import { describe, expect, it, vi } from "vitest";
import { createIdGenerator, type IdGeneratorCrypto } from "../src/id-generator.js";

describe("createIdGenerator", () => {
  it("prefers randomUUID when it is available", () => {
    const cryptoSource: IdGeneratorCrypto = {
      randomUUID: () => "00000000-0000-4000-8000-000000000001",
      getRandomValues: vi.fn((values) => values),
    };
    const generateId = createIdGenerator({ crypto: cryptoSource, now: () => 10 });

    expect(generateId()).toBe("00000000-0000-4000-8000-000000000001");
    expect(cryptoSource.getRandomValues).not.toHaveBeenCalled();
  });

  it("uses getRandomValues and formats a v4 UUID if randomUUID is missing", () => {
    const cryptoSource: IdGeneratorCrypto = {
      getRandomValues: (values) => {
        values.fill(0);
        return values;
      },
    };
    const generateId = createIdGenerator({ crypto: cryptoSource, now: () => 10 });
    const id = generateId();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("uses the deterministic timestamp/counter fallback without crypto", () => {
    const now = vi.fn(() => 1_700_000_000_000);
    const firstGenerator = createIdGenerator({ now });
    const secondGenerator = createIdGenerator({ now });
    const firstId = firstGenerator();

    expect(firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(firstGenerator()).not.toBe(firstId);
    expect(secondGenerator()).toBe(firstId);
  });
});
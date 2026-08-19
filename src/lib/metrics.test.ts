import { describe, expect, it } from "vitest";
import { safeEventProperties } from "./metrics";

describe("P1 metrics safety", () => {
  it("keeps only small primitive properties", () => {
    const input = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [
      `key-${index}`,
      index === 0 ? "x".repeat(400) : index,
    ]));
    const output = safeEventProperties(input);
    expect(Object.keys(output)).toHaveLength(20);
    expect(String(output["key-0"])).toHaveLength(240);
  });

  it("drops nested objects that could contain private payloads", () => {
    expect(safeEventProperties({ safe: true, nested: { token: "secret" } })).toEqual({
      safe: true,
      nested: undefined,
    });
  });
});


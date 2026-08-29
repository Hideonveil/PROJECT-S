import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/config", () => {
  it("returns the public game catalog alongside browser-safe runtime config", async () => {
    const response = GET();
    const payload = await response.json();

    expect(payload.games).toEqual([
      expect.objectContaining({
        id: "deadlock",
        displayName: "Deadlock",
        status: "available",
        modes: expect.objectContaining({
          ranked: expect.objectContaining({ enabled: true }),
          casual: expect.objectContaining({ enabled: true }),
        }),
      }),
    ]);
    expect(JSON.stringify(payload.games)).not.toContain("rules");
    expect(JSON.stringify(payload.games)).not.toContain("capacityScenarios");
  });
});

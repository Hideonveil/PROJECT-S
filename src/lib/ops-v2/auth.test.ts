import { afterEach, describe, expect, it } from "vitest";
import { requireOpsV2Authorization } from "./auth";

const originalKey = process.env.OPS_V2_API_KEY;

afterEach(() => {
  process.env.OPS_V2_API_KEY = originalKey;
});

describe("OPS V2 authorization", () => {
  it("rejects a request with no private server key", async () => {
    process.env.OPS_V2_API_KEY = "ops-v2-test-key";
    const request = new Request("https://internal.example/api/internal/ops-v2/live");
    await expect(requireOpsV2Authorization(request)).rejects.toMatchObject({ code: "OPS_UNAUTHORIZED", status: 401 });
  });

  it("accepts a matching private key and uses the bounded operator label", async () => {
    process.env.OPS_V2_API_KEY = "ops-v2-test-key";
    const request = new Request("https://internal.example/api/internal/ops-v2/live", {
      headers: { "x-jiyuan-ops-key": "ops-v2-test-key", "x-jiyuan-operator": "founder" },
    });
    await expect(requireOpsV2Authorization(request)).resolves.toEqual({ operator: "founder" });
  });
});

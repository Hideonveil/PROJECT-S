import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deprecated Matching endpoint observability", () => {
  it("warns and records use before any old endpoint is removed", () => {
    const helper = readFileSync("src/lib/deprecation.ts", "utf8");
    const confirm = readFileSync("src/app/api/matchmaking/confirm/route.ts", "utf8");
    const groupStart = readFileSync("src/app/api/matchmaking/group/start/route.ts", "utf8");
    expect(helper).toContain('response.headers.set("Deprecation", "true")');
    expect(helper).toContain('event: "deprecated_endpoint_called"');
    expect(confirm).toContain("markDeprecatedEndpoint");
    expect(groupStart).toContain("markDeprecatedEndpoint");
  });
});

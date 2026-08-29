import type { NextResponse } from "next/server";

type DeprecatedEndpoint = {
  route: string;
  replacement: string;
  requestId: string;
};

export function markDeprecatedEndpoint(response: NextResponse, fact: DeprecatedEndpoint) {
  response.headers.set("Deprecation", "true");
  response.headers.set("Warning", `299 Jiyuan \"Deprecated endpoint ${fact.route}; use ${fact.replacement}\"`);
  response.headers.set("Link", `<${fact.replacement}>; rel=\"successor-version\"`);
  console.warn(JSON.stringify({
    event: "deprecated_endpoint_called",
    route: fact.route,
    replacement: fact.replacement,
    requestId: fact.requestId,
    timestamp: new Date().toISOString(),
  }));
  return response;
}

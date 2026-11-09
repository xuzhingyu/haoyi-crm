import { describe, expect, it, vi } from "vitest";

import { ApiClient } from "./client";

describe("ApiClient", () => {
  it("uses the bearer token and idempotency key when claiming", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "claim-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new ApiClient({
      baseUrl: "/api/v1",
      getAccessToken: async () => "token-1",
      fetcher,
    });

    await client.claimLead("lead-1", "once-1");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/v1/leads/lead-1/claim",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          "Idempotency-Key": "once-1",
        }),
      }),
    );
  });

  it("turns a 409 claim response into a typed conflict", async () => {
    const client = new ApiClient({
      baseUrl: "/api/v1",
      getAccessToken: async () => "token-1",
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "lead is no longer available" }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    });

    await expect(client.claimLead("lead-1", "once-1")).rejects.toMatchObject({
      status: 409,
      message: "lead is no longer available",
    });
  });
});

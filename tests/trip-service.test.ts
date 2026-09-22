import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { TripService } from "../src/services/trip-service.js";

function fixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function fakeHttp(responses: Record<string, unknown>) {
  return {
    getJson: vi.fn(async (path: string) => {
      for (const [prefix, body] of Object.entries(responses)) {
        if (path.startsWith(prefix)) return body;
      }
      throw new Error(`unexpected path in test: ${path}`);
    }),
  } as any;
}

describe("TripService", () => {
  it("whoami returns a normalized profile", async () => {
    const http = fakeHttp({ "/api/v2/get/profile": fixture("profile.json") });
    const service = new TripService(http);
    const profile = await service.whoami();
    expect(profile.primaryEmail).toBe("jamie@example.com");
  });

  it("listTrips normalizes a Trip array and forwards options", async () => {
    const http = fakeHttp({
      "/api/v2/list/trip": { Trip: [fixture<{ Trip: unknown }>("trip-detail.json").Trip] },
    });
    const service = new TripService(http);
    const trips = await service.listTrips({ past: true, pageSize: 5 });
    expect(trips).toHaveLength(1);
    expect(trips[0].displayName).toBe("Barcelona, Spain, October 2026");
    const [path] = http.getJson.mock.calls[0];
    expect(path).toContain("past=true");
    expect(path).toContain("page_size=5");
  });

  it("getTrip assembles and sorts the full itinerary chronologically", async () => {
    // Feed AirObject in reverse chronological order (later flight first) so
    // this test actually proves getTrip sorts, rather than just passing
    // already-ordered fixture data through unchanged.
    const detailFixture = fixture<{ AirObject: unknown[] }>("trip-detail.json");
    const reversed = { ...detailFixture, AirObject: [...detailFixture.AirObject].reverse() };
    const http = fakeHttp({ "/api/v2/get/trip": reversed });
    const service = new TripService(http);
    const detail = await service.getTrip("aaaaaaaa-0000-9000-0001-000000000001");

    expect(detail.trip.displayName).toBe("Barcelona, Spain, October 2026");
    expect(detail.flights).toHaveLength(2);
    // Input was reversed (Oct 20 flight first); output must be re-sorted so
    // the earlier Oct 8 departure comes first.
    expect(detail.flights[0].segments[0].startAirportCode).toBe("SFO");
    expect(detail.flights[1].segments[0].startAirportCode).toBe("SCQ");
    expect(detail.lodgings).toHaveLength(1);
    expect(detail.cars).toHaveLength(1); // CarObject was a bare object, not an array
    expect(detail.activities).toHaveLength(1);
  });

  it("listAlerts normalizes a bare AccountPremiumAlert object into a 1-item array", async () => {
    const http = fakeHttp({ "/api/v2/listProAlerts": fixture("pro-alerts.json") });
    const service = new TripService(http);
    const alerts = await service.listAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].isNew).toBe(true);
  });

  it("propagates errors from the http client un-mangled (e.g. a 404 for an inaccessible trip)", async () => {
    const http = {
      getJson: vi.fn(async () => {
        throw new Error("GET /api/v2/get/trip/uuid/bad → HTTP 404");
      }),
    } as any;
    const service = new TripService(http);
    await expect(service.getTrip("bad")).rejects.toThrow(/HTTP 404/);
  });
});

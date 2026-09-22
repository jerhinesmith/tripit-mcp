import { describe, expect, it, vi } from "vitest";
import { getProfileRaw, getTripRaw, listProAlertsRaw, listTripsRaw } from "../src/tripit/endpoints.js";

function fakeHttp(response: unknown) {
  return { getJson: vi.fn(async () => response) } as any;
}

describe("endpoints", () => {
  it("getProfileRaw calls the profile endpoint and unwraps Profile", async () => {
    const http = fakeHttp({ Profile: { screen_name: "jdoe" } });
    const profile = await getProfileRaw(http);
    expect(http.getJson).toHaveBeenCalledWith("/api/v2/get/profile");
    expect(profile).toEqual({ screen_name: "jdoe" });
  });

  it("listTripsRaw builds the query string with defaults", async () => {
    const http = fakeHttp({ Trip: [] });
    await listTripsRaw(http);
    const [path] = http.getJson.mock.calls[0];
    expect(path).toBe(
      "/api/v2/list/trip?exclude_types=weather&page_size=10&past=false&should_sort_trips_by_date=true&traveler=true&trip_permission_filter=all&page_num=1&isPast=false",
    );
  });

  it("listTripsRaw honors past/pageSize/pageNum overrides", async () => {
    const http = fakeHttp({ Trip: [] });
    await listTripsRaw(http, { past: true, pageSize: 25, pageNum: 2 });
    const [path] = http.getJson.mock.calls[0];
    expect(path).toContain("page_size=25");
    expect(path).toContain("past=true");
    expect(path).toContain("page_num=2");
    expect(path).toContain("isPast=true");
  });

  it("getTripRaw builds the include_objects URL for the given uuid", async () => {
    const http = fakeHttp({ Trip: { id: "1", uuid: "u1" } });
    await getTripRaw(http, "u1");
    const [path] = http.getJson.mock.calls[0];
    expect(path).toBe(
      "/api/v2/get/trip/uuid/u1/include_objects/true?exclude_types=weather&should_get_new_seat_tracker_subscriptions=true",
    );
  });

  it("listProAlertsRaw calls the alerts endpoint", async () => {
    const http = fakeHttp({ AccountPremiumAlert: undefined });
    await listProAlertsRaw(http);
    expect(http.getJson).toHaveBeenCalledWith("/api/v2/listProAlerts");
  });
});

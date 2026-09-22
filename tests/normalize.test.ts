import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  asArray,
  combineDateTime,
  normalizeActivity,
  normalizeAddress,
  normalizeCar,
  normalizeFlight,
  normalizeLodging,
  normalizeProAlert,
  normalizeProfile,
  normalizeTripSummary,
  parseCost,
  toBool,
} from "../src/tripit/normalize.js";
import type { RawProAlertsResponse, RawProfile, RawTripDetail } from "../src/tripit/raw-types.js";

function fixture<T>(name: string): T {
  const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("primitive helpers", () => {
  it("toBool", () => {
    expect(toBool("true")).toBe(true);
    expect(toBool("false")).toBe(false);
    expect(toBool(undefined)).toBe(false);
  });

  it("asArray normalizes bare object / array / undefined uniformly", () => {
    expect(asArray(undefined)).toEqual([]);
    expect(asArray({ a: 1 })).toEqual([{ a: 1 }]);
    expect(asArray([{ a: 1 }, { a: 2 }])).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("combineDateTime joins date/time/offset into ISO 8601, defaulting missing time", () => {
    expect(combineDateTime({ date: "2026-10-08", time: "17:30:00", utc_offset: "-07:00" })).toBe(
      "2026-10-08T17:30:00-07:00",
    );
    expect(combineDateTime({ date: "2026-10-08" })).toBe("2026-10-08T00:00:00");
    expect(combineDateTime(undefined)).toBeUndefined();
  });

  it("parseCost handles both observed formats and falls back to the raw string otherwise", () => {
    expect(parseCost("3099.86 USD")).toEqual({ amount: 3099.86, currency: "USD" });
    expect(parseCost("$428.35 USD")).toEqual({ amount: 428.35, currency: "USD" });
    expect(parseCost("827.20 EUR")).toEqual({ amount: 827.2, currency: "EUR" });
    expect(parseCost("Free")).toBe("Free");
    expect(parseCost(undefined)).toBeUndefined();
  });

  it("normalizeAddress converts lat/long strings to numbers", () => {
    expect(normalizeAddress({ city: "Barcelona", latitude: "41.38879", longitude: "2.15899" })).toEqual({
      address: undefined,
      city: "Barcelona",
      state: undefined,
      zip: undefined,
      country: undefined,
      latitude: 41.38879,
      longitude: 2.15899,
    });
    expect(normalizeAddress(undefined)).toBeUndefined();
  });
});

describe("normalizeProfile", () => {
  it("picks the primary email, keeps the rest of the fields, coerces isPro", () => {
    const raw = fixture<{ Profile: RawProfile }>("profile.json").Profile;
    expect(normalizeProfile(raw)).toEqual({
      screenName: "sample_user",
      displayName: "Jamie Q. Traveler",
      primaryEmail: "jamie@example.com",
      homeCity: "Walnut Creek, CA",
      homeAirport: "San Francisco International Airport (SFO)",
      isPro: true,
      icalUrl: "https://www.tripit.com/feed/ical/private/FAKE0000FAKE0000FAKE0000FAKE00/tripit.ics",
    });
  });
});

describe("domain normalizers against the sanitized trip-detail fixture", () => {
  const detail = fixture<RawTripDetail>("trip-detail.json");

  it("normalizeTripSummary maps the trip fields", () => {
    const trip = normalizeTripSummary(detail.Trip);
    expect(trip.displayName).toBe("Barcelona, Spain, October 2026");
    expect(trip.status).toBe("all_clear");
    expect(trip.isPrivate).toBe(false);
    expect(trip.address?.latitude).toBeCloseTo(41.38879);
  });

  it("normalizeFlight keeps a multi-segment array as-is and wraps a bare Segment object into a 1-item array", () => {
    const [multi, single] = asArray(detail.AirObject).map(normalizeFlight);
    expect(multi.segments).toHaveLength(1);
    expect(multi.segments[0].startAirportCode).toBe("SFO");
    expect(multi.cost).toEqual({ amount: 3099.86, currency: "USD" });

    expect(single.segments).toHaveLength(1);
    expect(single.segments[0].startAirportCode).toBe("SCQ");
    expect(single.cost).toEqual({ amount: 428.35, currency: "USD" });
  });

  it("normalizeLodging maps supplier/cost/address", () => {
    const [lodging] = asArray(detail.LodgingObject).map(normalizeLodging);
    expect(lodging.supplier).toBe("Sample Hotel Barcelona");
    expect(lodging.cost).toEqual({ amount: 827.2, currency: "EUR" });
    expect(lodging.address?.city).toBe("Barcelona");
  });

  it("normalizeCar handles CarObject being a bare object rather than an array", () => {
    const [car] = asArray(detail.CarObject).map(normalizeCar);
    expect(car.supplier).toBe("Sample Rentals");
    expect(car.pickupAddress?.city).toBe("Bilbao");
    expect(car.dropoffAddress?.city).toBe("Santiago de Compostela");
  });

  it("normalizeActivity maps supplier/address/confirmation", () => {
    const [activity] = asArray(detail.ActivityObject).map(normalizeActivity);
    expect(activity.supplier).toBe("Sample Landmark");
    expect(activity.confirmationNumber).toBe("FAKE05");
  });
});

describe("normalizeProAlert", () => {
  it("maps fields and coerces isNew", () => {
    const raw = fixture<RawProAlertsResponse>("pro-alerts.json").AccountPremiumAlert;
    const alert = normalizeProAlert(Array.isArray(raw) ? raw[0] : raw!);
    expect(alert.title).toBe("Barcelona, Spain, October 2026");
    expect(alert.isNew).toBe(true);
  });
});

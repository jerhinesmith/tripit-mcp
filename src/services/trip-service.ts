import type { TripitHttpClient } from "../http/client.js";
import {
  getProfileRaw,
  getTripRaw,
  type ListTripsOptions,
  listProAlertsRaw,
  listTripsRaw,
} from "../tripit/endpoints.js";
import {
  asArray,
  normalizeActivity,
  normalizeCar,
  normalizeFlight,
  normalizeLodging,
  normalizeProAlert,
  normalizeProfile,
  normalizeTripSummary,
} from "../tripit/normalize.js";
import type { ProAlert, Profile, TripDetail, TripSummary } from "../tripit/types.js";

function byStart(a?: string, b?: string): number {
  const ta = a ? Date.parse(a) : Number.POSITIVE_INFINITY;
  const tb = b ? Date.parse(b) : Number.POSITIVE_INFINITY;
  return ta - tb;
}

export class TripService {
  constructor(private readonly http: TripitHttpClient) {}

  async whoami(): Promise<Profile> {
    return normalizeProfile(await getProfileRaw(this.http));
  }

  async listTrips(opts: ListTripsOptions = {}): Promise<TripSummary[]> {
    const raw = await listTripsRaw(this.http, opts);
    return asArray(raw.Trip).map(normalizeTripSummary);
  }

  async getTrip(uuid: string): Promise<TripDetail> {
    const raw = await getTripRaw(this.http, uuid);
    const flights = asArray(raw.AirObject)
      .map(normalizeFlight)
      .sort((a, b) => byStart(a.segments[0]?.startDateTime, b.segments[0]?.startDateTime));
    const lodgings = asArray(raw.LodgingObject)
      .map(normalizeLodging)
      .sort((a, b) => byStart(a.startDateTime, b.startDateTime));
    const cars = asArray(raw.CarObject)
      .map(normalizeCar)
      .sort((a, b) => byStart(a.startDateTime, b.startDateTime));
    const activities = asArray(raw.ActivityObject)
      .map(normalizeActivity)
      .sort((a, b) => byStart(a.startDateTime, b.startDateTime));
    return { trip: normalizeTripSummary(raw.Trip), flights, lodgings, cars, activities };
  }

  async listAlerts(): Promise<ProAlert[]> {
    const raw = await listProAlertsRaw(this.http);
    return asArray(raw.AccountPremiumAlert).map(normalizeProAlert);
  }
}

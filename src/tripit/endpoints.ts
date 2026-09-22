import type { TripitHttpClient } from "../http/client.js";
import type {
  RawProAlertsResponse,
  RawProfile,
  RawTripDetail,
  RawTripListResponse,
} from "./raw-types.js";

export interface ListTripsOptions {
  past?: boolean;
  pageSize?: number;
  pageNum?: number;
}

export async function getProfileRaw(http: TripitHttpClient): Promise<RawProfile> {
  const data = await http.getJson<{ Profile: RawProfile }>("/api/v2/get/profile");
  if (!data.Profile) {
    throw new Error(
      "TripIt's profile response is missing the Profile field — the private API may have changed.",
    );
  }
  return data.Profile;
}

// Deliberately no guard on the `Trip` field here: an account with zero
// upcoming/past trips almost certainly omits the key entirely (this JSON is
// derived from XML, which typically drops empty collections), so a missing
// `Trip` key is the normal "you have no trips" case, not a broken response.
export async function listTripsRaw(
  http: TripitHttpClient,
  opts: ListTripsOptions = {},
): Promise<RawTripListResponse> {
  const pageSize = opts.pageSize ?? 10;
  const pageNum = opts.pageNum ?? 1;
  const past = opts.past ?? false;
  const qs = new URLSearchParams({
    exclude_types: "weather",
    page_size: String(pageSize),
    past: String(past),
    should_sort_trips_by_date: "true",
    traveler: "true",
    trip_permission_filter: "all",
    page_num: String(pageNum),
    isPast: String(past),
  });
  return http.getJson<RawTripListResponse>(`/api/v2/list/trip?${qs.toString()}`);
}

export async function getTripRaw(http: TripitHttpClient, uuid: string): Promise<RawTripDetail> {
  const qs = new URLSearchParams({
    exclude_types: "weather",
    should_get_new_seat_tracker_subscriptions: "true",
  });
  const data = await http.getJson<RawTripDetail>(
    `/api/v2/get/trip/uuid/${encodeURIComponent(uuid)}/include_objects/true?${qs.toString()}`,
  );
  if (!data.Trip) {
    throw new Error(
      "TripIt's trip response is missing the Trip field — the private API may have changed.",
    );
  }
  return data;
}

// Deliberately no guard on the `AccountPremiumAlert` field here: an account
// with zero open pro alerts almost certainly omits the key entirely (this
// JSON is derived from XML, which typically drops empty collections), so a
// missing key is the normal "you have no alerts" case, not a broken response.
export async function listProAlertsRaw(http: TripitHttpClient): Promise<RawProAlertsResponse> {
  return http.getJson<RawProAlertsResponse>("/api/v2/listProAlerts");
}

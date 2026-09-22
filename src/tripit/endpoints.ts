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
  return data.Profile;
}

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
  return http.getJson<RawTripDetail>(
    `/api/v2/get/trip/uuid/${encodeURIComponent(uuid)}/include_objects/true?${qs.toString()}`,
  );
}

export async function listProAlertsRaw(http: TripitHttpClient): Promise<RawProAlertsResponse> {
  return http.getJson<RawProAlertsResponse>("/api/v2/listProAlerts");
}

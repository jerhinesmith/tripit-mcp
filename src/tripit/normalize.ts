import type {
  RawActivityObject,
  RawAddress,
  RawAirObject,
  RawCarObject,
  RawDateTime,
  RawLodgingObject,
  RawProAlert,
  RawProfile,
  RawSegment,
  RawTrip,
} from "./raw-types.js";
import type {
  Activity,
  Address,
  CarRental,
  Cost,
  Flight,
  FlightSegment,
  Lodging,
  ProAlert,
  Profile,
  TripSummary,
} from "./types.js";

export function toBool(v: unknown): boolean {
  return v === "true" || v === true;
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function combineDateTime(dt?: RawDateTime): string | undefined {
  if (!dt?.date) return undefined;
  const time = dt.time ?? "00:00:00";
  const offset = dt.utc_offset ?? "";
  return `${dt.date}T${time}${offset}`;
}

const COST_PATTERN = /^\$?([\d,]+\.\d{2})\s+([A-Z]{3})$/;

export function parseCost(raw?: string): Cost | string | undefined {
  if (!raw) return undefined;
  const m = raw.match(COST_PATTERN);
  if (!m) return raw; // leave unparsed rather than guess at an unfamiliar format
  const amount = Number(m[1].replace(/,/g, ""));
  if (Number.isNaN(amount)) return raw;
  return { amount, currency: m[2] };
}

export function normalizeAddress(raw?: RawAddress): Address | undefined {
  if (!raw) return undefined;
  return {
    address: raw.address,
    city: raw.city,
    state: raw.state,
    zip: raw.zip,
    country: raw.country,
    latitude: raw.latitude !== undefined ? Number(raw.latitude) : undefined,
    longitude: raw.longitude !== undefined ? Number(raw.longitude) : undefined,
  };
}

export function normalizeProfile(raw: RawProfile): Profile {
  const emails = asArray(raw.ProfileEmailAddresses?.ProfileEmailAddress);
  const primary = emails.find((e) => toBool(e.is_primary)) ?? emails[0];
  return {
    screenName: raw.screen_name,
    displayName: raw.public_display_name,
    primaryEmail: primary?.address,
    homeCity: raw.home_city,
    homeAirport: raw.home_airport,
    isPro: toBool(raw.is_pro),
    icalUrl: raw.ical_url,
  };
}

export function normalizeTripSummary(raw: RawTrip): TripSummary {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name ?? "",
    startDate: raw.start_date,
    endDate: raw.end_date,
    primaryLocation: raw.primary_location,
    address: normalizeAddress(raw.PrimaryLocationAddress),
    status: raw.TripStatuses?.TripStatus?.status,
    isPrivate: toBool(raw.is_private),
  };
}

function normalizeSegment(raw: RawSegment): FlightSegment {
  return {
    startDateTime: combineDateTime(raw.StartDateTime),
    endDateTime: combineDateTime(raw.EndDateTime),
    startTimezone: raw.StartDateTime?.timezone,
    endTimezone: raw.EndDateTime?.timezone,
    startAirportCode: raw.start_airport_code,
    startAirportName: raw.start_airport_name,
    startCityName: raw.start_city_name,
    endAirportCode: raw.end_airport_code,
    endAirportName: raw.end_airport_name,
    endCityName: raw.end_city_name,
    airline: raw.marketing_airline,
    airlineCode: raw.marketing_airline_code,
    flightNumber: raw.marketing_flight_number,
    status: raw.Status?.flight_status,
  };
}

export function normalizeFlight(raw: RawAirObject): Flight {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name,
    bookingSite: raw.booking_site_name,
    confirmationNumber: raw.supplier_conf_num,
    cost: parseCost(raw.total_cost),
    segments: asArray(raw.Segment).map(normalizeSegment),
  };
}

export function normalizeLodging(raw: RawLodgingObject): Lodging {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name,
    supplier: raw.supplier_name,
    confirmationNumber: raw.supplier_conf_num,
    cost: parseCost(raw.total_cost),
    startDateTime: combineDateTime(raw.StartDateTime),
    endDateTime: combineDateTime(raw.EndDateTime),
    address: normalizeAddress(raw.Address),
  };
}

export function normalizeCar(raw: RawCarObject): CarRental {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name,
    supplier: raw.supplier_name,
    confirmationNumber: raw.supplier_conf_num,
    cost: parseCost(raw.total_cost),
    startDateTime: combineDateTime(raw.StartDateTime),
    endDateTime: combineDateTime(raw.EndDateTime),
    pickupAddress: normalizeAddress(raw.StartLocationAddress),
    dropoffAddress: normalizeAddress(raw.EndLocationAddress),
  };
}

export function normalizeActivity(raw: RawActivityObject): Activity {
  return {
    id: raw.id,
    uuid: raw.uuid,
    displayName: raw.display_name,
    supplier: raw.supplier_name,
    confirmationNumber: raw.booking_site_conf_num,
    startDateTime: combineDateTime(raw.StartDateTime),
    endDateTime: combineDateTime(raw.EndDateTime),
    address: normalizeAddress(raw.Address),
  };
}

export function normalizeProAlert(raw: RawProAlert): ProAlert {
  return {
    id: raw.id,
    tripUuid: raw.trip_uuid,
    title: raw.title,
    message: raw.message,
    createdAt: raw.created_at,
    isNew: toBool(raw.is_new),
  };
}

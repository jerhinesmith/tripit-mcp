export interface RawAddress {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: string;
  longitude?: string;
}

export interface RawDateTime {
  date?: string;
  time?: string;
  timezone?: string;
  utc_offset?: string;
}

export interface RawProfileEmail {
  address?: string;
  is_primary?: string;
}

export interface RawProfile {
  screen_name?: string;
  public_display_name?: string;
  home_city?: string;
  home_airport?: string;
  is_pro?: string;
  ical_url?: string;
  ProfileEmailAddresses?: { ProfileEmailAddress?: RawProfileEmail | RawProfileEmail[] };
}

export interface RawTrip {
  id: string;
  uuid: string;
  display_name?: string;
  start_date?: string;
  end_date?: string;
  primary_location?: string;
  PrimaryLocationAddress?: RawAddress;
  TripStatuses?: { TripStatus?: { status?: string } };
  is_private?: string;
}

export interface RawSegment {
  StartDateTime?: RawDateTime;
  EndDateTime?: RawDateTime;
  start_airport_code?: string;
  start_airport_name?: string;
  start_city_name?: string;
  end_airport_code?: string;
  end_airport_name?: string;
  end_city_name?: string;
  marketing_airline?: string;
  marketing_airline_code?: string;
  marketing_flight_number?: string;
  Status?: { flight_status?: string };
}

export interface RawAirObject {
  id: string;
  uuid: string;
  display_name?: string;
  booking_site_name?: string;
  supplier_conf_num?: string;
  total_cost?: string;
  Segment?: RawSegment | RawSegment[];
}

export interface RawLodgingObject {
  id: string;
  uuid: string;
  display_name?: string;
  supplier_name?: string;
  supplier_conf_num?: string;
  total_cost?: string;
  StartDateTime?: RawDateTime;
  EndDateTime?: RawDateTime;
  Address?: RawAddress;
}

export interface RawCarObject {
  id: string;
  uuid: string;
  display_name?: string;
  supplier_name?: string;
  supplier_conf_num?: string;
  total_cost?: string;
  StartDateTime?: RawDateTime;
  EndDateTime?: RawDateTime;
  StartLocationAddress?: RawAddress;
  EndLocationAddress?: RawAddress;
}

export interface RawActivityObject {
  id: string;
  uuid: string;
  display_name?: string;
  supplier_name?: string;
  booking_site_conf_num?: string;
  StartDateTime?: RawDateTime;
  EndDateTime?: RawDateTime;
  Address?: RawAddress;
}

export interface RawTripDetail {
  Trip: RawTrip;
  AirObject?: RawAirObject | RawAirObject[];
  LodgingObject?: RawLodgingObject | RawLodgingObject[];
  CarObject?: RawCarObject | RawCarObject[];
  ActivityObject?: RawActivityObject | RawActivityObject[];
}

export interface RawTripListResponse {
  Trip?: RawTrip | RawTrip[];
}

export interface RawProAlert {
  id?: string;
  trip_uuid?: string;
  title?: string;
  message?: string;
  created_at?: string;
  is_new?: string;
}

export interface RawProAlertsResponse {
  AccountPremiumAlert?: RawProAlert | RawProAlert[];
}

export interface Profile {
  screenName?: string;
  displayName?: string;
  primaryEmail?: string;
  homeCity?: string;
  homeAirport?: string;
  isPro: boolean;
  icalUrl?: string;
}

export interface Address {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface Cost {
  amount: number;
  currency: string;
}

export interface TripSummary {
  id: string;
  uuid: string;
  displayName: string;
  startDate?: string;
  endDate?: string;
  primaryLocation?: string;
  address?: Address;
  status?: string;
  isPrivate: boolean;
}

export interface FlightSegment {
  startDateTime?: string;
  endDateTime?: string;
  startTimezone?: string;
  endTimezone?: string;
  startAirportCode?: string;
  startAirportName?: string;
  startCityName?: string;
  endAirportCode?: string;
  endAirportName?: string;
  endCityName?: string;
  airline?: string;
  airlineCode?: string;
  flightNumber?: string;
  status?: string;
}

export interface Flight {
  id: string;
  uuid: string;
  displayName?: string;
  bookingSite?: string;
  confirmationNumber?: string;
  cost?: Cost | string;
  segments: FlightSegment[];
}

export interface Lodging {
  id: string;
  uuid: string;
  displayName?: string;
  supplier?: string;
  confirmationNumber?: string;
  cost?: Cost | string;
  startDateTime?: string;
  endDateTime?: string;
  address?: Address;
}

export interface CarRental {
  id: string;
  uuid: string;
  displayName?: string;
  supplier?: string;
  confirmationNumber?: string;
  cost?: Cost | string;
  startDateTime?: string;
  endDateTime?: string;
  pickupAddress?: Address;
  dropoffAddress?: Address;
}

export interface Activity {
  id: string;
  uuid: string;
  displayName?: string;
  supplier?: string;
  confirmationNumber?: string;
  startDateTime?: string;
  endDateTime?: string;
  address?: Address;
}

export interface TripDetail {
  trip: TripSummary;
  flights: Flight[];
  lodgings: Lodging[];
  cars: CarRental[];
  activities: Activity[];
}

export interface ProAlert {
  id?: string;
  tripUuid?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  isNew: boolean;
}

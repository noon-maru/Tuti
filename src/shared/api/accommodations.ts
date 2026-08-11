export type NearbyAccommodation = {
  id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  image: string | null;
  distanceMeters: number;
  checkInTime: string | null;
  checkOutTime: string | null;
  reservation: string | null;
  bookingUrl: string | null;
  parking: string | null;
  overview: string | null;
};

export type NearbyAccommodationsResponse = {
  place: { id: string; name: string };
  accommodations: NearbyAccommodation[];
};

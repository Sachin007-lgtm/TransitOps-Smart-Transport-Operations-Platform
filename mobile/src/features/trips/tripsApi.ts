import { authenticatedRequest } from '@/utils/api';

export type TripStatus =
  | 'Draft'
  | 'Planned'
  | 'Assigned'
  | 'Dispatched'
  | 'Completed'
  | 'Cancelled';

export type Trip = {
  id: string | number;
  origin: string;
  source?: string;
  destination: string;
  planned_route?: string | null;
  start_time?: string | null;
  expected_arrival?: string | null;
  actual_arrival?: string | null;
  status: TripStatus;
  vehicle_name?: string | null;
  vehicle_registration?: string | null;
  vehicle_type?: string | null;
  driver_name?: string | null;
  driver_status?: string | null;
  cargo_weight?: number | string | null;
  planned_distance?: number | string | null;
  actual_distance?: number | string | null;
};

type TripsResponse = {
  success: boolean;
  message: string;
  data: Trip[];
};

type SingleTripResponse = {
  success: boolean;
  message: string;
  data: Trip;
};

export async function getTrips(token: string): Promise<Trip[]> {
  const response = await authenticatedRequest<TripsResponse>('/trips', token);
  return response.data;
}

export async function getTripById(id: string | number, token: string): Promise<Trip> {
  const response = await authenticatedRequest<SingleTripResponse>(`/trips/${id}`, token);
  return response.data;
}

export async function updateTripStatus(
  id: string | number,
  status: TripStatus,
  token: string,
  extra: { actual_distance?: number; actual_arrival?: string } = {}
): Promise<Trip> {
  const response = await authenticatedRequest<SingleTripResponse>(`/trips/${id}/status`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...extra }),
  });
  return response.data;
}
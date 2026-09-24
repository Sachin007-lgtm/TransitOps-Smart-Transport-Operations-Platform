import { authenticatedRequest } from '@/utils/api';

export type LocationPayload = {
  trip_id: number | string;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  accuracy?: number | null;
  altitude?: number | null;
  captured_at?: string;
};

export type LocationRecord = LocationPayload & {
  id: number;
  vehicle_id?: number | null;
  driver_id?: number | null;
  created_at: string;
};

type LocationApiResponse = {
  success: boolean;
  message: string;
  data: LocationRecord;
};

export async function sendLocationUpdate(
  payload: LocationPayload,
  token: string
): Promise<LocationRecord> {
  const response = await authenticatedRequest<LocationApiResponse>('/locations', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

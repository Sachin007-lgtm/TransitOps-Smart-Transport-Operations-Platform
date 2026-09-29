import { File, UploadType } from 'expo-file-system';
import { getApiUrl } from '@/config/env';
import { ApiError, authenticatedRequest } from '@/utils/api';

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
  vehicle?: {
    id: string;
    name?: string | null;
    registration_number?: string | null;
    type?: string | null;
    status?: string | null;
  } | null;
  loaded_at?: string | null;
  unloaded_at?: string | null;
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

export async function updateTripLoadingMilestone(
  id: string | number,
  action: 'loaded' | 'unloaded',
  token: string,
): Promise<Trip> {
  const response = await authenticatedRequest<SingleTripResponse>(`/trips/${id}/loading`, token, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
  });
  return response.data;
}

export type MaintenancePriority = 'Routine' | 'Urgent' | 'Critical';
export type MaintenanceReportStatus = 'Open' | 'Acknowledged' | 'Resolved';

export type MaintenanceReport = {
  id: string;
  trip_id: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceReportStatus;
  repair_cost?: number | string | null;
  receipt_pending?: boolean;
  receipt_file_name?: string | null;
  has_receipt?: boolean;
};

export type RepairReceiptFile = {
  uri: string;
  name: string;
  mimeType: string;
};

type MaintenanceReportResponse = {
  success: boolean;
  message: string;
  data: MaintenanceReport | null;
};

export async function getTripMaintenanceReport(
  tripId: string | number,
  token: string,
): Promise<MaintenanceReport | null> {
  const response = await authenticatedRequest<MaintenanceReportResponse>(
    `/maintenance/driver-reports/trip/${tripId}`,
    token,
  );
  return response.data;
}

export async function createMaintenanceReport(
  tripId: string | number,
  description: string,
  priority: MaintenancePriority,
  token: string,
): Promise<MaintenanceReport> {
  const response = await authenticatedRequest<{ data: MaintenanceReport }>('/maintenance/driver-reports', token, {
    method: 'POST',
    body: JSON.stringify({ trip_id: tripId, description, priority }),
  });
  return response.data;
}

export async function updateMaintenanceReportStatus(
  reportId: string,
  status: Exclude<MaintenanceReportStatus, 'Resolved'>,
  token: string,
): Promise<MaintenanceReport> {
  const response = await authenticatedRequest<{ data: MaintenanceReport }>(`/maintenance/driver-reports/${reportId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  return response.data;
}

export async function resolveMaintenanceReport(
  reportId: string,
  repairCost: number,
  receiptPending: boolean,
  receipt: RepairReceiptFile | null,
  token: string,
): Promise<MaintenanceReport> {
  if (!receipt) {
    const response = await authenticatedRequest<{ data: MaintenanceReport }>(`/maintenance/driver-reports/${reportId}/fix`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repair_cost: repairCost, receipt_pending: receiptPending }),
    });
    return response.data;
  }
  return uploadRepairFile(
    `/maintenance/driver-reports/${reportId}/fix`,
    receipt,
    token,
    { repair_cost: String(repairCost), receipt_pending: String(receiptPending), receipt_original_name: receipt.name },
  );
}

export async function uploadPendingMaintenanceReceipt(
  reportId: string,
  receipt: RepairReceiptFile,
  token: string,
): Promise<MaintenanceReport> {
  return uploadRepairFile(
    `/maintenance/driver-reports/${reportId}/receipt`,
    receipt,
    token,
    { receipt_original_name: receipt.name },
  );
}

async function uploadRepairFile(
  path: string,
  receipt: RepairReceiptFile,
  token: string,
  parameters: Record<string, string>,
): Promise<MaintenanceReport> {
  const file = new File(receipt.uri);
  const result = await file.upload(`${getApiUrl()}${path}`, {
    uploadType: UploadType.MULTIPART,
    fieldName: 'receipt',
    mimeType: receipt.mimeType,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    parameters,
  });
  let payload: { data?: MaintenanceReport; message?: string; error?: string };
  try {
    payload = JSON.parse(result.body);
  } catch {
    throw new ApiError('The server returned an unreadable receipt upload response.', result.status);
  }
  if (result.status < 200 || result.status >= 300 || !payload.data) {
    throw new ApiError(payload.message || payload.error || 'Receipt upload failed.', result.status);
  }
  return payload.data;
}

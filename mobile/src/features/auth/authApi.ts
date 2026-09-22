import { apiRequest, authenticatedRequest } from '@/utils/api';

export type AuthUser = {
  id: string | number;
  name: string;
  email: string;
  role: string;
  role_id: string | number;
  driver_id?: number | null;
  organization_id?: string | null;
  must_change_password?: boolean;
};

export type LoginData = {
  token: string;
  user: AuthUser;
};

export type ChangePasswordData = {
  current_password: string;
  new_password: string;
};

type LoginResponse = {
  success: boolean;
  message: string;
  data: LoginData;
};

type CurrentUserResponse = {
  success: boolean;
  message: string;
  data: AuthUser;
};

export function login(phoneNumber: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone_number: phoneNumber, password }),
  });
}

export async function getCurrentUser(token: string): Promise<AuthUser> {
  const response = await authenticatedRequest<CurrentUserResponse>('/auth/me', token);
  return response.data;
}

export function changePassword(token: string, data: ChangePasswordData) {
  return authenticatedRequest<{ success: boolean; message: string; data: null }>('/auth/password', token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

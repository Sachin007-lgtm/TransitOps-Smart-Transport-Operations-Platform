import { apiRequest, authenticatedRequest } from '@/utils/api';

export type AuthUser = {
  id: string | number;
  name: string;
  email: string;
  role: string;
  role_id: string | number;
};

export type LoginData = {
  token: string;
  user: AuthUser;
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

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser(token: string): Promise<AuthUser> {
  const response = await authenticatedRequest<CurrentUserResponse>('/auth/me', token);
  return response.data;
}

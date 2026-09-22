const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = configuredApiUrl ? configuredApiUrl.replace(/\/$/, '') : null;

export function getApiUrl(): string {
  if (!API_URL) {
    throw new Error('EXPO_PUBLIC_API_URL is not configured for this build.');
  }

  return API_URL;
}

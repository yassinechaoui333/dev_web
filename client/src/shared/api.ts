export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch('/api' + path, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SalesPlatform', ...options.headers } }); }
  catch { throw new Error('Unable to reach the server. Please try again.'); }
  if (response.status === 204) return undefined as T;
  if (!response.headers.get('content-type')?.includes('application/json')) throw new ApiError(503, 'The server is unavailable. Please try again.');
  const body = await response.json().catch(() => { throw new ApiError(503, 'The server returned an unreadable response. Please try again.'); });
  if (!response.ok) {
    if (response.status === 401 && body.error?.code === 'UNAUTHENTICATED') window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(response.status, body.error?.message ?? 'Request failed');
  }
  return body;
}
export type User = { id: string; name: string; email: string; role: 'USER' | 'ADMIN'; active: boolean; createdAt: string; updatedAt: string };

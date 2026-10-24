export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch('/api' + path, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'SalesPlatform', ...options.headers } }); }
  catch { throw new Error('Unable to reach the server. Please try again.'); }
  if (response.status === 204) return undefined as T;
  const body = await response.json();
  if (!response.ok) throw new ApiError(response.status, body.error?.message ?? 'Request failed');
  return body;
}
export type User = { id: string; name: string; email: string; role: 'USER' | 'ADMIN'; active: boolean; createdAt: string; updatedAt: string };

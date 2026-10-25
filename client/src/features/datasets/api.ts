import { api, ApiError } from '../../shared/api';
// Typed client for the dataset/import endpoints in docs/api-contract.yaml.
export const CURRENCIES = ['GBP', 'EUR', 'USD', 'MAD'] as const;
export const REQUIRED_COLUMNS = ['InvoiceNo', 'StockCode', 'Description', 'Quantity', 'InvoiceDate', 'UnitPrice', 'CustomerID', 'Country'] as const;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export type Currency = typeof CURRENCIES[number];
export type DateFormat = 'ISO8601' | 'DMY_HM';
export type Dataset = { id: string; ownerId: string; title: string; description: string; category: string; source: string; currency: Currency; dateFormat: DateFormat; timezone: string; createdAt: string };
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type ImportJob = {
  id: string; datasetId: string; filename: string; contentHash: string; retryCount: number; status: ImportStatus;
  totalRows: number; processedRows: number; acceptedRows: number; rejectedRows: number; error: string | null; createdAt: string; completedAt: string | null;
};
export type ValidationError = { field: string; code: string; message: string };
export type RawRecord = { id: string; datasetId: string; importJobId: string; sourceRow: number; values: Record<string, string>; validationErrors: ValidationError[] | null };
export type Page<T> = { data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } };
export type DatasetInput = Pick<Dataset, 'title' | 'description' | 'category' | 'source'> & Partial<Pick<Dataset, 'currency' | 'dateFormat' | 'timezone'>>;

const base = (datasetId: string) => '/datasets/' + encodeURIComponent(datasetId);
export const listDatasets = (page: number) => api<Page<Dataset>>(`/datasets?page=${page}&pageSize=20`);
export const getDataset = async (datasetId: string) => (await api<{ data: Dataset }>(base(datasetId))).data;
export const createDataset = async (input: DatasetInput) => (await api<{ data: Dataset }>('/datasets', { method: 'POST', body: JSON.stringify(input) })).data;
export const updateDataset = async (datasetId: string, input: DatasetInput) => (await api<{ data: Dataset }>(base(datasetId), { method: 'PATCH', body: JSON.stringify(input) })).data;
export const deleteDataset = (datasetId: string) => api<void>(base(datasetId), { method: 'DELETE' });
export const listImports = (datasetId: string, page: number) => api<Page<ImportJob>>(`${base(datasetId)}/imports?page=${page}&pageSize=10`);
export const listRejections = (datasetId: string, jobId: string, page: number) => api<Page<RawRecord>>(`${base(datasetId)}/imports/${encodeURIComponent(jobId)}/rejections?page=${page}&pageSize=20`);
export const retryImport = async (datasetId: string, jobId: string) => (await api<{ data: ImportJob }>(`${base(datasetId)}/imports/${encodeURIComponent(jobId)}/retry`, { method: 'POST' })).data;

// The shared api() helper always sends JSON; uploads need a multipart body
// whose boundary the browser sets, so this call uses fetch directly.
export async function uploadCsv(datasetId: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  let response: Response;
  try { response = await fetch(`/api${base(datasetId)}/imports`, { method: 'POST', body, credentials: 'same-origin', headers: { 'X-Requested-With': 'SalesPlatform' } }); }
  catch { throw new Error('Unable to reach the server. Please try again.'); }
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, json?.error?.message ?? 'Upload failed');
  return (json as { data: ImportJob }).data;
}

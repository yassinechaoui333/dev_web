import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../../shared/api';
import {
  MAX_UPLOAD_BYTES, REQUIRED_COLUMNS, deleteDataset, getDataset, listImports, listRejections, retryImport, updateDataset, uploadCsv,
  type Dataset, type DatasetInput, type ImportJob, type Page, type RawRecord,
} from './api';
import { Pager } from './Pager';

// JSON storage does not keep key order; show agreed columns in CSV order, then extras.
const orderedValues = (values: Record<string, string>) => [
  ...REQUIRED_COLUMNS.filter(c => c in values).map(c => [c, values[c]] as const),
  ...Object.entries(values).filter(([k]) => !(REQUIRED_COLUMNS as readonly string[]).includes(k)),
];
const STATUS_LABEL = { pending: 'Queued', processing: 'Processing', completed: 'Completed', failed: 'Failed' } as const;

export function DatasetDetailPage() {
  const { datasetId = '' } = useParams(), navigate = useNavigate();
  const [dataset, setDataset] = useState<Dataset | null>(null), [error, setError] = useState(''), [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false), [deleting, setDeleting] = useState(false), [historyVersion, setHistoryVersion] = useState(0);
  const load = useCallback(async () => {
    setError('');
    try { setDataset(await getDataset(datasetId)); }
    catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 400)) setMissing(true); else setError((e as Error).message); }
  }, [datasetId]);
  useEffect(() => { void load(); }, [load]);

  async function remove() {
    if (!dataset || !window.confirm(`Delete "${dataset.title}"? All imports, records and dashboards built on it will be permanently removed.`)) return;
    setDeleting(true); setError('');
    try { await deleteDataset(dataset.id); navigate('/app/datasets', { replace: true }); }
    catch (e) { setError((e as Error).message); setDeleting(false); }
  }

  if (missing) return <section><h1>Dataset not found</h1><p className="muted">It may have been deleted, or it belongs to another account.</p><Link to="/app/datasets">Back to datasets</Link></section>;
  if (error && !dataset) return <section><div className="error" role="alert">{error} <button className="secondary" onClick={() => void load()}>Retry</button></div></section>;
  if (!dataset) return <p role="status">Loading dataset…</p>;
  return <section className="datasets">
    <p className="eyebrow"><Link to="/app/datasets">DATASETS</Link> / DETAIL</p>
    {editing ? <EditDatasetForm dataset={dataset} onDone={saved => { if (saved) setDataset(saved); setEditing(false); }}/> : <>
      <div className="title-row"><h1>{dataset.title}</h1><div className="actions">
        <button className="secondary" onClick={() => setEditing(true)}>Edit details</button>
        <button className="danger" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete dataset'}</button>
      </div></div>
      {dataset.description && <p className="muted">{dataset.description}</p>}
      <dl className="facts">
        <div><dt>Category</dt><dd>{dataset.category || '—'}</dd></div>
        <div><dt>Source</dt><dd>{dataset.source || '—'}</dd></div>
        <div><dt>Currency</dt><dd>{dataset.currency}</dd></div>
        <div><dt>Date format</dt><dd>{dataset.dateFormat === 'ISO8601' ? 'ISO 8601' : 'dd/MM/yyyy HH:mm'}</dd></div>
        <div><dt>Timezone</dt><dd>{dataset.timezone}</dd></div>
        <div><dt>Created</dt><dd>{new Date(dataset.createdAt).toLocaleString()}</dd></div>
      </dl>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    <UploadPanel dataset={dataset} onUploaded={() => setHistoryVersion(v => v + 1)}/>
    <ImportHistory datasetId={dataset.id} version={historyVersion}/>
  </section>;
}

function EditDatasetForm({ dataset, onDone }: { dataset: Dataset; onDone: (saved?: Dataset) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try { onDone(await updateDataset(dataset.id, Object.fromEntries(new FormData(event.currentTarget)) as unknown as DatasetInput)); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <form className="panel" onSubmit={submit} aria-label="Edit dataset">
    <h2>Edit details</h2>
    <label>Title<input name="title" required maxLength={200} defaultValue={dataset.title}/></label>
    <label>Description<textarea name="description" maxLength={5000} rows={3} defaultValue={dataset.description}/></label>
    <div className="grid-2">
      <label>Category<input name="category" maxLength={100} defaultValue={dataset.category}/></label>
      <label>Source<input name="source" maxLength={500} defaultValue={dataset.source}/></label>
    </div>
    <small className="muted">Currency, date format and timezone are fixed once the dataset exists.</small>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button><button type="button" className="secondary" onClick={() => onDone()}>Cancel</button></div>
  </form>;
}

function UploadPanel({ dataset, onUploaded }: { dataset: Dataset; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [success, setSuccess] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    const file = input.current?.files?.[0];
    if (!file) return setError('Choose a CSV file first.');
    if (!file.name.toLowerCase().endsWith('.csv')) return setError('Only .csv files are accepted.');
    if (file.size > MAX_UPLOAD_BYTES) return setError('This file is larger than 10 MiB.');
    if (file.size === 0) return setError('This file is empty.');
    setBusy(true);
    try {
      await uploadCsv(dataset.id, file);
      setSuccess(`"${file.name}" was received and is being processed. Its status appears in the import history below.`);
      if (input.current) input.current.value = '';
      onUploaded();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const example = dataset.dateFormat === 'ISO8601' ? '2026-03-02T09:15:00Z' : '02/03/2026 09:15';
  return <form className="panel upload" onSubmit={submit} aria-label="Upload CSV">
    <h2>Upload sales CSV</h2>
    <p className="muted">UTF-8 CSV, comma-separated, first row is the header, at most 10 MiB and 100,000 rows. Column names are case-sensitive; extra columns are kept but not analysed.</p>
    <div className="columns" aria-label="Required columns">{REQUIRED_COLUMNS.map(c => <code key={c}>{c}</code>)}</div>
    <ul className="muted rules">
      <li><strong>InvoiceDate</strong>: {dataset.dateFormat === 'ISO8601' ? 'ISO 8601' : 'dd/MM/yyyy HH:mm'}, e.g. <code>{example}</code>. Times without an offset use {dataset.timezone}.</li>
      <li><strong>Quantity</strong> and <strong>UnitPrice</strong>: plain numbers with up to 4 decimals (<code>3.25</code>). Negative quantities are returns; prices cannot be negative.</li>
      <li>Invoices starting with <strong>C</strong> are cancellations. <strong>CustomerID</strong> may be blank; all other columns are required.</li>
      <li>Invalid rows are rejected and listed with their reason; valid rows are still imported. The same file cannot be imported twice into one dataset.</li>
    </ul>
    <div className="actions"><input ref={input} type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" disabled={busy}/><button disabled={busy}>{busy ? 'Uploading…' : 'Upload'}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {success && <p className="success" role="status">{success}</p>}
  </form>;
}

function ImportHistory({ datasetId, version }: { datasetId: string; version: number }) {
  const [page, setPage] = useState(1), [result, setResult] = useState<Page<ImportJob> | null>(null);
  const [error, setError] = useState(''), [actionError, setActionError] = useState(''), [selected, setSelected] = useState<ImportJob | null>(null);
  const load = useCallback(async () => {
    try { setResult(await listImports(datasetId, page)); setError(''); } catch (e) { setError((e as Error).message); }
  }, [datasetId, page]);
  useEffect(() => { void load(); }, [load, version]);
  // Refresh while any visible job is still queued or processing.
  const active = result?.data.some(job => job.status === 'pending' || job.status === 'processing');
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, [active, load]);

  async function retry(job: ImportJob) {
    setActionError('');
    try { await retryImport(datasetId, job.id); await load(); } catch (e) { setActionError((e as Error).message); }
  }
  return <div className="history">
    <h2>Import history</h2>
    {error && <div className="error" role="alert">{error} <button className="secondary" onClick={() => void load()}>Retry</button></div>}
    {actionError && <p className="error" role="alert">{actionError}</p>}
    {!result ? !error && <p role="status">Loading imports…</p>
      : !result.data.length ? <article className="empty"><p>No files imported yet. Upload a CSV above to get started.</p></article>
      : <>
        <div className="table-wrap"><table>
          <thead><tr><th>File</th><th>Uploaded</th><th>Status</th><th>Rows</th><th>Accepted</th><th>Rejected</th><th aria-label="Actions"/></tr></thead>
          <tbody>{result.data.map(job => <tr key={job.id} className={selected?.id === job.id ? 'selected' : undefined}>
            <td>{job.filename}{job.retryCount > 0 && <small className="muted block">Retried {job.retryCount}×</small>}</td>
            <td>{new Date(job.createdAt).toLocaleString()}</td>
            <td><span className={'status ' + job.status}>{STATUS_LABEL[job.status]}</span>{job.error && <small className="block error-text">{job.error}</small>}</td>
            <td>{job.status === 'completed' || job.totalRows ? job.totalRows : '—'}</td>
            <td>{job.status === 'completed' ? job.acceptedRows : '—'}</td>
            <td>{job.status === 'completed' ? job.rejectedRows : '—'}</td>
            <td><div className="actions">
              {job.status === 'completed' && job.rejectedRows > 0 && <button className="secondary" aria-pressed={selected?.id === job.id} onClick={() => setSelected(selected?.id === job.id ? null : job)}>{selected?.id === job.id ? 'Hide rejected rows' : 'View rejected rows'}</button>}
              {job.status === 'failed' && <button className="secondary" onClick={() => void retry(job)}>Retry</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>
        <Pager meta={result.meta} onPage={setPage} label="imports"/>
      </>}
    {selected && <RejectionReport key={selected.id} datasetId={datasetId} job={selected}/>}
  </div>;
}

function RejectionReport({ datasetId, job }: { datasetId: string; job: ImportJob }) {
  const [page, setPage] = useState(1), [result, setResult] = useState<Page<RawRecord> | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setResult(null); setError('');
    listRejections(datasetId, job.id, page).then(r => { if (current) setResult(r); }, e => { if (current) setError((e as Error).message); });
    return () => { current = false; };
  }, [datasetId, job.id, page]);
  return <div className="panel rejections" aria-live="polite">
    <h2>Rejected rows · {job.filename}</h2>
    <p className="muted">These rows were not imported. Row numbers match the file (the header is row 1). Fix them in the source file and upload it as a new file.</p>
    {error ? <p className="error" role="alert">{error}</p> : !result ? <p role="status">Loading rejected rows…</p> : <>
      <div className="table-wrap"><table>
        <thead><tr><th>Row</th><th>Reason</th><th>Original values</th></tr></thead>
        <tbody>{result.data.map(record => <tr key={record.id}>
          <td>{record.sourceRow}</td>
          <td><ul className="reasons">{record.validationErrors?.map((e, i) => <li key={i}><strong>{e.field === 'row' ? 'Row' : e.field}</strong>: {e.message}</li>)}</ul></td>
          <td><pre>{orderedValues(record.values).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre></td>
        </tr>)}</tbody>
      </table></div>
      <Pager meta={result.meta} onPage={setPage} label="rejected rows"/>
    </>}
  </div>;
}

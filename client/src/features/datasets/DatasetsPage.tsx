import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CURRENCIES, createDataset, listDatasets, type Dataset, type DatasetInput, type Page } from './api';
import { Pager } from './Pager';

const timezones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

export function DatasetsPage() {
  const [page, setPage] = useState(1), [result, setResult] = useState<Page<Dataset> | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [creating, setCreating] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setResult(await listDatasets(page)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  return <section className="datasets">
    <p className="eyebrow">DATA SOURCES</p>
    <div className="title-row"><h1>Datasets</h1>{!creating && <button onClick={() => setCreating(true)}>New dataset</button>}</div>
    <p className="muted">Create a dataset, then upload sales CSV files into it. Only you can see your datasets.</p>
    {creating && <CreateDatasetForm onCancel={() => setCreating(false)}/>}
    {loading && !result ? <p role="status">Loading datasets…</p>
      : error ? <div className="error" role="alert">{error} <button className="secondary" onClick={() => void load()}>Retry</button></div>
      : !result?.data.length ? <article className="empty"><h2>No datasets yet</h2><p>Create your first dataset to start importing sales records.</p></article>
      : <>
        <div className="table-wrap"><table>
          <thead><tr><th>Title</th><th>Category</th><th>Currency</th><th>Created</th></tr></thead>
          <tbody>{result.data.map(d => <tr key={d.id}><td><Link to={d.id}>{d.title}</Link>{d.description && <small className="muted block">{d.description}</small>}</td><td>{d.category || '—'}</td><td>{d.currency}</td><td>{new Date(d.createdAt).toLocaleDateString()}</td></tr>)}</tbody>
        </table></div>
        <Pager meta={result.meta} onPage={setPage} label="datasets"/>
      </>}
  </section>;
}

function CreateDatasetForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(event.currentTarget)) as unknown as DatasetInput;
    try { navigate((await createDataset(values)).id); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <form className="panel" onSubmit={submit} aria-label="New dataset">
    <h2>New dataset</h2>
    <label>Title<input name="title" required maxLength={200} autoFocus/></label>
    <label>Description<textarea name="description" maxLength={5000} rows={3}/></label>
    <div className="grid-2">
      <label>Category<input name="category" maxLength={100} placeholder="e.g. Retail"/></label>
      <label>Source<input name="source" maxLength={500} placeholder="e.g. Store POS export"/></label>
    </div>
    <div className="grid-2">
      <label>Currency<select name="currency" defaultValue="GBP">{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Date format in your CSV<select name="dateFormat" defaultValue="ISO8601"><option value="ISO8601">ISO 8601 (2026-03-02T09:15:00Z)</option><option value="DMY_HM">Day/month/year (02/03/2026 09:15)</option></select></label>
    </div>
    <label>Timezone for dates without an offset<input name="timezone" defaultValue="UTC" list="timezones" required/><datalist id="timezones">{timezones.map(t => <option key={t} value={t}/>)}</datalist></label>
    <small className="muted">Currency, date format and timezone cannot be changed later.</small>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={busy}>{busy ? 'Creating…' : 'Create dataset'}</button><button type="button" className="secondary" onClick={onCancel}>Cancel</button></div>
  </form>;
}

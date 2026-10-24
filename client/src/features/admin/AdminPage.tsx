import { useEffect, useState } from 'react';
import { api, ApiError, type User } from '../../shared/api';
import { useAuth } from '../auth/AuthContext';
type Meta = { page: number; pageSize: number; total: number; totalPages: number };
type Dataset = { id: string; title: string; currency: string; createdAt: string; owner: { name: string; email: string }; _count: { salesRecords: number; importJobs: number } };
type Activity = { id: string; action: string; entityType: string; entityId: string | null; createdAt: string; actor: { name: string; email: string } | null; metadata: unknown };
type Summary = { users: number; activeUsers: number; datasets: number; importJobs: number; salesRecords: number; activities: number };
type Tab = 'users' | 'datasets' | 'activities';
type Snapshot = { tab: Tab; data: (User | Dataset | Activity)[]; meta: Meta; summary: Summary };
const labels: Record<Tab, string> = { users: 'Users', datasets: 'Datasets', activities: 'Activity' };
const date = (value: string) => new Date(value).toLocaleString();
export function AdminPage() {
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('users'), [page, setPage] = useState(1), [revision, setRevision] = useState(0);
  const [result, setSnapshot] = useState<Snapshot | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [saving, setSaving] = useState(false);
  const snapshot = result?.tab === tab && result.meta.page === page ? result : null;
  const [pending, setPending] = useState<{ user: User; changes: { role?: User['role']; active?: boolean } } | null>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setSnapshot(null);
    void Promise.all([api<{ data: Summary }>('/admin/summary'), api<{ data: Snapshot['data']; meta: Meta }>('/admin/' + tab + '?page=' + page + '&pageSize=10')])
      .then(([summary, list]) => { if (active) setSnapshot({ ...list, summary: summary.data, tab }); })
      .catch(async e => { if (active) setError((e as Error).message); if (e instanceof ApiError && [401, 403].includes(e.status)) await refresh(); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, page, revision]);
  async function confirmChange() {
    if (!pending) return; setSaving(true); setError(''); setNotice('');
    try { await api('/admin/users/' + pending.user.id, { method: 'PATCH', body: JSON.stringify(pending.changes) }); setNotice('Account updated. Existing sessions for that user have been revoked.'); setPending(null); setRevision(v => v + 1); }
    catch (e) { setError((e as Error).message); if (e instanceof ApiError && [401, 403].includes(e.status)) await refresh(); }
    finally { setSaving(false); }
  }
  return <><p className="eyebrow">PLATFORM ADMINISTRATION</p><h1>Workspace control</h1><p className="muted">Manage access and follow platform activity.</p>
    {notice && <p className="success" role="status">{notice}</p>}{error && <div className="error" role="alert">{error} <button className="secondary" onClick={() => setRevision(v => v + 1)}>Retry</button></div>}
    {snapshot && <div className="cards metrics">{[['Users', snapshot.summary.users], ['Active users', snapshot.summary.activeUsers], ['Datasets', snapshot.summary.datasets], ['Imports', snapshot.summary.importJobs], ['Sales records', snapshot.summary.salesRecords], ['Activity entries', snapshot.summary.activities]].map(([label, value]) => <article key={label}><small>{label}</small><strong className="metric">{Number(value).toLocaleString()}</strong></article>)}</div>}
    <div className="tabs" role="group" aria-label="Administration sections">{(['users','datasets','activities'] as Tab[]).map(t => <button className="secondary" key={t} aria-pressed={tab === t} disabled={saving} onClick={() => { setTab(t); setPage(1); setPending(null); setNotice(''); }}>{labels[t]}</button>)}</div>
    {pending && <section className="panel review" aria-labelledby="change-title"><h2 id="change-title">Review account change</h2><p>{pending.user.name} ({pending.user.email})</p><p>{pending.changes.role ? 'Set role to ' + pending.changes.role : pending.changes.active ? 'Activate this account' : 'Deactivate this account'}. This signs the user out of existing sessions.</p><div className="actions"><button disabled={saving} onClick={() => void confirmChange()}>{saving ? 'Saving…' : 'Confirm change'}</button><button className="secondary" disabled={saving} onClick={() => setPending(null)}>Cancel</button></div></section>}
    {loading && <p role="status">Loading {labels[tab].toLowerCase()}…</p>}
    {snapshot && <>{snapshot.data.length === 0 ? <article><h2>No {labels[tab].toLowerCase()} to show</h2><p>There are no entries on this page.</p></article> : <div className="table-wrap"><table><caption className="sr-only">{labels[tab]}</caption>
      {tab === 'users' && <><thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Manage</th></tr></thead><tbody>{(snapshot.data as User[]).map(u => <tr key={u.id}><td><strong>{u.name}</strong><br/>{u.email}{u.id === user?.id && <span className="badge"> You</span>}</td><td>{u.role}</td><td>{u.active ? 'Active' : 'Inactive'}</td><td><div className="actions"><button className="secondary" disabled={u.id === user?.id || saving} onClick={() => setPending({ user: u, changes: { role: u.role === 'ADMIN' ? 'USER' : 'ADMIN' } })}>{u.role === 'ADMIN' ? 'Make member' : 'Make admin'}</button><button className="secondary" disabled={u.id === user?.id || saving} onClick={() => setPending({ user: u, changes: { active: !u.active } })}>{u.active ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}</tbody></>}
      {tab === 'datasets' && <><thead><tr><th scope="col">Dataset</th><th scope="col">Owner</th><th scope="col">Currency</th><th scope="col">Imports</th><th scope="col">Records</th><th scope="col">Created</th></tr></thead><tbody>{(snapshot.data as Dataset[]).map(d => <tr key={d.id}><td>{d.title}</td><td>{d.owner.name}<br/>{d.owner.email}</td><td>{d.currency}</td><td>{d._count.importJobs}</td><td>{d._count.salesRecords}</td><td>{date(d.createdAt)}</td></tr>)}</tbody></>}
      {tab === 'activities' && <><thead><tr><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Resource</th></tr></thead><tbody>{(snapshot.data as Activity[]).map(a => <tr key={a.id}><td>{date(a.createdAt)}</td><td>{a.actor?.name ?? 'System'}<br/>{a.actor?.email}</td><td>{a.action}</td><td>{a.entityType}<br/><small>{a.entityId}</small>{a.metadata !== null && <details><summary>Change details</summary><pre>{JSON.stringify(a.metadata, null, 2)}</pre></details>}</td></tr>)}</tbody></>}
    </table></div>}
    <div className="pager"><button className="secondary" disabled={page <= 1 || loading || saving} onClick={() => setPage(v => v - 1)}>Previous</button><span>Page {snapshot.meta.page} of {Math.max(1, snapshot.meta.totalPages)} · {snapshot.meta.total} entries</span><button className="secondary" disabled={page >= snapshot.meta.totalPages || loading || saving} onClick={() => setPage(v => v + 1)}>Next</button></div></>}
  </>;
}

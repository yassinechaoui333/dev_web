import type { Page } from './api';
export function Pager({ meta, onPage, label }: { meta: Page<unknown>['meta']; onPage: (page: number) => void; label: string }) {
  if (meta.totalPages <= 1) return null;
  return <nav className="pager" aria-label={label + ' pages'}>
    <button className="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>Previous</button>
    <span>Page {meta.page} of {meta.totalPages} · {meta.total} total</span>
    <button className="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>Next</button>
  </nav>;
}

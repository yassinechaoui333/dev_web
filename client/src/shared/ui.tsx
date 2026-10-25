import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api } from "./api";
export type Meta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
export function query(values: Record<string, unknown>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(values))
    if (v !== "" && v !== undefined && v !== null) q.set(k, String(v));
  return q.toString();
}
export function useApi<T = any>(url: string | null) {
  const [revision, setRevision] = useState(0),
    [state, setState] = useState<{
      url: string | null;
      data: T | null;
      loading: boolean;
      error: string;
    }>({ url: null, data: null, loading: false, error: "" });
  useEffect(() => {
    let active = true;
    if (!url) {
      setState({ url, data: null, loading: false, error: "" });
      return;
    }
    setState({ url, data: null, loading: true, error: "" });
    void api<T>(url)
      .then((data) => {
        if (active) setState({ url, data, loading: false, error: "" });
      })
      .catch((e) => {
        if (active)
          setState({ url, data: null, loading: false, error: e.message });
      });
    return () => {
      active = false;
    };
  }, [url, revision]);
  return {
    ...(state.url === url
      ? state
      : { url, data: null, loading: !!url, error: "" }),
    reload: () => setRevision((n) => n + 1),
  };
}
export function Feedback({
  loading,
  error,
}: {
  loading?: boolean;
  error?: string;
}) {
  return (
    <>
      {loading && <p role="status">Chargement…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
export function Pager({
  meta,
  onPage,
}: {
  meta?: Meta;
  onPage: (n: number) => void;
}) {
  if (!meta) return null;
  return (
    <div className="pager">
      <button
        className="secondary"
        disabled={meta.page <= 1}
        onClick={() => onPage(meta.page - 1)}
      >
        Précédent
      </button>
      <span>
        Page {meta.page} / {Math.max(1, meta.totalPages)} · {meta.total}{" "}
        résultats
      </span>
      <button
        className="secondary"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onPage(meta.page + 1)}
      >
        Suivant
      </button>
    </div>
  );
}
export function Table({
  headings,
  rows,
}: {
  headings: string[];
  rows: ReactNode[][];
}) {
  return rows.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headings.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="muted">Aucun résultat.</p>
  );
}
export type Filters = {
  from?: string;
  to?: string;
  country?: string;
  productCode?: string;
};
export function FilterForm({
  value = {},
  onChange,
}: {
  value?: Filters;
  onChange: (f: Filters) => void;
}) {
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
    onChange({
      ...(f.from
        ? { from: new Date(f.from + "T00:00:00Z").toISOString() }
        : {}),
      ...(f.to
        ? {
            to: new Date(
              new Date(f.to + "T00:00:00Z").getTime() + 86400000,
            ).toISOString(),
          }
        : {}),
      ...(f.country ? { country: f.country } : {}),
      ...(f.productCode ? { productCode: f.productCode } : {}),
    });
  }
  const end = value.to
    ? new Date(new Date(value.to).getTime() - 86400000)
        .toISOString()
        .slice(0, 10)
    : "";
  return (
    <form className="filters" key={JSON.stringify(value)} onSubmit={submit}>
      <label>
        Du (UTC)
        <input
          name="from"
          type="date"
          defaultValue={value.from?.slice(0, 10)}
        />
      </label>
      <label>
        Au inclus (UTC)
        <input name="to" type="date" defaultValue={end} />
      </label>
      <label>
        Pays exact
        <input name="country" defaultValue={value.country} />
      </label>
      <label>
        Code produit
        <input name="productCode" defaultValue={value.productCode} />
      </label>
      <div className="actions">
        <button>Appliquer</button>
        <button
          type="button"
          className="secondary"
          onClick={() => onChange({})}
        >
          Effacer
        </button>
      </div>
    </form>
  );
}
export const amount = (value: string | null | undefined, currency = "") =>
  value == null
    ? "—"
    : value.replace(".", ",") + (currency ? " " + currency : "");

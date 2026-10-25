import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api } from "../../shared/api";
import { useApi, Feedback, Pager, Table } from "../../shared/ui";
function MetadataForm({
  initial,
  onSave,
  create = false,
}: {
  initial?: any;
  onSave: (v: any) => Promise<void>;
  create?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      await onSave(values);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      <label>
        Titre
        <input
          name="title"
          defaultValue={initial?.title}
          required
          maxLength={200}
        />
      </label>
      <label>
        Description
        <textarea
          name="description"
          defaultValue={initial?.description}
          maxLength={5000}
        />
      </label>
      <div className="form-grid">
        <label>
          Catégorie
          <input
            name="category"
            defaultValue={initial?.category}
            maxLength={100}
          />
        </label>
        <label>
          Source
          <input name="source" defaultValue={initial?.source} maxLength={500} />
        </label>
      </div>
      {create && (
        <div className="form-grid">
          <label>
            Devise
            <select name="currency">
              <option>GBP</option>
              <option>EUR</option>
              <option>USD</option>
              <option>MAD</option>
            </select>
          </label>
          <label>
            Format de date
            <select name="dateFormat">
              <option value="ISO8601">ISO 8601</option>
              <option value="DMY_HM">jj/MM/aaaa HH:mm</option>
            </select>
          </label>
          <label>
            Fuseau horaire
            <input name="timezone" defaultValue="UTC" required />
          </label>
        </div>
      )}
      <Feedback error={error} />
      <button disabled={busy}>
        {busy ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
export function DatasetsPage() {
  const [page, setPage] = useState(1),
    [creating, setCreating] = useState(false),
    navigate = useNavigate();
  const list = useApi("/datasets?page=" + page);
  return (
    <>
      <p className="eyebrow">IMPORTATION</p>
      <h1>Jeux de données</h1>
      <p className="muted">
        Créez un dataset, puis importez vos ventes au format CSV.
      </p>
      <button onClick={() => setCreating((v) => !v)}>
        {creating ? "Fermer" : "Nouveau dataset"}
      </button>
      {creating && (
        <MetadataForm
          create
          onSave={async (values) => {
            const result = await api<any>("/datasets", {
              method: "POST",
              body: JSON.stringify(values),
            });
            navigate("/app/datasets/" + result.data.id);
          }}
        />
      )}
      <Feedback loading={list.loading} error={list.error} />
      {list.data && (
        <>
          <Table
            headings={["Titre", "Catégorie", "Devise", "Création", ""]}
            rows={list.data.data.map((d: any) => [
              d.title,
              d.category || "—",
              d.currency,
              new Date(d.createdAt).toLocaleDateString("fr-FR"),
              <Link to={"/app/datasets/" + d.id}>Ouvrir</Link>,
            ])}
          />
          <Pager meta={list.data.meta} onPage={setPage} />
        </>
      )}
    </>
  );
}
export function DatasetDetail() {
  const { datasetId } = useParams(),
    navigate = useNavigate();
  const [page, setPage] = useState(1),
    [report, setReport] = useState(""),
    [reportPage, setReportPage] = useState(1),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const detail = useApi("/datasets/" + datasetId),
    jobs = useApi("/datasets/" + datasetId + "/imports?page=" + page),
    rejections = useApi(
      report
        ? "/datasets/" +
            datasetId +
            "/imports/" +
            report +
            "/rejections?page=" +
            reportPage
        : null,
    );
  const active = jobs.data?.data.some((j: any) =>
    ["pending", "processing"].includes(j.status),
  );
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => jobs.reload(), 1500);
    return () => clearInterval(timer);
  }, [active, datasetId, page]);
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/datasets/" + datasetId + "/imports", {
        method: "POST",
        body: new FormData(form),
      });
      setNotice("Fichier reçu. Le traitement continue en arrière-plan.");
      form.reset();
      setPage(1);
      jobs.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("Supprimer ce dataset, ses imports et ses dashboards ?"))
      return;
    try {
      await api("/datasets/" + datasetId, { method: "DELETE" });
      navigate("/app/datasets");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Link to="/app/datasets">← Datasets</Link>
      <Feedback loading={detail.loading} error={detail.error} />
      {detail.data && (
        <>
          <p className="eyebrow">DATASET · {detail.data.data.currency}</p>
          <h1>{detail.data.data.title}</h1>
          <p>{detail.data.data.description}</p>
          <p className="muted">
            {detail.data.data.category || "Sans catégorie"} ·{" "}
            {detail.data.data.source || "Source non renseignée"} ·{" "}
            {detail.data.data.timezone}
          </p>
          <div className="actions">
            <Link className="button" to={"/app/analytics?dataset=" + datasetId}>
              Explorer et analyser
            </Link>
            <Link to={"/app/dashboards?dataset=" + datasetId}>
              Créer un dashboard
            </Link>
            <button className="secondary" onClick={() => setEditing((v) => !v)}>
              Modifier les informations
            </button>
            <button className="secondary" onClick={() => void remove()}>
              Supprimer
            </button>
          </div>
          {editing && (
            <MetadataForm
              initial={detail.data.data}
              onSave={async (values) => {
                await api("/datasets/" + datasetId, {
                  method: "PATCH",
                  body: JSON.stringify(values),
                });
                detail.reload();
                setEditing(false);
              }}
            />
          )}
          <section className="panel section">
            <h2>Importer un CSV</h2>
            <p className="muted">
              UTF-8, virgules, maximum 10 Mio / 100 000 lignes. Les valeurs de
              CustomerID peuvent être vides.
            </p>
            <code className="csv-columns">
              InvoiceNo,StockCode,Description,Quantity,InvoiceDate,UnitPrice,CustomerID,Country
            </code>
            <p>
              <a href="/examples/ventes-demo.csv" download>
                Télécharger un exemple fictif
              </a>
            </p>
            <form onSubmit={upload}>
              <label>
                Fichier CSV
                <input
                  name="file"
                  type="file"
                  accept=".csv,text/csv"
                  required
                />
              </label>
              <button disabled={busy}>{busy ? "Envoi…" : "Importer"}</button>
            </form>
            <p className="muted">
              Les retours sont conservés. Un même fichier ne peut être importé
              deux fois dans ce dataset.
            </p>
          </section>
        </>
      )}
      <Feedback error={error} />
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <h2 className="section">Historique des imports</h2>
      <Feedback loading={jobs.loading} error={jobs.error} />
      {jobs.data && (
        <>
          <Table
            headings={["Fichier", "État", "Acceptées", "Rejetées", "Rapport"]}
            rows={jobs.data.data.map((j: any) => [
              j.filename,
              <>
                <span className="badge">
                  {
                    {
                      pending: "En attente",
                      processing: "Traitement",
                      completed: "Terminé",
                      failed: "Échec",
                    }[
                      j.status as
                        | "pending"
                        | "processing"
                        | "completed"
                        | "failed"
                    ]
                  }
                </span>
                {j.error && <p className="error">{j.error}</p>}
              </>,
              j.acceptedRows,
              j.rejectedRows,
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => {
                    setReport(j.id);
                    setReportPage(1);
                  }}
                >
                  Voir les rejets
                </button>
                {j.status === "failed" && (
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await api(
                          "/datasets/" +
                            datasetId +
                            "/imports/" +
                            j.id +
                            "/retry",
                          { method: "POST", body: "{}" },
                        );
                        jobs.reload();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Relancer
                  </button>
                )}
              </div>,
            ])}
          />
          <Pager meta={jobs.data.meta} onPage={setPage} />
        </>
      )}
      {report && (
        <section className="section">
          <h2>Lignes rejetées</h2>
          <Feedback loading={rejections.loading} error={rejections.error} />
          {rejections.data && (
            <>
              <Table
                headings={["Ligne source", "Valeurs originales", "Motif"]}
                rows={rejections.data.data.map((r: any) => [
                  r.sourceRow,
                  <details>
                    <summary>Afficher</summary>
                    <pre>{JSON.stringify(r.values, null, 2)}</pre>
                  </details>,
                  r.validationErrors
                    .map((e: any) => e.field + " : " + e.message)
                    .join(" · "),
                ])}
              />
              <Pager meta={rejections.data.meta} onPage={setReportPage} />
            </>
          )}
        </section>
      )}
    </>
  );
}

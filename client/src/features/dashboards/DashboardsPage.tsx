import { useState, type FormEvent } from "react";
import {
  Link,
  useParams,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { api } from "../../shared/api";
import {
  useApi,
  Feedback,
  Pager,
  Table,
  FilterForm,
  amount,
  type Filters,
} from "../../shared/ui";
const options = [
  ["netRevenue", "day", "kpi", "CA net"],
  ["orderCount", "day", "kpi", "Commandes"],
  ["averageOrderValue", "day", "kpi", "Panier moyen"],
  ["netRevenue", "day", "line", "Évolution des ventes"],
  ["netRevenue", "productCode", "bar", "Meilleurs produits"],
  ["netRevenue", "country", "pie", "Ventes par pays"],
];
function makeConfig(selected: string[], filters: Filters = {}, old?: any) {
  const charts = options
    .filter((_, i) => selected.includes(String(i)))
    .map(([metric, groupBy, type, title]) => ({
      id:
        old?.charts.find(
          (c: any) =>
            c.metric === metric && c.type === type && c.groupBy === groupBy,
        )?.id ?? crypto.randomUUID(),
      metric,
      groupBy,
      type,
      title,
    }));
  return {
    version: 1,
    filters,
    charts,
    layout: charts.map((c, i) => ({
      chartId: c.id,
      x: c.type === "kpi" ? (i % 3) * 4 : 0,
      y:
        c.type === "kpi"
          ? 0
          : 1 + 3 * charts.slice(0, i).filter((p) => p.type !== "kpi").length,
      width: c.type === "kpi" ? 4 : 12,
      height: c.type === "kpi" ? 1 : 3,
    })),
  };
}
function ChooseCharts({ config }: { config?: any }) {
  return (
    <fieldset>
      <legend>Widgets</legend>
      {options.map(([metric, groupBy, type, title], i) => (
        <label className="check" key={i}>
          <input
            type="checkbox"
            name="chart"
            value={i}
            defaultChecked={
              !config ||
              config.charts.some(
                (c: any) =>
                  c.metric === metric &&
                  c.type === type &&
                  c.groupBy === groupBy,
              )
            }
          />
          {title}
        </label>
      ))}
    </fieldset>
  );
}
export function DashboardsPage() {
  const [params] = useSearchParams(),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    navigate = useNavigate(),
    list = useApi("/dashboards?page=" + page),
    datasets = useApi("/datasets?pageSize=100");
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const config = makeConfig(f.getAll("chart").map(String));
      if (!config.charts.length)
        throw new Error("Choisissez au moins un widget");
      const r = await api<any>("/dashboards", {
        method: "POST",
        body: JSON.stringify({
          title: f.get("title"),
          datasetId: f.get("datasetId"),
          config,
        }),
      });
      navigate("/app/dashboards/" + r.data.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">VISUALISATION ET PARTAGE</p>
      <h1>Dashboards</h1>
      <p className="muted">
        Sauvegardez des indicateurs et partagez une vue en lecture seule.
      </p>
      <Feedback loading={list.loading} error={list.error} />
      {list.data && (
        <>
          <Table
            headings={["Titre", "Accès", "Création", ""]}
            rows={list.data.data.map((d: any) => [
              d.title,
              d.access === "owner" ? "Propriétaire" : "Lecture seule",
              new Date(d.createdAt).toLocaleDateString("fr-FR"),
              <Link to={"/app/dashboards/" + d.id}>Ouvrir</Link>,
            ])}
          />
          <Pager meta={list.data.meta} onPage={setPage} />
        </>
      )}
      <h2 className="section">Nouveau dashboard</h2>
      <Feedback error={datasets.error} />
      {datasets.data?.data.length === 0 ? (
        <p>
          <Link to="/app/datasets">
            Ajoutez un dataset pour créer un dashboard.
          </Link>
        </p>
      ) : (
        <form className="panel" onSubmit={create}>
          <label>
            Titre
            <input name="title" required maxLength={200} />
          </label>
          <label>
            Dataset
            <select
              name="datasetId"
              defaultValue={params.get("dataset") ?? ""}
              required
            >
              <option value="">Choisir</option>
              {datasets.data?.data.map((d: any) => (
                <option value={d.id} key={d.id}>
                  {d.title} ({d.currency})
                </option>
              ))}
            </select>
          </label>
          <ChooseCharts />
          <Feedback error={error} />
          <button disabled={busy}>
            {busy ? "Création…" : "Créer le dashboard"}
          </button>
        </form>
      )}
    </>
  );
}
function Widget({
  chart,
  points,
  currency,
}: {
  chart: any;
  points: any[];
  currency: string;
}) {
  const data = points.map((p) => ({
    label: p.label,
    value: p.value === null ? null : Number(p.value),
  }));
  const monetary = ["netRevenue", "averageOrderValue"].includes(chart.metric);
  return (
    <>
      <h2>{chart.title}</h2>
      {chart.type === "kpi" ? (
        <strong className="metric">
          {amount(points[0]?.value, monetary ? currency : "")}
        </strong>
      ) : data.length === 0 ? (
        <p>Aucune donnée pour ces filtres.</p>
      ) : (
        <div style={{ width: "100%", height: 280, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === "line" ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={chart.title}
                  stroke="#16634c"
                  strokeWidth={2}
                />
              </LineChart>
            ) : chart.type === "bar" ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" name={chart.title} fill="#30886a" />
              </BarChart>
            ) : (
              <PieChart>
                <Tooltip />
                <Pie
                  data={data.filter((p) => (p.value ?? 0) > 0)}
                  dataKey="value"
                  nameKey="label"
                  outerRadius={100}
                  label={({ name }) => name}
                >
                  {data.map((_, i) => (
                    <Cell
                      key={i}
                      fill={
                        ["#16634c", "#6da88d", "#d1a14b", "#6f87ac", "#ae7590"][
                          i % 5
                        ]
                      }
                    />
                  ))}
                </Pie>
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
      {chart.type === "pie" && (
        <small>
          Le graphique circulaire affiche les montants positifs ; les KPI
          conservent les retours.
        </small>
      )}
    </>
  );
}
export function DashboardDetail() {
  const { dashboardId } = useParams(),
    navigate = useNavigate(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [sharePage, setSharePage] = useState(1);
  const detail = useApi("/dashboards/" + dashboardId),
    d = detail.data?.data,
    owner = d?.access === "owner",
    data = useApi(d ? "/dashboards/" + dashboardId + "/data" : null),
    shares = useApi(
      owner ? "/dashboards/" + dashboardId + "/shares?page=" + sharePage : null,
    );
  // The revision lives only in React; API query strings remain contract-compliant.
  function refresh() {
    detail.reload();
    data.reload();
    shares.reload();
  }
  async function update(body: any) {
    setBusy(true);
    setError("");
    try {
      await api("/dashboards/" + dashboardId, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setNotice("Dashboard enregistré.");
      setEditing(false);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function edit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const config = makeConfig(
      f.getAll("chart").map(String),
      d.config.filters,
      d.config,
    );
    if (!config.charts.length) {
      setError("Choisissez au moins un widget");
      return;
    }
    await update({ title: f.get("title"), config });
  }
  async function share(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError("");
    try {
      await api("/dashboards/" + dashboardId + "/shares", {
        method: "POST",
        body: JSON.stringify({ email: new FormData(form).get("email") }),
      });
      form.reset();
      setNotice("Accès en lecture seule accordé.");
      shares.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <Link to="/app/dashboards">← Dashboards</Link>
      <Feedback loading={detail.loading} error={detail.error} />
      {d && (
        <>
          <p className="eyebrow">
            {owner ? "VOTRE DASHBOARD" : "PARTAGÉ AVEC VOUS · LECTURE SEULE"}
          </p>
          <h1>{d.title}</h1>
          <p className="muted">
            {data.data?.meta?.currency} · Tous les widgets utilisent les mêmes
            filtres enregistrés.
          </p>
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <Feedback error={error} />
          {owner ? (
            <>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => setEditing((v) => !v)}
                >
                  Renommer / choisir les widgets
                </button>
                <button
                  className="secondary"
                  onClick={async () => {
                    if (!confirm("Supprimer ce dashboard ?")) return;
                    try {
                      await api("/dashboards/" + dashboardId, {
                        method: "DELETE",
                      });
                      navigate("/app/dashboards");
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Supprimer
                </button>
              </div>
              {editing && (
                <form className="panel" onSubmit={edit}>
                  <label>
                    Titre
                    <input
                      name="title"
                      defaultValue={d.title}
                      required
                      maxLength={200}
                    />
                  </label>
                  <ChooseCharts config={d.config} />
                  <button disabled={busy}>Enregistrer</button>
                </form>
              )}
              <FilterForm
                value={d.config.filters}
                onChange={(filters) =>
                  void update({ config: { ...d.config, filters } })
                }
              />
            </>
          ) : (
            <p className="note">
              Lecture seule. Filtres :{" "}
              {Object.entries(d.config.filters)
                .map(([k, v]) => k + " = " + v)
                .join(" · ") || "aucun"}
              . Seul le propriétaire peut modifier cette vue.
            </p>
          )}
          <Feedback loading={data.loading} error={data.error} />
          {data.data && (
            <div className="dashboard-grid">
              {d.config.charts.map((chart: any) => {
                const l = d.config.layout.find(
                  (l: any) => l.chartId === chart.id,
                );
                return (
                  <article
                    key={chart.id}
                    style={{
                      gridColumn: l.x + 1 + " / span " + l.width,
                      gridRow: l.y + 1 + " / span " + l.height,
                    }}
                  >
                    <Widget
                      chart={chart}
                      points={
                        data.data.data.find((r: any) => r.chartId === chart.id)
                          ?.points ?? []
                      }
                      currency={data.data.meta?.currency ?? ""}
                    />
                  </article>
                );
              })}
            </div>
          )}
          {owner && (
            <section className="panel section">
              <h2>Partager avec un utilisateur inscrit</h2>
              <form className="actions" onSubmit={share}>
                <label>
                  Email
                  <input name="email" type="email" required maxLength={254} />
                </label>
                <button>Partager en lecture seule</button>
              </form>
              <Feedback loading={shares.loading} error={shares.error} />
              {shares.data && (
                <>
                  <Table
                    headings={["Utilisateur", "Email", ""]}
                    rows={shares.data.data.map((s: any) => [
                      s.user.name,
                      s.user.email,
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            await api(
                              "/dashboards/" +
                                dashboardId +
                                "/shares/" +
                                s.userId,
                              { method: "DELETE" },
                            );
                            shares.reload();
                            setNotice("Accès révoqué.");
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        Révoquer
                      </button>,
                    ])}
                  />
                  <Pager meta={shares.data.meta} onPage={setSharePage} />
                </>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}

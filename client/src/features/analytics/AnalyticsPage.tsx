import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useApi,
  query,
  Feedback,
  Pager,
  Table,
  FilterForm,
  amount,
  type Filters,
} from "../../shared/ui";
export function AnalyticsPage() {
  const [params, setParams] = useSearchParams(),
    datasetId = params.get("dataset") ?? "";
  const [filters, setFilters] = useState<Filters>({}),
    [tab, setTab] = useState("summary"),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [sortBy, setSortBy] = useState("invoiceDate"),
    [sortOrder, setSortOrder] = useState("desc"),
    [comparison, setComparison] = useState<Record<string, string>>({});
  const datasets = useApi("/datasets?pageSize=100"),
    base = "/datasets/" + datasetId + "/analytics",
    q = query(filters),
    stats = useApi(datasetId ? base + "/summary?" + q : null),
    info = useApi(datasetId ? base + "/info" : null);
  const products = useApi(
      datasetId && tab === "summary" ? base + "/top-products?" + q : null,
    ),
    countries = useApi(
      datasetId && tab === "summary" ? base + "/sales-by-country?" + q : null,
    );
  const rows = useApi(
      datasetId && tab === "records"
        ? base +
            "/records?" +
            query({ ...filters, page, pageSize: 20, search, sortBy, sortOrder })
        : null,
    ),
    quality = useApi(
      datasetId && tab === "quality" ? base + "/quality?" + q : null,
    ),
    flags = useApi(
      datasetId && tab === "outliers"
        ? base + "/outliers?" + query({ ...filters, page, pageSize: 20 })
        : null,
    ),
    compare = useApi(
      datasetId && tab === "comparison" && Object.keys(comparison).length
        ? base + "/comparison?" + query({ ...filters, ...comparison })
        : null,
    );
  const currency = stats.data?.data.currency ?? "";
  function compareSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<
      string,
      string
    >;
    setComparison({
      ...(f.compareDatasetId ? { compareDatasetId: f.compareDatasetId } : {}),
      ...(f.compareFrom
        ? { compareFrom: new Date(f.compareFrom + "T00:00:00Z").toISOString() }
        : {}),
      ...(f.compareTo
        ? {
            compareTo: new Date(
              new Date(f.compareTo + "T00:00:00Z").getTime() + 86400000,
            ).toISOString(),
          }
        : {}),
    });
  }
  return (
    <>
      <p className="eyebrow">EXPLORATION ET ANALYSE</p>
      <h1>Comprendre les ventes</h1>
      <label>
        Dataset
        <select
          value={datasetId}
          onChange={(e) => {
            setParams({ dataset: e.target.value });
            setFilters({});
            setPage(1);
            setComparison({});
          }}
        >
          <option value="">Choisir un dataset</option>
          {datasets.data?.data.map((d: any) => (
            <option key={d.id} value={d.id}>
              {d.title} ({d.currency})
            </option>
          ))}
        </select>
      </label>
      <Feedback loading={datasets.loading} error={datasets.error} />
      {!datasetId && (
        <p>
          <Link to="/app/datasets">
            Créez ou importez un dataset pour commencer.
          </Link>
        </p>
      )}
      {datasetId && (
        <>
          <FilterForm
            value={filters}
            onChange={(f) => {
              setFilters(f);
              setPage(1);
            }}
          />
          <Feedback loading={stats.loading} error={stats.error} />
          {stats.data && (
            <div className="cards metrics">
              {[
                ["CA net", amount(stats.data.data.netRevenue, currency)],
                ["Commandes", stats.data.data.orderCount],
                [
                  "Panier moyen",
                  amount(stats.data.data.averageOrderValue, currency),
                ],
              ].map(([label, value]) => (
                <article key={label}>
                  <small>{label}</small>
                  <strong className="metric">{value}</strong>
                </article>
              ))}
            </div>
          )}
          <p className="muted">
            Le CA inclut les retours. Les lignes d’une même facture ne comptent
            qu’une commande. {info.data?.data.recordCount ?? "…"} lignes
            publiées · {info.data?.data.timezone ?? "UTC"}
          </p>
          <div className="tabs" role="group" aria-label="Sections d’analyse">
            {[
              ["summary", "Synthèse"],
              ["records", "Exploration"],
              ["quality", "Qualité"],
              ["outliers", "Valeurs atypiques"],
              ["comparison", "Comparaison"],
            ].map(([key, label]) => (
              <button
                className="secondary"
                aria-pressed={tab === key}
                key={key}
                onClick={() => {
                  setTab(key);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "summary" && (
            <>
              <h2>Meilleurs produits</h2>
              <Feedback loading={products.loading} error={products.error} />
              {products.data && (
                <Table
                  headings={[
                    "Produit",
                    "Description",
                    "Quantité nette",
                    "CA net",
                  ]}
                  rows={products.data.data.map((r: any) => [
                    r.productCode,
                    r.description,
                    r.quantity,
                    amount(r.netRevenue, currency),
                  ])}
                />
              )}
              <h2>Ventes par pays</h2>
              <Feedback loading={countries.loading} error={countries.error} />
              {countries.data && (
                <Table
                  headings={["Pays", "Commandes", "CA net"]}
                  rows={countries.data.data.map((r: any) => [
                    r.country,
                    r.orderCount,
                    amount(r.netRevenue, currency),
                  ])}
                />
              )}
            </>
          )}
          {tab === "records" && (
            <>
              <form
                className="filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSearch(
                    String(new FormData(e.currentTarget).get("search") ?? ""),
                  );
                  setPage(1);
                }}
              >
                <label>
                  Rechercher
                  <input name="search" defaultValue={search} maxLength={200} />
                </label>
                <label>
                  Trier par
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      setPage(1);
                    }}
                  >
                    {[
                      ["invoiceDate", "Date"],
                      ["invoiceNumber", "Facture"],
                      ["productCode", "Produit"],
                      ["quantity", "Quantité"],
                      ["unitPrice", "Prix"],
                      ["country", "Pays"],
                    ].map(([v, l]) => (
                      <option value={v} key={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ordre
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                  >
                    <option value="desc">Décroissant</option>
                    <option value="asc">Croissant</option>
                  </select>
                </label>
                <button>Rechercher</button>
              </form>
              <Feedback loading={rows.loading} error={rows.error} />
              {rows.data && (
                <>
                  <Table
                    headings={[
                      "Facture",
                      "Produit",
                      "Description",
                      "Quantité",
                      "Date UTC",
                      "Prix",
                      "Client",
                      "Pays",
                    ]}
                    rows={rows.data.data.map((r: any) => [
                      r.invoiceNumber,
                      r.productCode,
                      r.description,
                      r.quantity,
                      new Date(r.invoiceDate)
                        .toISOString()
                        .slice(0, 16)
                        .replace("T", " "),
                      amount(r.unitPrice, currency),
                      r.customerId ?? "—",
                      r.country,
                    ])}
                  />
                  <Pager meta={rows.data.meta} onPage={setPage} />
                </>
              )}
              <details>
                <summary>Informations sur les colonnes</summary>
                {info.data && (
                  <Table
                    headings={["Colonne", "Type", "Nullable"]}
                    rows={info.data.data.columns.map((c: any) => [
                      c.key,
                      c.type,
                      c.nullable ? "Oui" : "Non",
                    ])}
                  />
                )}
              </details>
            </>
          )}
          {tab === "quality" && (
            <>
              <Feedback loading={quality.loading} error={quality.error} />
              {quality.data && (
                <>
                  <article className="note">
                    <h2>Score de qualité : {quality.data.data.score} / 100</h2>
                    <p>{quality.data.data.formula}</p>
                    <p>
                      Rapport sur tout le dataset. Les filtres ne modifient que
                      le compteur de lignes explorées :{" "}
                      {quality.data.data.filteredRecordCount}.
                    </p>
                  </article>
                  <Table
                    headings={[
                      "Lignes sources",
                      "Acceptées",
                      "Rejetées",
                      "Validité",
                      "Complétude",
                      "Unicité",
                    ]}
                    rows={[
                      [
                        quality.data.data.sourceRows,
                        quality.data.data.acceptedRows,
                        quality.data.data.rejectedRows,
                        quality.data.data.components.validity + " %",
                        quality.data.data.components.completeness + " %",
                        quality.data.data.components.uniqueness + " %",
                      ],
                    ]}
                  />
                  <h2>Valeurs manquantes parmi les lignes acceptées</h2>
                  <Table
                    headings={["Colonne", "Manquantes", "Lignes évaluées"]}
                    rows={quality.data.data.missingByColumn.map((m: any) => [
                      m.column,
                      m.missingCount,
                      m.evaluatedRows,
                    ])}
                  />
                  <p>
                    {quality.data.data.duplicateCandidates.count} candidats
                    doublons. {quality.data.data.duplicateCandidates.definition}
                  </p>
                  <p className="muted">
                    Les clients absents sont autorisés. Les rejets d’import ne
                    sont pas des lignes de vente acceptées.
                  </p>
                </>
              )}
            </>
          )}
          {tab === "outliers" && (
            <>
              <p>
                Méthode IQR : seuils Q1 − 1,5 × IQR et Q3 + 1,5 × IQR. Ventes et
                retours sont étudiés séparément. Moins de quatre lignes : aucun
                signalement. Aucune ligne n’est supprimée.
              </p>
              <Feedback loading={flags.loading} error={flags.error} />
              {flags.data && (
                <>
                  <Table
                    headings={[
                      "Facture",
                      "Produit",
                      "Ligne source",
                      "Champ",
                      "Valeur",
                      "Groupe",
                      "Seuil bas",
                      "Seuil haut",
                    ]}
                    rows={flags.data.data.map((r: any) => [
                      r.invoiceNumber,
                      r.productCode,
                      r.sourceRow,
                      r.field,
                      r.value,
                      r.partition,
                      r.lowerBound,
                      r.upperBound,
                    ])}
                  />
                  <Pager meta={flags.data.meta} onPage={setPage} />
                </>
              )}
            </>
          )}
          {tab === "comparison" && (
            <>
              <form className="panel" onSubmit={compareSubmit}>
                <h2>Référence à comparer</h2>
                <p>
                  Choisissez un autre dataset ou une période de référence. Les
                  devises doivent être identiques.
                </p>
                <label>
                  Autre dataset (facultatif)
                  <select name="compareDatasetId">
                    <option value="">Même dataset</option>
                    {datasets.data?.data
                      .filter((d: any) => d.id !== datasetId)
                      .map((d: any) => (
                        <option value={d.id} key={d.id}>
                          {d.title} ({d.currency})
                        </option>
                      ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label>
                    Du (UTC)
                    <input type="date" name="compareFrom" />
                  </label>
                  <label>
                    Au inclus (UTC)
                    <input type="date" name="compareTo" />
                  </label>
                </div>
                <button>Comparer</button>
              </form>
              <Feedback loading={compare.loading} error={compare.error} />
              {compare.data && (
                <>
                  <p>
                    <strong>Groupe courant :</strong>{" "}
                    {compare.data.data.currentLabel}
                  </p>
                  <p>
                    <strong>Référence :</strong>{" "}
                    {compare.data.data.previousLabel}
                  </p>
                  <Table
                    headings={[
                      "Indicateur",
                      "Courant",
                      "Référence",
                      "Écart",
                      "Variation",
                    ]}
                    rows={[
                      [
                        "CA net",
                        amount(compare.data.data.current.netRevenue, currency),
                        amount(compare.data.data.previous.netRevenue, currency),
                        amount(compare.data.data.netRevenueDelta, currency),
                        amount(compare.data.data.netRevenuePercent, "%"),
                      ],
                      [
                        "Commandes",
                        compare.data.data.current.orderCount,
                        compare.data.data.previous.orderCount,
                        compare.data.data.orderCountDelta,
                        amount(compare.data.data.orderCountPercent, "%"),
                      ],
                      [
                        "Panier moyen",
                        amount(
                          compare.data.data.current.averageOrderValue,
                          currency,
                        ),
                        amount(
                          compare.data.data.previous.averageOrderValue,
                          currency,
                        ),
                        amount(
                          compare.data.data.averageOrderValueDelta,
                          currency,
                        ),
                        amount(compare.data.data.averageOrderValuePercent, "%"),
                      ],
                    ]}
                  />
                  <p className="muted">
                    « — » signifie que la variation ne peut pas être calculée,
                    notamment si la référence vaut zéro.
                  </p>
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

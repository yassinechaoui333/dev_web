import { DatasetsPage, DatasetDetail } from "./features/datasets/DatasetsPage";
import { AnalyticsPage } from "./features/analytics/AnalyticsPage";
import {
  DashboardsPage,
  DashboardDetail,
} from "./features/dashboards/DashboardsPage";
import { Link } from "react-router-dom";
import React from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  Outlet,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { AuthPage } from "./features/auth/AuthPage";
import { ProfilePage } from "./features/auth/ProfilePage";
import { AdminPage } from "./features/admin/AdminPage";
import { LandingPage } from "./features/auth/LandingPage";
import { api } from "./shared/api";
import { useState } from "react";
import "./styles.css";
function Protected() {
  const { user, loading, error, refresh } = useAuth();
  if (loading)
    return (
      <main className="status" role="status">
        Loading your workspace…
      </main>
    );
  if (error)
    return (
      <main className="status">
        <p role="alert">{error}</p>
        <button onClick={() => void refresh()}>Retry</button>
      </main>
    );
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}
function AdminOnly() {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? (
    <Outlet />
  ) : (
    <section>
      <h1>Administrator access required</h1>
      <p>You do not have permission to open administration.</p>
      <NavLink to="/app">Return to overview</NavLink>
    </section>
  );
}
function Layout() {
  const { user, setUser } = useAuth(),
    [error, setError] = useState("");
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="app">
      <aside>
        <div className="brand">S / DQ</div>
        <p className="eyebrow">WORKSPACE</p>
        <nav>
          <NavLink to="/app" end>
            Overview
          </NavLink>
          <NavLink to="/app/datasets">Datasets</NavLink>
          <NavLink to="/app/analytics">Analyses</NavLink>
          <NavLink to="/app/dashboards">Dashboards</NavLink>
          <NavLink to="/app/profile">Profile & security</NavLink>
          {user?.role === "ADMIN" && (
            <NavLink to="/app/admin">Administration</NavLink>
          )}
        </nav>
        <div className="account">
          <strong>{user?.name}</strong>
          <small>{user?.role === "ADMIN" ? "Administrator" : "Member"}</small>
          <button className="secondary" onClick={() => void logout()}>
            Sign out
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
      <main className="content">
        <header>
          <span>Sales & Data Quality Platform</span>
          <span className="badge">MVP WORKSPACE</span>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
function Overview() {
  const { user } = useAuth();
  return (
    <>
      <p className="eyebrow">VOTRE ESPACE DE TRAVAIL</p>
      <h1>Bonjour, {user?.name.split(" ")[0]}.</h1>
      <p className="muted">
        Importez, explorez et partagez vos données de vente.
      </p>
      <div className="cards">
        {[
          [
            "01",
            "Importer un CSV",
            "Métadonnées, validation et rapport de rejet.",
            "/app/datasets",
          ],
          [
            "02",
            "Analyser les ventes",
            "Filtres, indicateurs, qualité et comparaison.",
            "/app/analytics",
          ],
          [
            "03",
            "Partager un dashboard",
            "Graphiques enregistrés et accès en lecture seule.",
            "/app/dashboards",
          ],
        ].map(([n, t, desc, url]) => (
          <article key={n}>
            <span className="step">{n}</span>
            <h2>{t}</h2>
            <p>{desc}</p>
            <Link to={url}>Ouvrir →</Link>
          </article>
        ))}
      </div>
      <article className="note">
        <h2>Démarrer simplement</h2>
        <p>
          Un exemple CSV fictif est disponible sur la page de chaque dataset.
          Les montants incluent les retours ; les utilisateurs ne voient que
          leurs datasets et les dashboards qui leur sont partagés.
        </p>
      </article>
    </>
  );
}
function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage register />} />
        <Route element={<Protected />}>
          <Route path="/app" element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="datasets" element={<DatasetsPage />} />
            <Route path="datasets/:datasetId" element={<DatasetDetail />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="dashboards" element={<DashboardsPage />} />
            <Route
              path="dashboards/:dashboardId"
              element={<DashboardDetail />}
            />
            <Route path="profile" element={<ProfilePage />} />
            <Route element={<AdminOnly />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>
            <Route
              path="*"
              element={
                <section>
                  <h1>Page not found</h1>
                  <NavLink to="/app">Return to overview</NavLink>
                </section>
              }
            />
          </Route>
        </Route>
        <Route
          path="*"
          element={
            <main className="status">
              <h1>Page not found</h1>
              <NavLink to="/">Return home</NavLink>
            </main>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
export function LandingPage() {
  const { user } = useAuth();
  return (
    <main className="landing">
      <div className="landing-nav">
        <div className="brand">
          S / DQ <span>Sales & Data Quality</span>
        </div>
        <Link to={user ? "/app" : "/login"}>
          {user ? "Open workspace" : "Sign in"} →
        </Link>
      </div>
      <section className="hero">
        <p className="eyebrow">FROM SALES DATA TO SHARED INSIGHT</p>
        <h1>
          Better data.
          <br />
          Clearer decisions.
        </h1>
        <p className="muted">
          A collaborative workspace to turn sales files into reliable analysis
          and dashboards your team can share.
        </p>
        <div className="actions">
          <Link className="button" to={user ? "/app" : "/register"}>
            {user ? "Go to workspace" : "Create your account"}
          </Link>
          <a href="#workflow">Explore the workflow ↓</a>
        </div>
      </section>
      <section id="workflow">
        <p className="eyebrow">ONE CONNECTED WORKFLOW</p>
        <div className="cards">
          {[
            [
              "01",
              "Centralize",
              "Bring CSV sales records into a shared structure.",
            ],
            [
              "02",
              "Understand",
              "Explore sales, assess quality and compare results.",
            ],
            [
              "03",
              "Share",
              "Save visual dashboards and give colleagues read access.",
            ],
          ].map(([n, t, desc]) => (
            <article key={n}>
              <span className="step">{n}</span>
              <h2>{t}</h2>
              <p>{desc}</p>
            </article>
          ))}
        </div>
        <p className="muted">
          CSV, exploration, qualité des données, dashboards enregistrés et
          partage en lecture seule.
        </p>
      </section>
      <footer>
        Sales & Data Quality Platform · A collaborative student project
      </footer>
    </main>
  );
}

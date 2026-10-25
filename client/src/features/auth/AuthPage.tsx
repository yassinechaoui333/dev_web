import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { api, type User } from "../../shared/api";
import { useAuth } from "./AuthContext";
export function AuthPage({ register = false }: { register?: boolean }) {
  const { user, setUser } = useAuth(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/app" replace />;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      setUser(
        (
          await api<{ data: User }>(
            "/auth/" + (register ? "register" : "login"),
            { method: "POST", body: JSON.stringify(values) },
          )
        ).data,
      );
      navigate("/app");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth">
      <div className="brand">
        S / DQ <span>Sales & Data Quality</span>
      </div>
      <p className="eyebrow">YOUR SALES, IN FOCUS</p>
      <h1>{register ? "Create your workspace account" : "Welcome back."}</h1>
      <p className="muted">
        One workspace for reliable data and clearer decisions.
      </p>
      <form onSubmit={submit}>
        {params.has("passwordChanged") && (
          <p className="success" role="status">
            Password changed. Please sign in again.
          </p>
        )}
        {register && (
          <label>
            Full name
            <input name="name" autoComplete="name" required maxLength={100} />
          </label>
        )}
        <label>
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            minLength={register ? 12 : 1}
            maxLength={128}
            required
          />
        </label>
        {register && <small>Use at least 12 characters.</small>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button disabled={busy}>
          {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
        </button>
      </form>
      <p>
        {register ? "Already registered?" : "New to the platform?"}{" "}
        <Link to={register ? "/login" : "/register"}>
          {register ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </main>
  );
}

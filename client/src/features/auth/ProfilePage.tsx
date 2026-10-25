import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../../shared/api";
import { useAuth } from "./AuthContext";
export function ProfilePage() {
  const { user, setUser } = useAuth(),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setSuccess("");
    const fields = Object.fromEntries(new FormData(form));
    if (!fields.currentPassword) delete fields.currentPassword;
    try {
      setUser(
        (
          await api<{ data: User }>("/auth/profile", {
            method: "PATCH",
            body: JSON.stringify(fields),
          })
        ).data,
      );
      setSuccess("Profile saved.");
      (form.elements.namedItem("currentPassword") as HTMLInputElement).value =
        "";
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (fields.newPassword !== fields.confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    delete fields.confirmPassword;
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      setUser(null);
      navigate("/login?passwordChanged=1", { replace: true });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>Profile & security</h1>
      <p className="muted">Manage your details and keep your account secure.</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="success" role="status">
          {success}
        </p>
      )}
      <form className="panel" onSubmit={saveProfile}>
        <h2>Personal details</h2>
        <label>
          Full name
          <input
            name="name"
            defaultValue={user?.name}
            autoComplete="name"
            required
            maxLength={100}
          />
        </label>
        <label>
          Email address
          <input
            name="email"
            type="email"
            defaultValue={user?.email}
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          Current password <small>Required when changing your email</small>
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={128}
          />
        </label>
        <p className="muted">Email changes sign out your other sessions.</p>
        <button disabled={busy}>Save profile</button>
      </form>
      <form className="panel" onSubmit={changePassword}>
        <h2>Change password</h2>
        <p className="muted">
          After changing your password, sign in again on each device.
        </p>
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <button disabled={busy}>Update password</button>
      </form>
    </>
  );
}

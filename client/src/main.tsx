import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, NavLink, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { AuthPage } from './features/auth/AuthPage';
import { LandingPage } from './features/auth/LandingPage';
import { api } from './shared/api';
import { useState } from 'react';
import './styles.css';
function Protected() {
  const { user, loading, error, refresh } = useAuth();
  if (loading) return <main className="status" role="status">Loading your workspace…</main>;
  if (error) return <main className="status"><p role="alert">{error}</p><button onClick={() => void refresh()}>Retry</button></main>;
  return user ? <Outlet/> : <Navigate to="/login" replace/>;
}
function Layout() {
  const { user, setUser } = useAuth(), [error, setError] = useState('');
  async function logout() { try { await api('/auth/logout', { method: 'POST' }); setUser(null); } catch (e) { setError((e as Error).message); } }
  return <div className="app"><aside><div className="brand">S / DQ</div><p className="eyebrow">WORKSPACE</p><nav><NavLink to="/app" end>Overview</NavLink></nav><div className="account"><strong>{user?.name}</strong><small>{user?.role === 'ADMIN' ? 'Administrator' : 'Member'}</small><button className="secondary" onClick={() => void logout()}>Sign out</button>{error && <p role="alert">{error}</p>}</div></aside><main className="content"><header><span>Sales & Data Quality Platform</span><span className="badge">MVP WORKSPACE</span></header><Outlet/></main></div>;
}
function Overview() {
  const { user } = useAuth();
  return <><p className="eyebrow">A CLEARER VIEW</p><h1>Hello, {user?.name.split(' ')[0]}.</h1><p className="muted">Your team’s foundation for trusted sales insights.</p><div className="cards">{[['01', 'Import datasets', 'Ahmed', 'CSV upload and import tracking'], ['02', 'Explore & analyze', 'Taha', 'Quality scoring and sales exploration'], ['03', 'Build dashboards', 'Abdelali', 'Charts, saved views and sharing']].map(([n,t,o,d]) => <article key={n}><span className="step">{n}</span><h2>{t}</h2><p>{d}</p><span className="badge">Planned · {o}</span></article>)}</div><article className="note"><h2>Ready for collaboration</h2><p>Your account and workspace are ready. Feature modules will appear here after integration.</p></article></>;
}
function App() { return <AuthProvider><Routes><Route path="/" element={<LandingPage/>}/><Route path="/login" element={<AuthPage/>}/><Route path="/register" element={<AuthPage register/>}/><Route element={<Protected/>}><Route path="/app" element={<Layout/>}><Route index element={<Overview/>}/><Route path="*" element={<section><h1>Page not found</h1><NavLink to="/app">Return to overview</NavLink></section>}/></Route></Route><Route path="*" element={<main className="status"><h1>Page not found</h1><NavLink to="/">Return home</NavLink></main>}/></Routes></AuthProvider>; }
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>);

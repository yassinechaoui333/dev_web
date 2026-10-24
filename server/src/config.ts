import dotenv from 'dotenv';
dotenv.config({ path: '../.env', quiet: true });
dotenv.config({ quiet: true });
const production = process.env.NODE_ENV === 'production';
const sessionHours = Number(process.env.SESSION_HOURS ?? 24);
if (!Number.isFinite(sessionHours) || sessionHours < 1 || sessionHours > 168) throw new Error('SESSION_HOURS must be 1..168');
export const config = {
  production, host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3001),
  origin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  sessionMs: sessionHours * 60 * 60 * 1000,
  cookieName: production ? '__Host-sdq_session' : 'sdq_session',
};
if (production && !config.origin.startsWith('https://')) throw new Error('Production APP_ORIGIN requires HTTPS');

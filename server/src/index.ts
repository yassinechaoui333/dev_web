import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
const server = app.listen(config.port, () => console.log('API listening on http://localhost:' + config.port));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => { void db.$disconnect().then(() => process.exit(0)); });
});

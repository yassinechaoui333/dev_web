import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { recoverImportJobs } from './modules/datasets/worker.js';
const server = app.listen(config.port, config.host, () => console.log('API listening on http://localhost:' + config.port));
// Resume CSV imports that were pending or interrupted by a restart.
recoverImportJobs().catch(error => console.error({ error }));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  server.close(() => { void db.$disconnect().then(() => process.exit(0)); });
});

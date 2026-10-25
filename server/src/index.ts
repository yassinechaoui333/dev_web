import { startImportWorker } from "./modules/datasets/worker.js";
import { app } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
const stopWorker = startImportWorker();
const server = app.listen(config.port, config.host, () =>
  console.log("API listening on http://localhost:" + config.port),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopWorker();
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });

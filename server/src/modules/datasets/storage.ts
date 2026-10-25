import { mkdir, readFile, readdir, rename, rm, stat, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Original CSV bytes are retained for pending/failed jobs so a retry reuses the
// same source. Files live outside any public directory and are named by job ID.
// Default: server/storage/imports (resolves the same from src/ and dist/).
const directory = process.env.IMPORT_STORAGE_DIR
  ? path.resolve(process.env.IMPORT_STORAGE_DIR)
  : fileURLToPath(new URL('../../../storage/imports', import.meta.url));
const fileFor = (jobId: string) => path.join(directory, jobId + '.csv');

async function ensureDirectory() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  // Self-ignoring directory: uploaded files can never be committed.
  await writeFile(path.join(directory, '.gitignore'), '*\n', { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
}

export async function saveSource(jobId: string, bytes: Buffer) {
  await ensureDirectory();
  const temporary = fileFor(jobId) + '.part';
  await writeFile(temporary, bytes, { mode: 0o600, flush: true });
  await rename(temporary, fileFor(jobId));
}
export const readSource = (jobId: string) => readFile(fileFor(jobId));
export const hasSource = (jobId: string) => access(fileFor(jobId)).then(() => true, () => false);
export const removeSource = (jobId: string) => rm(fileFor(jobId), { force: true });
// Retained files with their age, for the startup sweep of orphans.
export async function listSources() {
  const names = await readdir(directory).catch(e => { if (e.code === 'ENOENT') return [] as string[]; throw e; });
  return Promise.all(names.filter(n => n.endsWith('.csv')).map(async n => ({ jobId: n.slice(0, -4), modifiedMs: (await stat(path.join(directory, n))).mtimeMs })));
}

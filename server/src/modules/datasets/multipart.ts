import path from 'node:path';
import { ApiError } from '../../shared/errors.js';
// Minimal multipart/form-data reader for the single "file" field required by
// the upload contract. The body is already size-limited by express.raw.
export function readCsvUpload(body: unknown, contentType: string | undefined) {
  const boundary = /^multipart\/form-data;.*\bboundary=(?:"([^"]+)"|([^\s;]+))/i.exec(contentType ?? '');
  if (!boundary || !Buffer.isBuffer(body)) throw new ApiError(400, 'INVALID_UPLOAD', 'Upload a CSV file as multipart/form-data in the "file" field');
  const delimiter = Buffer.from('--' + (boundary[1] ?? boundary[2]));
  const parts: { name?: string; filename?: string; content: Buffer }[] = [];
  let start = body.indexOf(delimiter);
  while (start !== -1) {
    const afterDelimiter = start + delimiter.length;
    if (body.subarray(afterDelimiter, afterDelimiter + 2).toString() === '--') break;
    const headerEnd = body.indexOf('\r\n\r\n', afterDelimiter);
    const next = body.indexOf(Buffer.concat([Buffer.from('\r\n'), delimiter]), headerEnd);
    if (headerEnd === -1 || next === -1) throw new ApiError(400, 'INVALID_UPLOAD', 'Malformed multipart body');
    const headers = body.subarray(afterDelimiter + 2, headerEnd).toString('utf8');
    const disposition = /^content-disposition:\s*form-data(.*)$/im.exec(headers)?.[1] ?? '';
    parts.push({
      name: /;\s*name="([^"]*)"/i.exec(disposition)?.[1],
      filename: /;\s*filename="([^"]*)"/i.exec(disposition)?.[1],
      content: body.subarray(headerEnd + 4, next),
    });
    start = next + 2;
  }
  if (parts.length !== 1 || parts[0].name !== 'file' || parts[0].filename === undefined) {
    throw new ApiError(400, 'INVALID_UPLOAD', 'Send exactly one field named "file" containing the CSV');
  }
  // Keep only a display name; the stored file is addressed by job ID, never by this name.
  const filename = path.basename(parts[0].filename.replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255);
  if (!filename.toLowerCase().endsWith('.csv')) throw new ApiError(400, 'UNSUPPORTED_FILE', 'Only .csv files are accepted');
  return { filename, content: parts[0].content };
}

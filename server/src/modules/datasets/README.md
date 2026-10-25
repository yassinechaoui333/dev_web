# Datasets and CSV import (Ahmed)

Implements the dataset endpoints in /docs/api-contract.yaml and the import rules in /docs/data-contract.md. Client UI: client/src/features/datasets (route /app/datasets).

| File | Purpose |
|---|---|
| router.ts | REST endpoints under /api/datasets: dataset CRUD, uploads, import history/progress, rejections, retry, raw records |
| multipart.ts | Reads the single multipart field `file` (no extra dependency) |
| csv.ts | RFC 4180 parser; structural limits and header checks |
| normalize.ts | Row validation and normalization into SalesRecord values |
| worker.ts | In-process import queue, atomic publish, restart recovery |
| storage.ts | Retained original CSV files for pending/failed jobs |

## Pipeline
1. `POST /imports` authenticates and checks dataset ownership **before** reading the body (10 MiB limit). It computes SHA-256 of the original bytes and returns 409 `DUPLICATE_IMPORT` (existing job ID in the message) when that dataset already has the hash. Otherwise it writes the file to storage, creates the `pending` job and returns 202. A concurrent identical upload loses the unique(datasetId, contentHash) race and also gets 409.
2. The worker claims the job (`pending → processing`, status-guarded), decodes UTF-8 and parses the file, then validates every row.
3. One database transaction removes earlier staging rows for the job, inserts all RawRecords (accepted and rejected) and the SalesRecords for accepted rows, and marks the job `completed` with its counters. Nothing is visible until the commit. Any error rolls back the transaction and marks the job `failed`.
4. A completed job deletes its retained file. A failed job keeps it. `POST /retry` (failed jobs only) resets the same job ID to `pending`, increments retryCount and deletes staging rows in one transaction, then requeues it.
5. On startup, `recoverImportJobs()` (called from server/src/index.ts) requeues `pending` jobs and any left `processing` by a restart. It also removes stored files older than one hour that no longer belong to a pending, processing or failed job; these are left by a crash between storing a file and creating its job, or after a completed commit.

Dataset deletion locks the dataset row, then cascades jobs, raw/clean rows, dashboards and shares, then removes retained files. A concurrent upload waits for the lock and then gets 404, so its file is cleaned up too. An unexpected worker error marks the job `failed` (retryable) and never leaves it `processing`. Validation yields to the event loop every 1,000 rows, so other requests keep being served during large imports.

## File-level failures (job `failed`, `error` explains)
Invalid UTF-8; NUL characters (PostgreSQL cannot store them); unterminated or misplaced quotes; a line with more than 1,000 columns; missing or duplicate headers (case-sensitive, BOM stripped); more than 100,000 data records; any field over 64 KiB. Empty files, non-`.csv` names, files over 10 MiB and malformed multipart bodies are refused at upload (400/413), so no job is created.

## Row-level validation (RawRecord.validationErrors)
Each error is `{ field, code, message }`. `field` is the CSV column name, or `row` for whole-row problems. A row is accepted only when it has no errors. All errors of a row are reported, not just the first.

| code | meaning |
|---|---|
| REQUIRED | InvoiceNo, StockCode, Description, Quantity, InvoiceDate, UnitPrice or Country is blank after trimming |
| INVALID_NUMBER | Quantity/UnitPrice is not a plain decimal (`12`, `-3.25`; no exponents, separators or `.5`) |
| TOO_MANY_DECIMALS | more than 4 significant fraction digits (trailing zeros such as `2.50000` are accepted) |
| OUT_OF_RANGE | more than 14 integer digits (decimal(18,4)) |
| NEGATIVE_PRICE | UnitPrice < 0 |
| INVALID_DATE | wrong format for the dataset's dateFormat, impossible calendar date/time, or offset beyond ±14:00 |
| NONEXISTENT_LOCAL_TIME / AMBIGUOUS_LOCAL_TIME | local time without an offset falls in a DST gap/overlap of the dataset timezone |
| COLUMN_COUNT | row has a different number of cells from the header |
| EMPTY_ROW | blank line inside the file |

Normalization: identifiers, description and country are trimmed, with case and leading zeros kept. A blank CustomerID becomes null. An invoice starting with `C`/`c` sets isCancellation and quantity = -abs(quantity). Other negative quantities are returns. Zero quantity/price is accepted (Taha flags it for quality review). RawRecord.values keeps the original untrimmed strings under the original column names. Extra columns are kept, and surplus cells in a malformed row are stored as `__column_N`. Identical lines are never deduplicated.

Dataset timezone must be `UTC` or a canonical IANA name (e.g. `Europe/London`). Offsets such as `+01:00` and lowercase aliases are rejected because PostgreSQL reads POSIX offsets with the opposite sign.

Dates: ISO8601 datasets accept `YYYY-MM-DDTHH:mm[:ss[.SSS]][Z|±HH:MM]` (a space instead of `T` is also accepted). DMY_HM datasets accept exactly `dd/MM/yyyy HH:mm` (zero-padded, as in the contract). An unpadded value such as `12/1/2010 8:26` is rejected rather than guessed, because M/D exports would otherwise import silently with day and month swapped. Timestamps without an offset use the dataset timezone.

## Fixture
`fixtures/sample-sales.csv` (fictional) imports with **totalRows 12, acceptedRows 7, rejectedRows 5**. Rejected source rows: 8 Quantity INVALID_NUMBER, 9 InvoiceDate INVALID_DATE, 10 UnitPrice NEGATIVE_PRICE, 11 InvoiceNo REQUIRED, 12 Quantity TOO_MANY_DECIMALS. Accepted rows include a quoted comma, escaped quotes, a multiline description (row 7), a +01:00 offset, a cancellation (`C1003`, stored quantity -2), a return (-1), a zero price, a blank CustomerID and an exact duplicate line (rows 2 and 13, both kept). For reference, with the data-contract formulas: netRevenue 54.25, grossSales 68.50, returnsAmount 14.25, orderCount 3, averageOrderValue 18.08.

## Assumptions and limits
- The worker runs inside the API process, one job at a time. Restart recovery assumes a **single API instance**, the same assumption as the in-memory rate limiter. Running several instances needs a shared queue/lease.
- Files are stored in `server/storage/imports` (self-ignored by git, mode 0600). Set `IMPORT_STORAGE_DIR` to override. Production needs persistent private storage.
- Each import is parsed in memory, which is fine within the 10 MiB / 100,000-row limits.
- Raw records and rejection reports only show data from completed jobs, matching the "completed jobs only" read rule.

# Contract history

## v1 — foundation published on 24 October 2026
Aligned the uncommitted draft with the supplied full-stack brief and team responsibilities: title/description/category/source metadata; per-dataset file hashes and retry counters; explorer moved under Taha's analytics namespace; shared order/AOV/aggregate/quality/comparison responses; dashboard title/layout and KPI metrics. No teammate implementation or previously published contract was overwritten. Any changes after foundation-v1 require coordination with Yassine and an explicit migration/version note.

## v1.1 — completed MVP, 25 October 2026
Explicitly authorized by Yassine in the current chat. All previously reserved module operations are implemented without replacing the foundation. Additive migration creates private ImportSource bytes for durable retries. Dashboard sharing accepts userId or exact registered email (exclusive); share listings can include recipient details. Dashboard data adds currency/timezone metadata. Outlier responses add invoice/product/source-row labels. Layouts are bounded and cannot overlap. The UI labels date filters as UTC rather than guessing local time. DB_PORT makes Docker startup possible when 5432 is occupied. These changes are documented together with the implementation; no applied migration was rewritten.

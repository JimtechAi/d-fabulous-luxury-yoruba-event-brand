# LEGACY derived-schema install (SUPERSEDED, DO NOT RUN)

These files were generated from `supabase/staging/manifest.json` before the verified production export existed. They install a **derived** schema that differs from
production in 227 places (see `supabase/staging/reports/staging_compatibility_matrix.md`) and would regress production's security if run after a production-schema restore.

They are kept only as historical evidence and for the conflict tests in `tests/db-staging-baseline.test.mjs`.

The current staging package is `supabase/staging/install/` (Stage 4), with rollbacks in `supabase/staging/rollback/`.

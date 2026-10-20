-- Lock Supabase's Data API out of our tables (Security Advisor, CRITICAL:
-- "RLS Disabled in Public"). The app talks to Postgres directly as the
-- tables' owner, and RLS doesn't apply to a table's owner (no FORCE), so the
-- app keeps full access. The Data API roles (anon, authenticated) get
-- nothing: RLS with no policies denies every row, and their privileges on
-- tables, sequences and functions, now and in the future, are revoked.
--
-- Safe to run more than once (e.g. again in Supabase's SQL editor). Where
-- the Data API roles don't exist (PGlite in development and CI), only the
-- RLS part applies. New tables must enable RLS in their own migration:
-- src/lib/db/rls.test.ts fails CI otherwise.
DO $$
DECLARE
  t regclass;
  r text;
BEGIN
  FOR t IN
    SELECT c.oid::regclass
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      -- Future objects created by this role (the one running migrations).
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END
$$;

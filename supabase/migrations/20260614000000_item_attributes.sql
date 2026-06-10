-- Planner — optimization attributes on events + tasks.
-- Energy / flexibility / focus / satisfaction (plus future keys) live in one
-- jsonb bag instead of dedicated columns, so adding a key later is a
-- schema-registry change (lib/attributes/schema.ts), not a migration. Reads go
-- through a lenient zod parse that preserves unknown keys, so older clients
-- never destroy newer keys. A GIN index is deliberately deferred — every
-- consumer reads whole rows; nothing filters on attributes yet.

alter table events add column attributes jsonb not null default '{}'::jsonb;
alter table tasks add column attributes jsonb not null default '{}'::jsonb;

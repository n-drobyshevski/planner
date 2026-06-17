-- Tasks are private to their owner by default. Flip the column default and
-- backfill existing rows so previously-shared tasks become private too.
alter table tasks alter column is_private set default true;
update tasks set is_private = true where is_private = false;

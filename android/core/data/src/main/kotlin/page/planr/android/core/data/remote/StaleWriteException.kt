package page.planr.android.core.data.remote

/**
 * The row changed elsewhere since it was read: the `updated_at` guard matched
 * nothing. Mirrors `StaleWriteError` in lib/supabase/mutations.ts — callers
 * reload the latest version and tell the user.
 */
class StaleWriteException(
    val table: String,
    val id: String,
    message: String = "This ${if (table == SupabaseTables.TASKS) "task" else "event"} was changed elsewhere. Reloaded the latest version.",
) : Exception(message)

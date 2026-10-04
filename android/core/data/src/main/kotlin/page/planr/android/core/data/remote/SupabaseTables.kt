package page.planr.android.core.data.remote

/**
 * Table names the app reads and writes, matching supabase/migrations and the
 * web's lib/supabase/{queries,mutations,realtime}.ts.
 */
object SupabaseTables {
    const val WORKSPACES = "workspaces"
    const val MEMBERS = "members"
    const val CATEGORIES = "categories"
    const val EVENTS = "events"
    const val EVENT_OVERRIDES = "event_overrides"
    const val TASKS = "tasks"
    const val COLLECTIONS = "collections"
    const val BOARDS = "boards"
}

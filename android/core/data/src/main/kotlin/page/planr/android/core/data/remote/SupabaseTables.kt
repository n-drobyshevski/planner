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
    const val TASK_CHECKPOINTS = "task_checkpoints"
    const val TASK_DEPENDENCIES = "task_dependencies"
    const val COLLECTIONS = "collections"
    const val BOARDS = "boards"
    const val MEMBER_APP_PREFS = "member_app_prefs"
    const val SLEEP_LOGS = "sleep_logs"
    const val MEMBER_SLEEP_PREFS = "member_sleep_prefs"
}

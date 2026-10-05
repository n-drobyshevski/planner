package page.planr.android.navigation

import android.net.Uri

/** Navigation routes. Detail routes take the row id as a path argument. */
object PlanrRoutes {
    const val SIGN_IN = "signin"
    const val AGENDA = "agenda"
    const val TASKS = "tasks"
    const val INSIGHTS = "insights"

    const val ARG_ID = "id"
    const val EVENT = "event/{$ARG_ID}"
    const val TASK = "task/{$ARG_ID}"

    fun event(id: String): String = "event/${Uri.encode(id)}"

    fun task(id: String): String = "task/${Uri.encode(id)}"
}

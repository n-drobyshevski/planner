package page.planr.android.core.data.model

import kotlinx.serialization.json.JsonObject
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.EventOverride
import page.planr.android.core.model.Member
import page.planr.android.core.model.PlannerEvent

/** The workspace-level reference data (`WorkspaceBundle` in queries.ts, v1 subset). */
data class WorkspaceBundle(
    val workspaceId: String,
    val workspaceName: String,
    val members: List<Member>,
    val categories: List<Category>,
    val boards: List<Board>,
)

/** Events (+ their overrides) that could intersect a window (`WindowData`). */
data class WindowData(
    val events: List<PlannerEvent>,
    val overrides: List<EventOverride>,
)

/**
 * Raw rows captured before `deleteEventDeep`, so the delete can be undone by
 * re-inserting them verbatim (`DeletedSnapshot`, event part).
 */
data class DeletedEventSnapshot(
    val events: List<JsonObject>,
    val overrides: List<JsonObject>,
)

/**
 * What [applyOverride] replaced: the prior override row for that occurrence,
 * or null when there was none (undo then deletes the override).
 */
data class OverridePrior(val row: JsonObject?)

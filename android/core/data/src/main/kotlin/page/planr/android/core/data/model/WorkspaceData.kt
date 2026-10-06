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
 * A task's own row, captured before it was deleted, so the delete can be
 * undone by re-inserting it verbatim (`DeletedSnapshot`, task part, for a
 * task without subtasks or calendar blocks: those rows are not in it). The
 * task's flow checkpoints and its dependency edges (either end), which the
 * DB cascades away with it, are captured too.
 */
data class DeletedTaskSnapshot(
    val tasks: List<JsonObject>,
    val checkpoints: List<JsonObject> = emptyList(),
    val dependencies: List<JsonObject> = emptyList(),
)

/**
 * What [applyOverride] replaced for that occurrence, the undo token for
 * `revertOverride`:
 * - [Known]: the prior override row (undo restores it)
 * - [None]: there was no override (undo deletes the new one)
 * - [Unknown]: the prior couldn't be read. Undo isn't possible: deleting
 *   could erase an earlier override, so callers offer none ([canRevert]).
 */
sealed interface OverridePrior {
    data class Known(val row: JsonObject) : OverridePrior
    data object None : OverridePrior
    data object Unknown : OverridePrior

    val canRevert: Boolean get() = this !is Unknown
}

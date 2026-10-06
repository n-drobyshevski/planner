package page.planr.android.feature.tasks.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.datetime.LocalDate
import kotlinx.datetime.LocalTime
import kotlinx.datetime.TimeZone
import kotlinx.datetime.atTime
import kotlinx.datetime.toInstant
import page.planr.android.core.data.attributes.AttributeKey
import page.planr.android.core.data.attributes.AttributesMerge
import page.planr.android.core.data.remote.StaleWriteException
import page.planr.android.core.model.Board
import page.planr.android.core.model.Category
import page.planr.android.core.model.Member
import page.planr.android.core.model.PlannerEvent
import page.planr.android.core.model.Task
import page.planr.android.core.model.TaskCompletion
import page.planr.android.core.model.TaskPriority
import page.planr.android.feature.tasks.data.TasksDataSource
import page.planr.android.feature.tasks.model.BlockSlots
import page.planr.android.feature.tasks.model.MAX_DEPTH
import page.planr.android.feature.tasks.model.SubtaskProgress
import page.planr.android.feature.tasks.model.TaskForm
import page.planr.android.feature.tasks.model.TaskOrder
import page.planr.android.feature.tasks.model.depthOf
import page.planr.android.feature.tasks.model.descendantIds
import page.planr.android.feature.tasks.model.isEmpty
import page.planr.android.feature.tasks.model.isOverdue
import page.planr.android.feature.tasks.model.progressDeep
import page.planr.android.feature.tasks.model.sequentiallyBlockedIds
import page.planr.android.feature.tasks.model.today
import page.planr.android.feature.tasks.model.viewerZone

enum class TaskDetailNotice { Stale, Failed, TitleRequired }

/** A direct subtask's row in the detail. */
data class SubtaskItem(
    val task: Task,
    /** Optimistic while a completion write is in flight. */
    val done: Boolean,
    /**
     * The checkbox works: the viewer owns the subtask, its collection has a
     * board to move it to ([TaskCompletion]) and it isn't [blocked].
     */
    val canToggle: Boolean,
    /** Under a sequential parent, waiting on an earlier sibling. */
    val blocked: Boolean,
    /** A completion write is in flight (the checkbox is disabled). */
    val pending: Boolean,
)

data class TaskDetailUiState(
    val loading: Boolean = true,
    /** Null once loaded means the task is gone (deleted, or hidden by RLS). */
    val task: Task? = null,
    /** The editable copy; equal to the stored task until the user changes something. */
    val form: TaskForm? = null,
    val canEdit: Boolean = false,
    val owner: Member? = null,
    val members: List<Member> = emptyList(),
    /** Contexts the task can be filed under: shared ones and the owner's own. */
    val categories: List<Category> = emptyList(),
    /** The task's collection columns, ordered; empty for a task outside any collection. */
    val boards: List<Board> = emptyList(),
    val parent: Task? = null,
    /** Direct subtasks, in order. */
    val subtasks: List<SubtaskItem> = emptyList(),
    /**
     * The inline "Add a subtask" field is offered: the owner's task, above
     * the deepest level ([MAX_DEPTH]), which the database would refuse.
     */
    val canAddSubtask: Boolean = false,
    /** The inline "Add a subtask" field. */
    val subtaskTitle: String = "",
    val addingSubtask: Boolean = false,
    /** Whole-subtree progress, as on the card. */
    val progress: SubtaskProgress? = null,
    val overdue: Boolean = false,
    val dirty: Boolean = false,
    val saving: Boolean = false,
    /** Set after a successful save; the screen navigates back. */
    val saved: Boolean = false,
    /** A delete (or its pre-check) is in flight. */
    val deleting: Boolean = false,
    /** The delete would cascade: the confirm dialog's facts. */
    val confirmDelete: DeletePlan.Confirm? = null,
    /** Set after a delete; the screen navigates back. */
    val deleted: Boolean = false,
    val notice: TaskDetailNotice? = null,
    /** The zone the member's calendar is read and written in. */
    val zone: TimeZone = TimeZone.UTC,
    /** The task's calendar blocks: upcoming first, then past. */
    val blocks: List<TaskBlockItem> = emptyList(),
    /** "Add to calendar" is offered (owner only, like every other write here). */
    val canSchedule: Boolean = false,
    /** The open "Add to calendar" sheet. */
    val blockSheet: BlockSheetState? = null,
    /** The latest block write, for the snackbar's Undo. */
    val blockNotice: BlockNotice? = null,
    /**
     * A block is being created, removed or put back. Its own write: the form
     * isn't dirty, but the screen holds Back, Save and Delete until it lands.
     */
    val blockWriting: Boolean = false,
    /**
     * A subtask is being added, checked off or put back (Undo). Its own
     * write, like a block's: the screen holds Back and Save until it lands.
     */
    val subtaskWriting: Boolean = false,
) {
    /** A write is in flight that leaving now would cancel half-way. */
    val holdsBack: Boolean get() = saving || deleting || blockWriting || subtaskWriting

    /** Something typed would be lost by leaving: an unsaved edit, or an unsent subtask title. */
    val hasDraft: Boolean get() = dirty || (canAddSubtask && subtaskTitle.isNotBlank())
}

/**
 * One task: its details, the editor form and the save (`updateTask` with the
 * stale-write guard), its subtasks (complete / reopen, add), its calendar
 * blocks (add, remove, with Undo) and delete.
 */
@HiltViewModel(assistedFactory = TaskDetailViewModel.Factory::class)
class TaskDetailViewModel @AssistedInject constructor(
    @Assisted private val taskId: String,
    private val data: TasksDataSource,
    private val clock: Clock,
    private val deletions: TaskDeletions,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(taskId: String): TaskDetailViewModel
    }

    /** The user's edits; null = untouched, so the form follows the stored row. */
    private val edits = MutableStateFlow<TaskForm?>(null)
    private val ui = MutableStateFlow(UiFlags())

    /** Optimistic subtask completion by id while a write is in flight. */
    private val pending = MutableStateFlow<Map<String, Boolean>>(emptyMap())

    private val blockUi = MutableStateFlow(BlockFlags())

    /** The running "next free slot" lookup for the sheet. */
    private var suggestion: Job? = null

    private val workspace = combine(
        data.observeTasks(),
        data.observeMembers(),
        data.observeCategories(),
        data.observeBoards(),
        data.currentMemberId,
    ) { tasks, members, categories, boards, viewerId -> Snapshot(tasks, members, categories, boards, viewerId) }

    /** The latest rows, for actions that need more than the rendered state. */
    @Volatile
    private var latest: Snapshot? = null

    private val blockRows = combine(data.observeTaskBlocks(taskId), blockUi, ::Pair)

    val state: StateFlow<TaskDetailUiState> =
        combine(workspace, edits, ui, pending, blockRows) { snapshot, edits, flags, pending, (blocks, blockFlags) ->
            latest = snapshot
            render(snapshot, edits, flags, pending).withBlocks(snapshot, blocks, blockFlags)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), TaskDetailUiState())

    init {
        // The cache only holds the windows the agenda synced; fetch the rest.
        // Offline, the cached blocks are what there is.
        viewModelScope.launch {
            try {
                data.refreshTaskBlocks(taskId)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
    }

    /** Tasks deleted from another detail (a subtask's), for this screen's "Deleted · Undo". */
    val deletedTasks: Flow<TaskDeleted> = deletions.claims(except = taskId)

    fun setTitle(value: String) = edit { it.copy(title = value) }

    fun setNotes(value: String) = edit { it.copy(notes = value) }

    fun setBoard(board: Board) = edit { it.withBoard(board) }

    fun setDueDate(date: LocalDate?) = edit { it.copy(dueDate = date) }

    fun setPriority(priority: TaskPriority) = edit { it.copy(priority = priority) }

    fun setAssignee(memberId: String?) = edit { it.copy(assigneeId = memberId) }

    fun setCategory(categoryId: String?) = edit { it.copy(categoryId = categoryId) }

    /** Sets an optimization attribute, or clears it with a null [option]. */
    fun setAttribute(key: AttributeKey, option: String?) =
        edit { it.copy(attributes = AttributesMerge.select(it.attributes, key, option)) }

    fun dismissNotice() = ui.update { it.copy(notice = null) }

    fun setSubtaskTitle(value: String) = ui.update { it.copy(subtaskTitle = value) }

    /**
     * A subtask's checkbox: the same completion as the list's (`setDone`, a
     * board move). Under a sequential parent only the next open subtask can
     * be completed.
     */
    fun toggleSubtask(id: String) {
        val item = state.value.subtasks.firstOrNull { it.task.id == id } ?: return
        if (!item.canToggle || item.pending) return
        val done = !item.done
        pending.update { it + (id to done) }
        viewModelScope.launch {
            try {
                data.setDone(item.task, done)
            } catch (e: CancellationException) {
                throw e
            } catch (_: StaleWriteException) {
                ui.update { it.copy(notice = TaskDetailNotice.Stale) }
            } catch (_: Exception) {
                ui.update { it.copy(notice = TaskDetailNotice.Failed) }
            } finally {
                pending.update { it - id }
            }
        }
    }

    /** The inline field's Done: creates a subtask filed like this task. */
    fun addSubtask() {
        val current = state.value
        val parent = current.task ?: return
        val sent = current.subtaskTitle
        if (!current.canAddSubtask || current.addingSubtask || current.deleting || sent.isBlank()) return
        val draft = subtaskDraft(parent, sent, latest?.boards.orEmpty(), clock.now())
        ui.update { it.copy(addingSubtask = true) }
        viewModelScope.launch {
            try {
                data.createTask(draft)
                // Cleared for the next one, unless it was edited meanwhile.
                ui.update { it.copy(addingSubtask = false, subtaskTitle = if (it.subtaskTitle == sent) "" else it.subtaskTitle) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(addingSubtask = false, notice = TaskDetailNotice.Failed) }
            }
        }
    }

    /**
     * Delete from the top bar. A task nothing else would go with is deleted
     * at once, and the screen it returns to offers Undo; one with subtasks
     * or calendar blocks asks first ([TaskDetailUiState.confirmDelete]).
     */
    fun delete() {
        val current = state.value
        val task = current.task ?: return
        // Not while a subtask is being added or put back: the plan would miss
        // it, and the cascade would take it with no Undo.
        if (!current.canEdit || current.saving || current.deleting || current.subtaskWriting || current.blockWriting) return
        val subtree = descendantIds(task.id, latest?.tasks.orEmpty().groupBy { it.parentId })
        ui.update { it.copy(deleting = true, notice = null) }
        viewModelScope.launch {
            try {
                val hasBlocks = data.hasCalendarBlocks(listOf(task.id) + subtree)
                when (val plan = deletePlan(subtree.size, hasBlocks)) {
                    DeletePlan.Immediate -> performDelete(task.id, undoable = true)
                    is DeletePlan.Confirm -> ui.update { it.copy(deleting = false, confirmDelete = plan) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(deleting = false, notice = TaskDetailNotice.Failed) }
            }
        }
    }

    /** The confirm dialog's Delete: everything below goes too, with no Undo. */
    fun confirmDelete() {
        val current = state.value
        val task = current.task ?: return
        if (current.confirmDelete == null || current.deleting) return
        ui.update { it.copy(confirmDelete = null, deleting = true) }
        viewModelScope.launch {
            try {
                performDelete(task.id, undoable = false)
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(deleting = false, notice = TaskDetailNotice.Failed) }
            }
        }
    }

    fun dismissDelete() = ui.update { it.copy(confirmDelete = null) }

    /** A "Deleted · Undo" cut short by a rotation: the recreated screen shows it again. */
    fun putBackDeleted(deleted: TaskDeleted) = deletions.putBack(deleted)

    /** Undo from this screen's snackbar (a subtask deleted from its own detail). */
    fun undoDelete(deleted: TaskDeleted) {
        ui.update { it.copy(undoing = it.undoing + 1) }
        viewModelScope.launch {
            try {
                deleted.undo()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(notice = TaskDetailNotice.Failed) }
            } finally {
                ui.update { it.copy(undoing = it.undoing - 1) }
            }
        }
    }

    private suspend fun performDelete(id: String, undoable: Boolean) {
        val snapshot = data.deleteTask(id)
        if (undoable) deletions.post(TaskDeleted(id) { data.restoreTask(snapshot) })
        ui.update { it.copy(deleting = false, deleted = true) }
    }

    /** Writes the changed fields, guarded by the row's `updated_at`. */
    fun save() {
        val current = state.value
        val task = current.task ?: return
        val form = current.form ?: return
        // Not mid block or subtask write: the save closes the screen, which would cancel it.
        if (!current.canEdit || current.saving || current.blockWriting || current.subtaskWriting) return
        if (!form.isTitleValid) {
            ui.update { it.copy(notice = TaskDetailNotice.TitleRequired) }
            return
        }
        val patch = form.toPatch(task, clock.now())
        if (patch.isEmpty) {
            ui.update { it.copy(saved = true) }
            return
        }
        ui.update { it.copy(saving = true, notice = null) }
        viewModelScope.launch {
            try {
                data.updateTask(task.id, patch, expectedUpdatedAt = task.updatedAt)
                edits.value = null
                ui.update { it.copy(saving = false, saved = true) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: StaleWriteException) {
                // The repository has reloaded the latest row; the edits stay so
                // the user can review them against it and save again.
                ui.update { it.copy(saving = false, notice = TaskDetailNotice.Stale) }
            } catch (_: Exception) {
                ui.update { it.copy(saving = false, notice = TaskDetailNotice.Failed) }
            }
        }
    }

    /**
     * "Add to calendar": the sheet opens on the task's due date while it is
     * ahead (else today), half an hour, starting at the next full hour until
     * the first free slot that day is found in the cache.
     */
    fun openBlockSheet() {
        val current = state.value
        if (current.task == null || !current.canSchedule || current.saving || current.deleting) return
        if (current.blockSheet != null) return
        val now = clock.now()
        val date = BlockSlots.defaultDate(current.form?.dueDate, now, current.zone)
        val sheet = BlockSheetState(date, BlockSlots.nextFullHour(now, current.zone), BlockSlots.DEFAULT_MINUTES)
        blockUi.update { it.copy(sheet = sheet) }
        suggestStart(current.zone)
    }

    fun setBlockDate(date: LocalDate) = editSheet(suggest = true) { it.copy(date = date) }

    fun setBlockMinutes(minutes: Int) = editSheet(suggest = true) { it.copy(minutes = minutes) }

    fun setBlockStart(time: LocalTime) = editSheet(suggest = false) { it.copy(start = time, startPicked = true) }

    fun dismissBlockSheet() {
        if (blockUi.value.sheet?.saving == true) return
        suggestion?.cancel()
        blockUi.update { it.copy(sheet = null) }
    }

    /** The sheet's Add: creates the block as its own write; the form stays as it is. */
    fun createBlock() {
        val current = state.value
        val task = current.task ?: return
        // The flags, not the rendered state: a second tap may come before the state catches up.
        val sheet = blockUi.value.sheet ?: return
        val viewerId = latest?.viewerId ?: return
        if (!current.canSchedule || sheet.saving || current.saving || current.deleting) return
        val start = sheet.date.atTime(sheet.start).toInstant(current.zone)
        val draft = blockDraft(task, viewerId, start, sheet.minutes, current.zone)
        suggestion?.cancel()
        blockUi.update { it.copy(sheet = sheet.copy(saving = true)) }
        viewModelScope.launch {
            try {
                val created = data.createEvent(draft)
                blockUi.update { it.copy(sheet = null, notice = BlockNotice.Added(created.id)) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                blockUi.update { it.copy(sheet = it.sheet?.copy(saving = false)) }
                ui.update { it.copy(notice = TaskDetailNotice.Failed) }
            }
        }
    }

    /** Takes one of the viewer's blocks off the calendar, with Undo. */
    fun removeBlock(eventId: String) {
        val current = state.value
        val item = current.blocks.firstOrNull { it.event.id == eventId } ?: return
        if (!item.canRemove || item.pending || eventId in blockUi.value.writing || current.saving || current.deleting) return
        blockWrite(eventId) {
            val snapshot = data.deleteEvent(eventId)
            blockUi.update { it.copy(notice = BlockNotice.Removed(eventId, snapshot)) }
        }
    }

    /**
     * The snackbar's Undo: deletes a block just added, or puts back one just
     * removed. Not while the task is being deleted: its blocks go with it.
     */
    fun undoBlock(notice: BlockNotice) {
        dismissBlockNotice(notice)
        if (state.value.deleting) return
        when (notice) {
            is BlockNotice.Added -> blockWrite(notice.eventId) { data.deleteEvent(notice.eventId) }
            is BlockNotice.Removed -> blockWrite(notice.eventId) { data.restoreEvent(notice.snapshot) }
        }
    }

    /** Clears [shown] once the screen has consumed it; a newer notice is kept. */
    fun dismissBlockNotice(shown: BlockNotice) =
        blockUi.update { if (it.notice == shown) it.copy(notice = null) else it }

    /** Runs a removal or an Undo for [eventId], marking it pending meanwhile. */
    private fun blockWrite(eventId: String, write: suspend () -> Unit) {
        blockUi.update { it.copy(writing = it.writing + eventId) }
        viewModelScope.launch {
            try {
                write()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                ui.update { it.copy(notice = TaskDetailNotice.Failed) }
            } finally {
                blockUi.update { it.copy(writing = it.writing - eventId) }
            }
        }
    }

    private fun editSheet(suggest: Boolean, change: (BlockSheetState) -> BlockSheetState) {
        val sheet = blockUi.value.sheet ?: return
        if (sheet.saving) return
        blockUi.update { it.copy(sheet = it.sheet?.let(change)) }
        if (suggest) suggestStart(state.value.zone)
    }

    /**
     * Moves the sheet's start to the first free slot of its day for its
     * duration, read from the occurrence cache, unless the user has picked a
     * start. A failed read keeps the start it has.
     */
    private fun suggestStart(zone: TimeZone) {
        val sheet = blockUi.value.sheet ?: return
        if (sheet.startPicked) return
        val viewerId = latest?.viewerId
        suggestion?.cancel()
        suggestion = viewModelScope.launch {
            val start = try {
                val occurrences = data.occurrences(BlockSlots.dayWindow(sheet.date, zone), zone)
                BlockSlots.defaultStart(sheet.date, zone, sheet.minutes.minutes, occurrences, viewerId, clock.now())
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                return@launch
            }
            blockUi.update { flags ->
                val open = flags.sheet
                // Only for the day and duration it was asked for, and never over the user's pick.
                if (open == null || open.startPicked || open.saving || open.date != sheet.date || open.minutes != sheet.minutes) {
                    flags
                } else {
                    flags.copy(sheet = open.copy(start = start))
                }
            }
        }
    }

    private fun TaskDetailUiState.withBlocks(
        snapshot: Snapshot,
        events: List<PlannerEvent>,
        flags: BlockFlags,
    ): TaskDetailUiState {
        if (task == null) return this
        return copy(
            blocks = blockItems(events, clock.now(), snapshot.viewerId, flags.writing),
            canSchedule = canEdit,
            blockSheet = flags.sheet,
            blockNotice = flags.notice,
            blockWriting = flags.sheet?.saving == true || flags.writing.isNotEmpty(),
        )
    }

    private fun edit(change: (TaskForm) -> TaskForm) {
        val current = state.value
        val base = current.form ?: return
        if (!current.canEdit || current.saving) return
        edits.value = change(edits.value ?: base)
    }

    private fun render(
        snapshot: Snapshot,
        edits: TaskForm?,
        flags: UiFlags,
        pending: Map<String, Boolean>,
    ): TaskDetailUiState {
        val task = snapshot.tasks.firstOrNull { it.id == taskId }
            // Just deleted here: blank while the screen closes, not "not found".
            ?: return if (flags.deleted) {
                TaskDetailUiState(loading = true, deleted = true)
            } else {
                TaskDetailUiState(loading = false, notice = flags.notice)
            }
        val viewer = snapshot.members.firstOrNull { it.id == snapshot.viewerId }
        val stored = TaskForm.from(task)
        val form = edits ?: stored
        val byParent = snapshot.tasks.groupBy { it.parentId }
        val canEdit = snapshot.viewerId != null && task.ownerId == snapshot.viewerId
        return TaskDetailUiState(
            loading = false,
            task = task,
            form = form,
            canEdit = canEdit,
            owner = snapshot.members.firstOrNull { it.id == task.ownerId },
            members = snapshot.members,
            categories = snapshot.categories.filter { it.isShared || it.ownerId == task.ownerId },
            boards = task.collectionId
                ?.let { collection -> snapshot.boards.filter { it.collectionId == collection } }
                .orEmpty()
                .sortedBy { it.position },
            parent = task.parentId?.let { id -> snapshot.tasks.firstOrNull { it.id == id } },
            subtasks = subtaskItems(byParent[task.id].orEmpty(), snapshot, pending),
            canAddSubtask = canEdit && depthOf(task, snapshot.tasks.associateBy { it.id }) < MAX_DEPTH,
            subtaskTitle = flags.subtaskTitle,
            addingSubtask = flags.addingSubtask,
            subtaskWriting = flags.addingSubtask || pending.isNotEmpty() || flags.undoing > 0,
            progress = progressDeep(task.id, byParent),
            overdue = !form.done && isOverdue(form.dueDate, clock.today(viewerZone(viewer))),
            zone = viewerZone(viewer),
            dirty = form != stored,
            saving = flags.saving,
            saved = flags.saved,
            deleting = flags.deleting,
            confirmDelete = flags.confirmDelete,
            deleted = flags.deleted,
            notice = flags.notice,
        )
    }

    private fun subtaskItems(children: List<Task>, snapshot: Snapshot, pending: Map<String, Boolean>): List<SubtaskItem> {
        val blocked = sequentiallyBlockedIds(snapshot.tasks)
        return children.sortedWith(TaskOrder).map { child ->
            val isBlocked = child.id in blocked
            SubtaskItem(
                task = child,
                done = pending[child.id] ?: (child.completedAt != null),
                canToggle = snapshot.viewerId != null &&
                    child.ownerId == snapshot.viewerId &&
                    !isBlocked &&
                    TaskCompletion.canToggle(child, snapshot.boards),
                blocked = isBlocked,
                pending = child.id in pending,
            )
        }
    }

    private data class UiFlags(
        val saving: Boolean = false,
        val saved: Boolean = false,
        val subtaskTitle: String = "",
        val addingSubtask: Boolean = false,
        /** Subtask deletes being undone from this screen's snackbar. */
        val undoing: Int = 0,
        val deleting: Boolean = false,
        val confirmDelete: DeletePlan.Confirm? = null,
        val deleted: Boolean = false,
        val notice: TaskDetailNotice? = null,
    )

    private data class BlockFlags(
        val sheet: BlockSheetState? = null,
        /** Event ids with a removal or an Undo in flight. */
        val writing: Set<String> = emptySet(),
        val notice: BlockNotice? = null,
    )

    private data class Snapshot(
        val tasks: List<Task>,
        val members: List<Member>,
        val categories: List<Category>,
        val boards: List<Board>,
        val viewerId: String?,
    )

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}

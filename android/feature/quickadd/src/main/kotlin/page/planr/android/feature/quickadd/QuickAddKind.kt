package page.planr.android.feature.quickadd

/** What the Quick add sheet creates; the widget's two buttons pick one. */
enum class QuickAddKind { Task, Event }

/** What Quick add just created: the row's [kind] and [id], for the confirmation's Undo. */
data class QuickAddSaved(val kind: QuickAddKind, val id: String)

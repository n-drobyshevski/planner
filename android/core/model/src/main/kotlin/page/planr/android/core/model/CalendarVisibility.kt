package page.planr.android.core.model

/**
 * The calendar's layer and context filters: the arguments of the web's
 * `filterVisible` (lib/scope/visibility.ts), held in its ui-store as
 * `overlayMemberIds`, `ownCalendarHidden` and `hiddenCategoryIds`, for a
 * two-person workspace (the one other member is [showPartner]).
 */
data class CalendarFilter(
    /** The partner's personal items show (the web's overlay of the other member). */
    val showPartner: Boolean = true,
    /** The viewer's own personal items are hidden; joint ones still show (`ownCalendarHidden`). */
    val ownHidden: Boolean = false,
    /** Contexts (categories) whose items are hidden, joint ones included (`hiddenCategoryIds`). */
    val hiddenCategoryIds: Set<String> = emptySet(),
) {
    /**
     * Whether the own-calendar or context filters hide anything, given the
     * workspace's [categoryIds] (ids of deleted contexts don't count). The
     * partner is left out: the agenda header shows that toggle on its own.
     */
    fun narrows(categoryIds: Collection<String>): Boolean =
        ownHidden || categoryIds.any { it in hiddenCategoryIds }
}

/**
 * Which occurrences the viewer's calendar draws: the web's `filterVisible`
 * (lib/scope/visibility.ts). Shared by the agenda and the widgets so both
 * show the same events; the widgets use the partner toggle only.
 */
object CalendarVisibility {

    /**
     * The viewer's own items and joint ones always; the partner's personal
     * items only when [showPartner] (the web's overlay toggle). Private items
     * never reach the device (RLS). An unknown viewer sees everything.
     */
    fun isVisible(occurrence: Occurrence, viewerId: String?, showPartner: Boolean): Boolean =
        showPartner || viewerId == null || occurrence.isShared || occurrence.ownerId == viewerId

    fun filter(occurrences: List<Occurrence>, viewerId: String?, showPartner: Boolean): List<Occurrence> =
        if (showPartner || viewerId == null) occurrences else occurrences.filter { isVisible(it, viewerId, false) }

    /**
     * [isVisible] under the whole [filter], as the web keeps an item: joint,
     * or the viewer's own while their calendar shows, or the partner's while
     * overlaid — and, whoever's it is, not in a hidden context. An item with
     * no context is never hidden by one. An unknown viewer sees every layer.
     */
    fun isVisible(occurrence: Occurrence, viewerId: String?, filter: CalendarFilter): Boolean {
        val layer = when {
            viewerId == null || occurrence.isShared -> true
            occurrence.ownerId == viewerId -> !filter.ownHidden
            else -> filter.showPartner
        }
        val categoryId = occurrence.categoryId
        return layer && (categoryId == null || categoryId !in filter.hiddenCategoryIds)
    }

    fun filter(occurrences: List<Occurrence>, viewerId: String?, filter: CalendarFilter): List<Occurrence> =
        if (filter == CalendarFilter()) occurrences else occurrences.filter { isVisible(it, viewerId, filter) }

    /** The other member of a two-person workspace; null when there isn't exactly one. */
    fun partnerOf(members: List<Member>, viewerId: String?): Member? =
        members.filter { it.id != viewerId }.singleOrNull()?.takeIf { viewerId != null }
}

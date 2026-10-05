package page.planr.android.core.model

/**
 * Which occurrences the viewer's calendar draws: the web's `filterVisible`
 * (lib/scope/visibility.ts) without category hiding. Shared by the agenda and
 * the widgets so both show the same events.
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

    /** The other member of a two-person workspace; null when there isn't exactly one. */
    fun partnerOf(members: List<Member>, viewerId: String?): Member? =
        members.filter { it.id != viewerId }.singleOrNull()?.takeIf { viewerId != null }
}

package page.planr.android.feature.agenda.model

import kotlinx.datetime.TimeZone
import page.planr.android.core.model.Member
import page.planr.android.core.model.viewerTimeZone

/**
 * The zone the calendar is drawn in: the member's own `timezone` when set and
 * valid, else the device's (the web's `useViewerTimeZone`).
 */
fun viewerZone(member: Member?): TimeZone = viewerTimeZone(member)

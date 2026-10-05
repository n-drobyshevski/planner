package page.planr.android.feature.tasks.model

import kotlin.time.Clock
import kotlinx.datetime.LocalDate
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import page.planr.android.core.model.Member
import page.planr.android.core.model.viewerTimeZone

/** The member's own zone when set and valid, else the device zone (the web's `useViewerTimeZone`). */
internal fun viewerZone(member: Member?): TimeZone = viewerTimeZone(member)

/** Today's calendar date in [zone]; "overdue" and the due buckets are judged against it. */
internal fun Clock.today(zone: TimeZone): LocalDate = now().toLocalDateTime(zone).date

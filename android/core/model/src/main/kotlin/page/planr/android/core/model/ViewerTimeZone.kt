package page.planr.android.core.model

import kotlinx.datetime.TimeZone

/**
 * The zone a member's calendar is drawn in: their own `members.timezone`
 * when set and valid, else the device's (the web's `useViewerTimeZone`).
 * Shared by the screens and the widgets so both agree on "today".
 */
fun viewerTimeZone(member: Member?): TimeZone =
    member?.timezone?.let { id -> runCatching { TimeZone.of(id) }.getOrNull() } ?: TimeZone.currentSystemDefault()

package page.planr.android.core.data.remote

import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import kotlin.time.Instant

/**
 * Instant -> the ISO string the web writes (`new Date(ms).toISOString()` in
 * lib/supabase/mappers.ts `toIso`): UTC, millisecond precision, always three
 * fraction digits, e.g. `2026-06-01T09:00:00.000Z`. Every timestamptz the app
 * sends to PostgREST goes through here so payloads are byte-identical to the
 * web's.
 */
object PostgresTime {
    private val ISO_MILLIS: DateTimeFormatter =
        DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC)

    fun toIso(instant: Instant): String = toIso(instant.toEpochMilliseconds())

    fun toIso(epochMs: Long): String = ISO_MILLIS.format(java.time.Instant.ofEpochMilli(epochMs))
}

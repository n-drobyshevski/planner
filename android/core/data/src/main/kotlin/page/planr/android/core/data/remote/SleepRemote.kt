package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.datetime.LocalDate
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.data.health.SleepNight
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepTimes
import page.planr.android.core.data.model.SleepTimesSource
import page.planr.android.core.model.PostgresInstantSerializer

/** The columns of a `sleep_logs` row the device owns (times, stages, source). */
@Serializable
data class SleepDeviceRow(
    val date: String,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("bedtime_at") val bedtimeAt: Instant? = null,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("woke_at") val wokeAt: Instant? = null,
    @SerialName("times_source") val timesSource: String = "manual",
    @SerialName("external_id") val externalId: String? = null,
    @SerialName("asleep_min") val asleepMin: Int? = null,
    @SerialName("deep_min") val deepMin: Int? = null,
    @SerialName("light_min") val lightMin: Int? = null,
    @SerialName("rem_min") val remMin: Int? = null,
    @SerialName("awake_min") val awakeMin: Int? = null,
)

/** A whole `sleep_logs` row as the Sleep tab and the check-in read it (mappers.ts `mapSleepLog`). */
@Serializable
internal data class SleepLogRow(
    val date: String,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("bedtime_at") val bedtimeAt: Instant? = null,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("woke_at") val wokeAt: Instant? = null,
    @SerialName("times_source") val timesSource: String? = null,
    val quality: Int? = null,
    val fatigue: Int? = null,
    val note: String? = null,
    @SerialName("asleep_min") val asleepMin: Int? = null,
    @SerialName("deep_min") val deepMin: Int? = null,
    @SerialName("light_min") val lightMin: Int? = null,
    @SerialName("rem_min") val remMin: Int? = null,
    @SerialName("awake_min") val awakeMin: Int? = null,
) {
    fun toModel(): SleepLog = SleepLog(
        date = LocalDate.parse(date.take(10)),
        bedtimeAt = bedtimeAt,
        wokeAt = wokeAt,
        timesSource = SleepTimesSource.fromWire(timesSource),
        quality = quality,
        fatigue = fatigue,
        note = note,
        asleepMin = asleepMin,
        deepMin = deepMin,
        lightMin = lightMin,
        remMin = remMin,
        awakeMin = awakeMin,
    )
}

/** The `member_sleep_prefs` columns that decide which calendar block is a night. */
@Serializable
internal data class SleepPrefsRow(
    @SerialName("sleep_category_id") val sleepCategoryId: String? = null,
    @SerialName("night_window_start_hour") val nightWindowStartHour: Int = 20,
    @SerialName("night_window_end_hour") val nightWindowEndHour: Int = 12,
    @SerialName("auto_adjust_sleep_on_feedback") val autoAdjust: Boolean = true,
)

/**
 * Writes Health Connect nights into `sleep_logs` (member-private under RLS),
 * the table the web's Sleep tab reads.
 *
 * The upsert sends only the device's columns. PostgREST updates exactly the
 * columns it is sent, so the member's quality, fatigue and note on the same
 * night are never touched (supabase/migrations/20261006000000_sleep_logs_health_connect.sql).
 */
class SleepRemote @Inject constructor(
    private val gateway: PostgrestGateway,
) {
    /** The device columns of the member's nights from [sinceDate] (yyyy-MM-dd) on. */
    suspend fun fetchDeviceRows(memberId: String, sinceDate: String): List<SleepDeviceRow> = gateway.select(
        SupabaseTables.SLEEP_LOGS,
        columns = DEVICE_COLUMNS,
        filters = listOf(eq("member_id", memberId), gte("date", sinceDate)),
    ).decodeAll(SleepDeviceRow.serializer())

    /** The member's nights from [sinceDate] (yyyy-MM-dd) on, newest first. */
    suspend fun fetchLogs(memberId: String, sinceDate: String): List<SleepLog> = gateway.select(
        SupabaseTables.SLEEP_LOGS,
        columns = LOG_COLUMNS,
        filters = listOf(eq("member_id", memberId), gte("date", sinceDate)),
        order = listOf(RowOrder("date", ascending = false)),
    ).decodeAll(SleepLogRow.serializer()).map { it.toModel() }

    /** The member's night that woke on [date], if any. */
    suspend fun fetchLog(memberId: String, date: LocalDate): SleepLog? = gateway.select(
        SupabaseTables.SLEEP_LOGS,
        columns = LOG_COLUMNS,
        filters = listOf(eq("member_id", memberId), eq("date", date.toString())),
        limit = 1,
    ).firstOrNull()?.decodeAs(SleepLogRow.serializer())?.toModel()

    /**
     * Saves the member's ratings and note on [date] (mappers.ts
     * `sleepLogInputToRow`). Only workspace / member / date and the three
     * rating columns are sent, plus bedtime, wake and `times_source = manual`
     * when [times] is given, so a night's device times and stages stay
     * untouched. Callers pass [times] through `keepDeviceTimes` first.
     */
    suspend fun upsertRating(
        workspaceId: String,
        memberId: String,
        date: LocalDate,
        quality: Int?,
        fatigue: Int?,
        note: String?,
        times: SleepTimes? = null,
    ): SleepLog? = gateway.upsert(
        SupabaseTables.SLEEP_LOGS,
        listOf(ratingPayload(workspaceId, memberId, date, quality, fatigue, note, times)),
        onConflict = "member_id,date",
    ).firstOrNull()?.decodeAs(SleepLogRow.serializer())?.toModel()

    /** The member's sleep settings; the DB defaults when they never saved any (member-private). */
    suspend fun fetchBlockPrefs(memberId: String): SleepBlockPrefs {
        val row = gateway.select(
            SupabaseTables.MEMBER_SLEEP_PREFS,
            columns = "sleep_category_id,night_window_start_hour,night_window_end_hour,auto_adjust_sleep_on_feedback",
            filters = listOf(eq("member_id", memberId)),
            limit = 1,
        ).firstOrNull()?.decodeAs(SleepPrefsRow.serializer()) ?: SleepPrefsRow()
        return SleepBlockPrefs(row.sleepCategoryId, row.nightWindowStartHour, row.nightWindowEndHour, row.autoAdjust)
    }

    suspend fun upsertNights(workspaceId: String, memberId: String, nights: List<SleepNight>) {
        if (nights.isEmpty()) return
        gateway.upsert(
            SupabaseTables.SLEEP_LOGS,
            nights.map { payload(workspaceId, memberId, it) },
            onConflict = "member_id,date",
        )
    }

    internal companion object {
        const val LOG_COLUMNS =
            "date,bedtime_at,woke_at,times_source,quality,fatigue,note,asleep_min,deep_min,light_min,rem_min,awake_min"

        const val DEVICE_COLUMNS =
            "date,bedtime_at,woke_at,times_source,external_id,asleep_min,deep_min,light_min,rem_min,awake_min"

        /** Every row carries the same keys, so one batch is one column set. */
        fun payload(workspaceId: String, memberId: String, night: SleepNight): JsonObject = buildJsonObject {
            put("workspace_id", workspaceId)
            put("member_id", memberId)
            put("date", night.date.toString())
            put("bedtime_at", PostgresTime.toIso(night.bedtime.toEpochMilli()))
            put("woke_at", PostgresTime.toIso(night.woke.toEpochMilli()))
            put("times_source", "health_connect")
            put("external_id", night.externalId.take(200))
            put("asleep_min", night.asleepMin)
            put("deep_min", night.deepMin)
            put("light_min", night.lightMin)
            put("rem_min", night.remMin)
            put("awake_min", night.awakeMin)
        }

        fun ratingPayload(
            workspaceId: String,
            memberId: String,
            date: LocalDate,
            quality: Int?,
            fatigue: Int?,
            note: String?,
            times: SleepTimes?,
        ): JsonObject = buildJsonObject {
            put("workspace_id", workspaceId)
            put("member_id", memberId)
            put("date", date.toString())
            put("quality", quality)
            put("fatigue", fatigue)
            put("note", note)
            if (times != null) {
                put("bedtime_at", times.bedtimeAt?.let(PostgresTime::toIso))
                put("woke_at", times.wokeAt?.let(PostgresTime::toIso))
                put("times_source", SleepTimesSource.Manual.wire)
            }
        }

        /** True when the stored row already says what [night] says (to the second). */
        fun SleepDeviceRow.matches(night: SleepNight): Boolean =
            timesSource == "health_connect" &&
                bedtimeAt?.epochSeconds == night.bedtime.epochSecond &&
                wokeAt?.epochSeconds == night.woke.epochSecond &&
                asleepMin == night.asleepMin &&
                deepMin == night.deepMin &&
                lightMin == night.lightMin &&
                remMin == night.remMin &&
                awakeMin == night.awakeMin
    }
}

package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.health.SleepNight
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

    suspend fun upsertNights(workspaceId: String, memberId: String, nights: List<SleepNight>) {
        if (nights.isEmpty()) return
        gateway.upsert(
            SupabaseTables.SLEEP_LOGS,
            nights.map { payload(workspaceId, memberId, it) },
            onConflict = "member_id,date",
        )
    }

    internal companion object {
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

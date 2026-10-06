package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add

/**
 * One `member_app_prefs` row: the account copy of a member's view settings
 * (supabase/migrations/20261005000000_member_app_prefs.sql). Member-private
 * under RLS.
 */
@Serializable
data class AppPrefsRow(
    @SerialName("member_id") val memberId: String,
    @SerialName("workspace_id") val workspaceId: String,
    @SerialName("show_partner_events") val showPartnerEvents: Boolean = true,
    /** `day`, `week` or `month` ([page.planr.android.core.data.prefs.AgendaViewMode]). */
    @SerialName("agenda_mode") val agendaMode: String = "day",
    @SerialName("insights_hidden_category_ids") val insightsHiddenCategoryIds: List<String> = emptyList(),
    @SerialName("insights_include_inactive") val insightsIncludeInactive: Boolean = false,
)

/** Reads and writes the signed-in member's `member_app_prefs` row. */
class AppPrefsRemote @Inject constructor(
    private val gateway: PostgrestGateway,
) {
    /** The member's row; null when they never saved one. */
    suspend fun fetch(memberId: String): AppPrefsRow? = gateway.select(
        SupabaseTables.MEMBER_APP_PREFS,
        filters = listOf(eq("member_id", memberId)),
        limit = 1,
    ).firstOrNull()?.decodeAs(AppPrefsRow.serializer())

    /** Inserts or replaces the member's row (`updated_at` is the server's). */
    suspend fun upsert(row: AppPrefsRow) {
        gateway.upsert(SupabaseTables.MEMBER_APP_PREFS, listOf(payload(row)), onConflict = "member_id")
    }

    internal companion object {
        fun payload(row: AppPrefsRow): JsonObject = buildJsonObject {
            put("member_id", row.memberId)
            put("workspace_id", row.workspaceId)
            put("show_partner_events", row.showPartnerEvents)
            put("agenda_mode", row.agendaMode)
            putJsonArray("insights_hidden_category_ids") { row.insightsHiddenCategoryIds.forEach { add(it) } }
            put("insights_include_inactive", row.insightsIncludeInactive)
        }

        /** A Realtime record, decoded leniently; null when it isn't a prefs row. */
        fun decode(record: JsonObject): AppPrefsRow? =
            runCatching { record.decodeAs(AppPrefsRow.serializer()) }.getOrNull()
    }
}

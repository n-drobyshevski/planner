package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.model.TimeslotRequest
import page.planr.android.core.data.model.TimeslotRequestStatus
import page.planr.android.core.model.PostgresInstantSerializer

/** A `timeslot_requests` row (mappers.ts `mapTimeslotRequest`). */
@Serializable
internal data class TimeslotRequestRow(
    val id: String,
    @SerialName("share_id") val shareId: String,
    @SerialName("workspace_id") val workspaceId: String,
    @SerialName("owner_id") val ownerId: String,
    @SerialName("requester_name") val requesterName: String? = null,
    val message: String? = null,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("proposed_start") val proposedStart: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("proposed_end") val proposedEnd: Instant,
    val status: String? = null,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("created_at") val createdAt: Instant,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("resolved_at") val resolvedAt: Instant? = null,
) {
    fun toModel(): TimeslotRequest = TimeslotRequest(
        id = id,
        shareId = shareId,
        workspaceId = workspaceId,
        ownerId = ownerId,
        requesterName = requesterName,
        message = message,
        proposedStart = proposedStart,
        proposedEnd = proposedEnd,
        status = TimeslotRequestStatus.fromWire(status),
        createdAt = createdAt,
        resolvedAt = resolvedAt,
    )
}

/**
 * Public-share timeslot requests (supabase/migrations/20260705000000_timeslot_requests.sql).
 * RLS shows and lets update only the share owner's rows; nobody inserts
 * here (a SECURITY DEFINER function does). Resolving is a plain status
 * update, as the web's `useTimeslotRequests` does it.
 */
class TimeslotRequestsRemote @Inject constructor(
    private val gateway: PostgrestGateway,
) {
    /** The workspace's pending requests the viewer owns, newest first (queries.ts `fetchTimeslotRequests`). */
    suspend fun fetchPending(workspaceId: String): List<TimeslotRequest> = gateway.select(
        SupabaseTables.TIMESLOT_REQUESTS,
        filters = listOf(eq("workspace_id", workspaceId), eq("status", TimeslotRequestStatus.Pending.wire)),
        order = listOf(RowOrder("created_at", ascending = false)),
    ).decodeAll(TimeslotRequestRow.serializer()).map { it.toModel() }

    /**
     * Marks [id] [status] (approved or declined) and stamps `resolved_at`.
     * Like the web, a request that matched nothing (resolved elsewhere) is
     * not an error: it is no longer pending either way.
     */
    suspend fun resolve(id: String, status: TimeslotRequestStatus, resolvedAt: Instant) {
        require(status != TimeslotRequestStatus.Pending) { "A request resolves to approved or declined" }
        gateway.update(SupabaseTables.TIMESLOT_REQUESTS, resolvePayload(status, resolvedAt), listOf(eq("id", id)))
    }

    internal companion object {
        fun resolvePayload(status: TimeslotRequestStatus, resolvedAt: Instant): JsonObject = buildJsonObject {
            put("status", status.wire)
            put("resolved_at", PostgresTime.toIso(resolvedAt))
        }
    }
}

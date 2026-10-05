package page.planr.android.core.data.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** Whether Health Connect can be used on this phone. */
enum class HealthAvailability {
    Available,
    /** missing or too old: the Play Store listing fixes it */
    NeedsInstall,
    /** not supported on this phone (Android 8 and older, some work profiles) */
    Unsupported,
}

/** The sleep side of Health Connect, behind an interface so sync is testable. */
interface HealthSleepSource {
    fun availability(): HealthAvailability

    /** The permissions to request: sleep, plus history when Health Connect supports it. */
    fun permissionsToRequest(): Set<String>

    suspend fun hasReadPermission(): Boolean

    /** Reading beyond 30 days back was granted. */
    suspend fun historyGranted(): Boolean

    /** Sleep sessions overlapping [from, to). Throws SecurityException without permission. */
    suspend fun read(from: Instant, to: Instant): List<HealthSleepSession>

    /** Withdraws every permission Planr holds in Health Connect. */
    suspend fun revoke()
}

@Singleton
class HealthConnectSleepSource @Inject constructor(
    @ApplicationContext private val context: Context,
) : HealthSleepSource {
    @Volatile private var cached: HealthConnectClient? = null

    /** Null until Health Connect is usable (it may be installed while Planr runs). */
    private val client: HealthConnectClient?
        get() = cached ?: if (availability() == HealthAvailability.Available) {
            HealthConnectClient.getOrCreate(context).also { cached = it }
        } else {
            null
        }

    override fun availability(): HealthAvailability = when (HealthConnectClient.getSdkStatus(context)) {
        HealthConnectClient.SDK_AVAILABLE -> HealthAvailability.Available
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> HealthAvailability.NeedsInstall
        else -> HealthAvailability.Unsupported
    }

    override fun permissionsToRequest(): Set<String> = buildSet {
        add(READ_SLEEP)
        if (historySupported()) add(HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY)
    }

    override suspend fun hasReadPermission(): Boolean = READ_SLEEP in granted()

    override suspend fun historyGranted(): Boolean =
        HealthPermission.PERMISSION_READ_HEALTH_DATA_HISTORY in granted()

    override suspend fun read(from: Instant, to: Instant): List<HealthSleepSession> {
        val client = client ?: return emptyList()
        val out = mutableListOf<HealthSleepSession>()
        var page: String? = null
        do {
            val response = client.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = TimeRangeFilter.between(from, to),
                    pageToken = page,
                ),
            )
            response.records.mapTo(out) { it.toSession() }
            page = response.pageToken
        } while (page != null)
        return out
    }

    override suspend fun revoke() {
        client?.permissionController?.revokeAllPermissions()
    }

    private suspend fun granted(): Set<String> =
        client?.permissionController?.getGrantedPermissions().orEmpty()

    private fun historySupported(): Boolean = client?.features?.getFeatureStatus(
        HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_HISTORY,
    ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    companion object {
        val READ_SLEEP: String = HealthPermission.getReadPermission(SleepSessionRecord::class)

        private fun SleepSessionRecord.toSession() = HealthSleepSession(
            id = metadata.id,
            start = startTime,
            end = endTime,
            endOffset = endZoneOffset,
            stages = stages.map { HealthSleepStage(it.startTime, it.endTime, kindOf(it.stage)) },
        )

        private fun kindOf(stage: Int): SleepStageKind = when (stage) {
            SleepSessionRecord.STAGE_TYPE_LIGHT -> SleepStageKind.Light
            SleepSessionRecord.STAGE_TYPE_DEEP -> SleepStageKind.Deep
            SleepSessionRecord.STAGE_TYPE_REM -> SleepStageKind.Rem
            SleepSessionRecord.STAGE_TYPE_SLEEPING -> SleepStageKind.Sleeping
            SleepSessionRecord.STAGE_TYPE_AWAKE,
            SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED,
            SleepSessionRecord.STAGE_TYPE_OUT_OF_BED,
            -> SleepStageKind.Awake
            else -> SleepStageKind.Unknown
        }
    }
}

package page.planr.android.feature.agenda.sleep

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.datetime.LocalDate
import page.planr.android.core.data.model.SleepLog
import page.planr.android.core.data.model.SleepRating
import page.planr.android.core.data.model.SleepTimesSource
import page.planr.android.core.data.repository.SleepLogRepository

/** In-memory [SleepLogRepository]: [stored] is the server; [refresh] copies it into [recentLogs]. */
class FakeSleepLogRepository(var stored: List<SleepLog> = emptyList()) : SleepLogRepository {
    override val recentLogs = MutableStateFlow<List<SleepLog>?>(null)
    override val checkinDismissedOn = MutableStateFlow<LocalDate?>(null)

    val saved = mutableListOf<SleepRating>()
    var refreshes = 0
    var failSave: Exception? = null

    override suspend fun refresh(force: Boolean) {
        refreshes++
        recentLogs.value = stored.sortedByDescending { it.date }
    }

    override suspend fun save(rating: SleepRating): SleepLog {
        failSave?.let { failSave = null; throw it }
        saved += rating
        val existing = stored.firstOrNull { it.date == rating.date }
        val times = rating.timesFor(existing)
        val log = (existing ?: SleepLog(rating.date)).copy(
            quality = rating.quality,
            fatigue = rating.fatigue,
            note = rating.note,
        ).let { if (times != null) it.copy(bedtimeAt = times.bedtimeAt, wokeAt = times.wokeAt, timesSource = SleepTimesSource.Manual) else it }
        stored = stored.filterNot { it.date == rating.date } + log
        refresh()
        return log
    }

    override suspend fun dismissCheckin(date: LocalDate) {
        checkinDismissedOn.value = date
    }
}

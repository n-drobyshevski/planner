package page.planr.android.feature.agenda.model

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.datetime.LocalDate

/**
 * A day the agenda should show, asked for from outside it (a tap on a day in
 * the Week or Month widget). The app posts it; the agenda takes it whether it
 * is already open or created afterwards, and opens that day in the day view.
 * Only the latest request is kept.
 */
@Singleton
class AgendaDayRequests @Inject constructor() {
    private val _pending = MutableStateFlow<LocalDate?>(null)
    internal val pending: StateFlow<LocalDate?> = _pending.asStateFlow()

    fun request(date: LocalDate) {
        _pending.value = date
    }

    /** Claims [date] if it is still the pending request, so it opens once. */
    internal fun take(date: LocalDate): Boolean = _pending.compareAndSet(date, null)
}

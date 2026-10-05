package page.planr.android.feature.agenda.model

/** Which instances a recurring edit or delete applies to (`RecurrenceScope` on the web). */
enum class RecurrenceScope {
    /** Only this occurrence: an override. */
    This,

    /** This and every later occurrence: the series is split (or capped). */
    Following,

    /** The whole series: the master row. */
    All,
}

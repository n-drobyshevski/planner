package page.planr.android.core.insights.model

enum class LedeTone { Neutral, Attention }

/** ledes.ts `comparisonNoun`: what "previous" means for a preset. */
enum class ComparisonUnit(val id: String) { Week("week"), Month("month"), Period("period") }

/** One ICU argument of a lede line, typed so the UI can format it per locale. */
sealed interface LedeArg {
    /** → DurationFormat.format */
    data class Duration(val ms: Double) : LedeArg

    /** Counts, percentages, differences. */
    data class Num(val value: Long) : LedeArg

    /** A select token: direction, unit, granularity, hasRate, sign. */
    data class Select(val token: String) : LedeArg

    /** A series key → its display name (UI). */
    data class Category(val seriesKey: String) : LedeArg

    /** 0 = Monday → the weekday's full name (UI string). */
    data class Weekday(val index: Int) : LedeArg

    /** → the short daypart label (UI string). */
    data class DaypartRef(val daypart: Daypart) : LedeArg

    /** → InsightsLabels.bucketLabel */
    data class BucketRef(val start: Long, val end: Long, val granularity: Granularity) : LedeArg
}

/** A lede sentence as data: the web message [key] (e.g. "lede.overviewHeadline") and its args in TS call order. */
data class LedeLine(val key: String, val args: Map<String, LedeArg>)

/** ledes.ts `Lede`, structured. */
data class Lede(val tone: LedeTone, val headline: LedeLine, val support: LedeLine?)

/** The top context passed to the Overview lede. */
data class TopContext(val seriesKey: String, val ms: Long)

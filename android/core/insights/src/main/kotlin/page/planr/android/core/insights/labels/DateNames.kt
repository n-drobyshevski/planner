package page.planr.android.core.insights.labels

/**
 * date-fns 4 en-US and ru name tables, copied verbatim (CLDR differs: never use java.time names).
 * The ru month names are the formatting-context (genitive) forms date-fns prints for "MMM" and
 * "MMMM", so "MMMM yyyy" reads "июня 2026" exactly as on the web; `labels.json` pins every entry.
 */
object DateNames {
    private val MONTH_ABBR_EN = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    private val MONTH_ABBR_RU =
        listOf("янв.", "фев.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек.")
    private val MONTH_WIDE_EN = listOf(
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    )
    private val MONTH_WIDE_RU = listOf(
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    )

    // Monday first (ISO), unlike date-fns' Sunday-first arrays.
    private val WEEKDAY_ABBR_EN = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    private val WEEKDAY_ABBR_RU = listOf("пнд", "втр", "срд", "чтв", "птн", "суб", "вск")
    private val WEEKDAY_WIDE_EN = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
    private val WEEKDAY_WIDE_RU =
        listOf("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")

    /** "MMM", formatting context; [month] 1..12. */
    fun monthAbbr(month: Int, l: LabelLocale): String = (if (l == LabelLocale.Ru) MONTH_ABBR_RU else MONTH_ABBR_EN)[month - 1]

    /** "MMMM", formatting context (ru genitive). */
    fun monthWide(month: Int, l: LabelLocale): String = (if (l == LabelLocale.Ru) MONTH_WIDE_RU else MONTH_WIDE_EN)[month - 1]

    /** "EEE"; [isoDay] 1 = Monday … 7 = Sunday. */
    fun weekdayAbbr(isoDay: Int, l: LabelLocale): String =
        (if (l == LabelLocale.Ru) WEEKDAY_ABBR_RU else WEEKDAY_ABBR_EN)[isoDay - 1]

    /** "EEEE". */
    fun weekdayWide(isoDay: Int, l: LabelLocale): String =
        (if (l == LabelLocale.Ru) WEEKDAY_WIDE_RU else WEEKDAY_WIDE_EN)[isoDay - 1]
}

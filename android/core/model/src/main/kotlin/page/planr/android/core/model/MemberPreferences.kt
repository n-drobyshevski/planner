package page.planr.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** UI language, per member (DB CHECK on `members.locale`). */
@Serializable
enum class AppLocale {
    @SerialName("en") En,
    @SerialName("ru") Ru,
}

/** Light / dark / follow-the-system, per member (`members.theme_preference`). */
@Serializable
enum class ThemePreference {
    @SerialName("light") Light,
    @SerialName("dark") Dark,
    @SerialName("system") System,
}

/** How a context time-block is labelled in the week/day grid (`members.context_label`). */
@Serializable
enum class ContextLabel {
    @SerialName("bar") Bar,
    @SerialName("side") Side,
}

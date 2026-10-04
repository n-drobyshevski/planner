package page.planr.android.core.model

import kotlin.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A `members` row: one of the workspace's two people. Mirrors `Member` in
 * lib/types.ts. `color` is the member's identity hex (Member A terracotta,
 * Member B teal by default). Appearance columns the Android app doesn't use
 * (accent, surface tone, palette, pink base) are kept as raw strings so a new
 * web-only value never breaks decoding.
 */
@Serializable
data class Member(
    val id: String,
    @SerialName("workspace_id") val workspaceId: String,
    @SerialName("auth_user_id") val authUserId: String? = null,
    val name: String,
    val color: String,
    /** A password secret is set (the web's `hasPassword`). */
    @SerialName("has_secret") val hasSecret: Boolean = false,
    @SerialName("has_passkey") val hasPasskey: Boolean = false,
    val locale: AppLocale = AppLocale.En,
    @SerialName("theme_preference") val themePreference: ThemePreference = ThemePreference.System,
    val accent: String = "stone",
    @SerialName("surface_tone") val surfaceTone: String = "warm",
    val palette: String = "default",
    @SerialName("pink_base") val pinkBase: String? = null,
    /** IANA zone; null = follow the device. */
    val timezone: String? = null,
    @SerialName("secondary_timezone") val secondaryTimezone: String? = null,
    @SerialName("show_inactive_in_month") val showInactiveInMonth: Boolean = true,
    @SerialName("show_success_toasts") val showSuccessToasts: Boolean = true,
    @SerialName("context_label") val contextLabel: ContextLabel = ContextLabel.Bar,
    @Serializable(with = PostgresInstantSerializer::class)
    @SerialName("created_at") val createdAt: Instant? = null,
)

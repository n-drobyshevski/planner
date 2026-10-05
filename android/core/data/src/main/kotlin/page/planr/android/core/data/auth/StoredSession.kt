package page.planr.android.core.data.auth

import kotlin.time.Duration
import kotlin.time.Instant
import kotlinx.serialization.Serializable

/**
 * The persisted session: OAuth tokens plus the member they resolve to. Kept
 * only encrypted at rest (see [DataStoreSessionStore]).
 */
@Serializable
data class StoredSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSec: Long,
    /** `sub`: the auth user id. */
    val userId: String,
    /** Resolved like `verifyMcpToken`; null only mid sign-in. */
    val memberId: String? = null,
    val workspaceId: String? = null,
) {
    val expiresAt: Instant get() = Instant.fromEpochSeconds(expiresAtEpochSec)

    fun expiresWithin(leeway: Duration, now: Instant): Boolean = expiresAt - leeway <= now

    /** The member-resolved view handed to the rest of the app; null mid sign-in. */
    fun info(): SessionInfo? {
        val member = memberId ?: return null
        val workspace = workspaceId ?: return null
        return SessionInfo(userId = userId, memberId = member, workspaceId = workspace)
    }

    /** Applies a token-endpoint response; a missing refresh token keeps the old one. */
    fun refreshedWith(tokens: OAuthTokens, now: Instant): StoredSession =
        copy(
            accessToken = tokens.accessToken,
            refreshToken = tokens.refreshToken ?: refreshToken,
            expiresAtEpochSec = expiryOf(tokens, now),
        )

    companion object {
        /** A fresh session from the code exchange; null when the token has no `sub`. */
        fun from(tokens: OAuthTokens, now: Instant): StoredSession? {
            val claims = JwtClaims.parse(tokens.accessToken) ?: return null
            val refresh = tokens.refreshToken ?: return null
            return StoredSession(
                accessToken = tokens.accessToken,
                refreshToken = refresh,
                expiresAtEpochSec = expiryOf(tokens, now),
                userId = claims.subject,
            )
        }

        /**
         * Expiry on the device's clock: [now] + `expires_in`. The JWT's `exp`
         * is on the server's clock, and refresh decisions compare against
         * `clock.now()` — so a skewed device clock would refresh too late
         * (401s) or on every request. `exp` is only the fallback when the
         * response has no `expires_in`.
         */
        private fun expiryOf(tokens: OAuthTokens, now: Instant): Long =
            tokens.expiresIn?.let { now.epochSeconds + it }
                ?: JwtClaims.parse(tokens.accessToken)?.expiresAtEpochSec
                ?: (now.epochSeconds + DEFAULT_LIFETIME_SEC)

        private const val DEFAULT_LIFETIME_SEC = 3600L
    }
}

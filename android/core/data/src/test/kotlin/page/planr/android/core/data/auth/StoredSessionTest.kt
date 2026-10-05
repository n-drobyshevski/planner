package page.planr.android.core.data.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.seconds
import kotlin.time.Instant

class StoredSessionTest {
    private val now = Instant.fromEpochSeconds(1_780_000_000)

    @Test
    fun `claims come from the JWT payload`() {
        val claims = JwtClaims.parse(TestTokens.jwt(sub = "u-9", exp = 123, extra = ""","client_id":"c1""""))
        assertEquals(JwtClaims("u-9", 123, "c1"), claims)
        assertNull(JwtClaims.parse("not-a-jwt"))
    }

    @Test
    fun `expiry is on the device clock and refresh keeps an unrotated refresh token`() {
        // The server's exp says +3600, but expires_in is measured from our own clock.
        val session = StoredSession.from(
            OAuthTokens(accessToken = TestTokens.jwt(exp = now.epochSeconds + 3600), expiresIn = 3000, refreshToken = "r1"),
            now,
        )!!
        assertEquals(now.epochSeconds + 3000, session.expiresAtEpochSec)
        assertEquals("user-1", session.userId)
        assertNull(session.info()) // member not resolved yet

        assertFalse(session.expiresWithin(60.seconds, now))
        assertTrue(session.expiresWithin(60.seconds, now + 2950.seconds))

        // Without expires_in, the JWT's exp is the fallback.
        val refreshed = session.refreshedWith(OAuthTokens(accessToken = TestTokens.jwt(exp = now.epochSeconds + 7200)), now)
        assertEquals("r1", refreshed.refreshToken)
        assertEquals(now.epochSeconds + 7200, refreshed.expiresAtEpochSec)
    }

    @Test
    fun `a token response without a refresh token is not a session`() {
        assertNull(StoredSession.from(OAuthTokens(accessToken = TestTokens.jwt()), now))
    }
}

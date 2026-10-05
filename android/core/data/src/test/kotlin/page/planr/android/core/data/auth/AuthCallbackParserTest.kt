package page.planr.android.core.data.auth

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AuthCallbackParserTest {
    private val callback = "https://planr.page/app/auth/callback"

    @Test
    fun `matches only the exact callback`() {
        assertTrue(AuthCallbackParser.matches("$callback?code=x&state=y", callback))
        assertTrue(AuthCallbackParser.matches("HTTPS://PLANR.PAGE/app/auth/callback?code=x", callback))
        assertFalse(AuthCallbackParser.matches("https://evil.page/app/auth/callback?code=x", callback))
        assertFalse(AuthCallbackParser.matches("https://planr.page/app/auth/callbackx?code=x", callback))
        assertFalse(AuthCallbackParser.matches("https://planr.page:8443/app/auth/callback", callback))
        assertFalse(AuthCallbackParser.matches("not a uri", callback))
    }

    @Test
    fun `matches only the exact custom-scheme callback`() {
        val scheme = "page.planr.android:/oauth/callback"
        assertTrue(AuthCallbackParser.matches("$scheme?code=x&state=y", scheme))
        assertTrue(AuthCallbackParser.matches(scheme, scheme))
        assertFalse(AuthCallbackParser.matches("page.planr.android:/oauth/other?code=x", scheme))
        assertFalse(AuthCallbackParser.matches("page.planr.android://oauth/callback?code=x", scheme))
        assertFalse(AuthCallbackParser.matches("page.planr.evil:/oauth/callback?code=x", scheme))
        assertFalse(AuthCallbackParser.matches("$callback?code=x", scheme))
        assertFalse(AuthCallbackParser.matches("$scheme?code=x", callback))
    }

    @Test
    fun `parses a custom-scheme callback`() {
        assertEquals(
            AuthCallback.Code("abc-123", "st"),
            AuthCallbackParser.parse("page.planr.android:/oauth/callback?code=abc-123&state=st"),
        )
    }

    @Test
    fun `parses code and state`() {
        assertEquals(
            AuthCallback.Code("abc-123", "s t"),
            AuthCallbackParser.parse("$callback?code=abc-123&state=s%20t"),
        )
    }

    @Test
    fun `parses a denial`() {
        assertEquals(
            AuthCallback.Failure("access_denied", "The user denied", "s"),
            AuthCallbackParser.parse("$callback?error=access_denied&error_description=The+user+denied&state=s"),
        )
    }

    @Test
    fun `no code and no error is not a callback result`() {
        assertNull(AuthCallbackParser.parse("$callback?state=s"))
        assertNull(AuthCallbackParser.parse(callback))
    }
}

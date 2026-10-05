package page.planr.android.core.data.auth

import java.net.URI
import java.net.URLDecoder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class PkceTest {

    @Test
    fun `challenge matches the RFC 7636 appendix B vector`() {
        assertEquals(
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
            Pkce.challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        )
    }

    @Test
    fun `verifier is 43 unreserved characters and fresh each time`() {
        val a = Pkce.generate()
        val b = Pkce.generate()
        assertEquals(43, a.verifier.length)
        assertTrue(a.verifier.all { it.isLetterOrDigit() || it == '-' || it == '_' })
        assertNotEquals(a.verifier, b.verifier)
        assertEquals(Pkce.challengeFor(a.verifier), a.challenge)
        assertNotEquals(Pkce.newState(), Pkce.newState())
    }

    @Test
    fun `authorize URL carries the PKCE and redirect parameters`() {
        val pending = PendingAuthorization(
            state = "st/ate+1",
            codeVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
            redirectUri = TestTokens.config.authCallbackUrl,
            createdAtEpochMs = 0,
        )
        val uri = URI(buildAuthorizeUrl(TestTokens.config, pending))
        assertEquals("https://abc.supabase.co/auth/v1/oauth/authorize", "${uri.scheme}://${uri.host}${uri.path}")
        val params = uri.rawQuery.split('&').associate {
            it.substringBefore('=') to URLDecoder.decode(it.substringAfter('='), "UTF-8")
        }
        assertEquals(
            mapOf(
                "response_type" to "code",
                "client_id" to "client-123",
                "redirect_uri" to "page.planr.android:/oauth/callback",
                "state" to "st/ate+1",
                "code_challenge" to "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
                "code_challenge_method" to "S256",
            ),
            params,
        )
    }
}

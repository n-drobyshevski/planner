package page.planr.android.core.data.auth

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.request.HttpRequestData
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.OutgoingContent
import io.ktor.http.headersOf
import io.ktor.http.parseQueryString
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import kotlinx.coroutines.test.runTest

class KtorOAuthTokenClientTest {
    private val requests = mutableListOf<HttpRequestData>()

    private fun client(status: HttpStatusCode, body: String) = KtorOAuthTokenClient(
        TestTokens.config,
        HttpClient(
            MockEngine { request ->
                requests += request
                respond(body, status, headersOf(HttpHeaders.ContentType, "application/json"))
            },
        ),
    )

    private fun form(request: HttpRequestData) =
        parseQueryString((request.body as OutgoingContent.ByteArrayContent).bytes().decodeToString())

    @Test
    fun `code exchange posts the PKCE form to the token endpoint`() = runTest {
        val tokens = client(
            HttpStatusCode.OK,
            """{"access_token":"at","token_type":"bearer","expires_in":3600,"refresh_token":"rt","scope":"email"}""",
        ).exchangeCode("the-code", "the-verifier", "https://planr.page/app/auth/callback")

        assertEquals(OAuthTokens("at", "bearer", 3600, "rt", "email"), tokens)
        val request = requests.single()
        assertEquals(HttpMethod.Post, request.method)
        assertEquals("https://abc.supabase.co/auth/v1/oauth/token", request.url.toString())
        assertEquals("sb_publishable_test", request.headers["apikey"])
        val form = form(request)
        assertEquals("authorization_code", form["grant_type"])
        assertEquals("the-code", form["code"])
        assertEquals("client-123", form["client_id"])
        assertEquals("https://planr.page/app/auth/callback", form["redirect_uri"])
        assertEquals("the-verifier", form["code_verifier"])
    }

    @Test
    fun `refresh uses the refresh_token grant`() = runTest {
        client(HttpStatusCode.OK, """{"access_token":"at2"}""").refresh("rt")
        val form = form(requests.single())
        assertEquals("refresh_token", form["grant_type"])
        assertEquals("rt", form["refresh_token"])
        assertEquals("client-123", form["client_id"])
    }

    @Test
    fun `errors are classified`() = runTest {
        val rejected = assertFailsWith<OAuthException> {
            client(HttpStatusCode.BadRequest, """{"error":"invalid_grant","error_description":"Refresh token revoked"}""")
                .refresh("rt")
        }
        assertEquals("invalid_grant", rejected.error)
        assertTrue(rejected.isAuthFailure)

        val gotrue = assertFailsWith<OAuthException> {
            client(HttpStatusCode.Unauthorized, """{"code":401,"error_code":"invalid_client","msg":"Unknown client"}""")
                .refresh("rt")
        }
        assertEquals("invalid_client", gotrue.error)
        assertTrue(gotrue.isAuthFailure)

        // Rate limiting is not a dead token: keep the session and retry later.
        val limited = assertFailsWith<OAuthException> {
            client(HttpStatusCode.TooManyRequests, """{"code":429,"error_code":"over_request_rate_limit","msg":"Slow down"}""")
                .refresh("rt")
        }
        assertEquals(false, limited.isAuthFailure)
        assertEquals(false, OAuthException(408, null, null).isAuthFailure)
        assertEquals(false, OAuthException(400, "validation_failed", null).isAuthFailure)

        val outage = assertFailsWith<OAuthException> { client(HttpStatusCode.BadGateway, "oops").refresh("rt") }
        assertEquals(false, outage.isAuthFailure)
    }

    @Test
    fun `revoking posts a local logout with the bearer token`() = runTest {
        client(HttpStatusCode.NoContent, "").revokeSession("at")
        val request = requests.single()
        assertEquals(HttpMethod.Post, request.method)
        assertEquals("https://abc.supabase.co/auth/v1/logout?scope=local", request.url.toString())
        assertEquals("Bearer at", request.headers[HttpHeaders.Authorization])

        // An already-dead session is fine; an outage is reported.
        client(HttpStatusCode.Unauthorized, "{}").revokeSession("at")
        assertFailsWith<OAuthException> { client(HttpStatusCode.BadGateway, "oops").revokeSession("at") }
    }
}

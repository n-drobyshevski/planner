package page.planr.android.core.data.auth

import io.ktor.client.HttpClient
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.isSuccess
import io.ktor.http.parameters
import javax.inject.Inject
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import page.planr.android.core.data.config.PlanrConfig
import page.planr.android.core.model.PlanrJson

/** The token endpoint's success body (RFC 6749 §5.1). */
@Serializable
data class OAuthTokens(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String = "bearer",
    /** Lifetime in seconds (Supabase default 3600). */
    @SerialName("expires_in") val expiresIn: Long? = null,
    /** May be rotated on refresh; absent means "keep the old one". */
    @SerialName("refresh_token") val refreshToken: String? = null,
    val scope: String? = null,
)

/**
 * The token endpoint refused the request. Only a definitive rejection of the
 * grant or the client ([isAuthFailure]) means the refresh token / code is dead
 * and the user has to sign in again. Everything else — 5xx, 408, 429
 * (`over_request_rate_limit`), or a 4xx without a grant error — is transient:
 * the token may still be good, so the caller keeps the session and retries.
 */
class OAuthException(
    val statusCode: Int,
    val error: String?,
    description: String?,
) : Exception(description ?: error ?: "OAuth token request failed ($statusCode)") {
    val isAuthFailure: Boolean
        get() = when {
            statusCode == 408 || statusCode == 429 -> false
            error != null -> error in DEAD_GRANT_ERRORS
            // A bare 400/401 (no parseable body) from the token endpoint is a refusal.
            else -> statusCode == 400 || statusCode == 401
        }

    private companion object {
        /** RFC 6749 §5.2 codes plus GoTrue's `error_code`s for a dead refresh token or session. */
        val DEAD_GRANT_ERRORS = setOf(
            "invalid_grant",
            "invalid_client",
            "unauthorized_client",
            "refresh_token_not_found",
            "refresh_token_already_used",
            "session_not_found",
            "session_expired",
            "user_not_found",
            "user_banned",
        )
    }
}

/** `POST {SUPABASE_URL}/auth/v1/oauth/token` for a public (PKCE) client. */
interface OAuthTokenClient {
    /** `grant_type=authorization_code` with the PKCE verifier. */
    suspend fun exchangeCode(code: String, codeVerifier: String, redirectUri: String): OAuthTokens

    /** `grant_type=refresh_token`. */
    suspend fun refresh(refreshToken: String): OAuthTokens

    /**
     * Ends the session behind [accessToken] on the server
     * (`POST /auth/v1/logout?scope=local`), so its refresh token stops working
     * even if a copy survives on the device. Throws on failure.
     */
    suspend fun revokeSession(accessToken: String)
}

/**
 * Ktor implementation. Public client: `client_id` in the form body, no secret
 * (`token_endpoint_auth_method: none`). The publishable key goes in `apikey`
 * for the Supabase API gateway. Network failures surface as IOExceptions.
 */
class KtorOAuthTokenClient @Inject constructor(
    private val config: PlanrConfig,
    @AuthHttpClient private val http: HttpClient,
) : OAuthTokenClient {

    override suspend fun exchangeCode(code: String, codeVerifier: String, redirectUri: String): OAuthTokens =
        post(
            "grant_type" to "authorization_code",
            "code" to code,
            "client_id" to config.oauthClientId,
            "redirect_uri" to redirectUri,
            "code_verifier" to codeVerifier,
        )

    override suspend fun refresh(refreshToken: String): OAuthTokens =
        post(
            "grant_type" to "refresh_token",
            "refresh_token" to refreshToken,
            "client_id" to config.oauthClientId,
        )

    override suspend fun revokeSession(accessToken: String) {
        val response = http.post(OAuthEndpoints.logout(config.supabaseUrl)) {
            header("apikey", config.supabaseAnonKey)
            header(HttpHeaders.Authorization, "Bearer $accessToken")
        }
        // 401/403/404: the session is already gone, which is what we wanted.
        val gone = response.status.value in setOf(401, 403, 404)
        if (!response.status.isSuccess() && !gone) throw parseError(response.status.value, response.bodyAsText())
    }

    private suspend fun post(vararg fields: Pair<String, String>): OAuthTokens {
        val response = http.submitForm(
            url = OAuthEndpoints.token(config.supabaseUrl),
            formParameters = parameters { fields.forEach { (k, v) -> append(k, v) } },
        ) {
            header("apikey", config.supabaseAnonKey)
        }
        val body = response.bodyAsText()
        if (!response.status.isSuccess()) throw parseError(response.status.value, body)
        return PlanrJson.decodeFromString(OAuthTokens.serializer(), body)
    }

    /** Accepts both the RFC 6749 error shape and GoTrue's `{code, error_code, msg}`. */
    private fun parseError(status: Int, body: String): OAuthException {
        val json = runCatching { PlanrJson.parseToJsonElement(body) as JsonObject }.getOrNull()
        fun field(name: String) = (json?.get(name) as? JsonPrimitive)?.contentOrNull
        return OAuthException(
            statusCode = status,
            error = field("error") ?: field("error_code"),
            description = field("error_description") ?: field("msg") ?: field("message"),
        )
    }
}

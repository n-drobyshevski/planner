package page.planr.android.core.data.auth

import io.ktor.client.HttpClient
import io.ktor.client.request.forms.submitForm
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
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
 * The token endpoint refused the request. A 4xx (`invalid_grant`,
 * `invalid_client`) means the refresh token / code is dead and the user has to
 * sign in again; 5xx is transient.
 */
class OAuthException(
    val statusCode: Int,
    val error: String?,
    description: String?,
) : Exception(description ?: error ?: "OAuth token request failed ($statusCode)") {
    val isAuthFailure: Boolean get() = statusCode in 400..499
}

/** `POST {SUPABASE_URL}/auth/v1/oauth/token` for a public (PKCE) client. */
interface OAuthTokenClient {
    /** `grant_type=authorization_code` with the PKCE verifier. */
    suspend fun exchangeCode(code: String, codeVerifier: String, redirectUri: String): OAuthTokens

    /** `grant_type=refresh_token`. */
    suspend fun refresh(refreshToken: String): OAuthTokens
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

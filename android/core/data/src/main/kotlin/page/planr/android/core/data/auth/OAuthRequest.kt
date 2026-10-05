package page.planr.android.core.data.auth

import java.net.URLEncoder
import kotlinx.serialization.Serializable
import page.planr.android.core.data.config.PlanrConfig

/**
 * Supabase Auth's OAuth 2.1 server endpoints (Dashboard → Authentication →
 * OAuth Server). The authorize endpoint bounces to our consent page
 * (`/oauth/consent`), which approves via `/api/oauth/decision`.
 */
object OAuthEndpoints {
    fun authorize(supabaseUrl: String): String = "${supabaseUrl.trimEnd('/')}/auth/v1/oauth/authorize"

    fun token(supabaseUrl: String): String = "${supabaseUrl.trimEnd('/')}/auth/v1/oauth/token"

    /** GoTrue's logout; `scope=local` ends only this device's session. */
    fun logout(supabaseUrl: String): String = "${supabaseUrl.trimEnd('/')}/auth/v1/logout?scope=local"
}

/**
 * The in-flight sign-in, persisted (encrypted) while the user is in the
 * Custom Tab so it survives the app process being killed meanwhile.
 */
@Serializable
data class PendingAuthorization(
    val state: String,
    val codeVerifier: String,
    val redirectUri: String,
    val createdAtEpochMs: Long,
)

/** Builds the `/oauth/authorize` URL for [pending] (authorization code + PKCE S256). */
fun buildAuthorizeUrl(config: PlanrConfig, pending: PendingAuthorization): String {
    val params = linkedMapOf(
        "response_type" to "code",
        "client_id" to config.oauthClientId,
        "redirect_uri" to pending.redirectUri,
        "state" to pending.state,
        "code_challenge" to Pkce.challengeFor(pending.codeVerifier),
        "code_challenge_method" to "S256",
    )
    return OAuthEndpoints.authorize(config.supabaseUrl) + "?" +
        params.entries.joinToString("&") { (k, v) -> "$k=${formEncode(v)}" }
}

/** `application/x-www-form-urlencoded` value encoding, with `%20` for spaces. */
internal fun formEncode(value: String): String =
    URLEncoder.encode(value, Charsets.UTF_8.name()).replace("+", "%20")

package page.planr.android.core.data.auth

import java.net.URI
import java.net.URLDecoder

/** What the OAuth server sent back to the callback (`page.planr.android:/oauth/callback`). */
sealed interface AuthCallback {
    val state: String?

    /** Approved: an authorization code to exchange. */
    data class Code(val code: String, override val state: String?) : AuthCallback

    /** Denied or failed (`error=access_denied`, `server_error`, ...). */
    data class Failure(
        val error: String,
        val description: String?,
        override val state: String?,
    ) : AuthCallback
}

/**
 * Parses the OAuth callback, a custom-scheme or https URI. Pure JVM
 * (java.net.URI), so it is unit-tested without Android.
 */
object AuthCallbackParser {

    /**
     * True when [uri] is exactly the configured callback (scheme, host, port,
     * path). A custom-scheme callback has no host or port; both sides are then
     * null / -1 and compare equal.
     */
    fun matches(uri: String, callbackUrl: String): Boolean {
        val actual = runCatching { URI(uri) }.getOrNull() ?: return false
        val expected = runCatching { URI(callbackUrl) }.getOrNull() ?: return false
        return actual.scheme.equals(expected.scheme, ignoreCase = true) &&
            actual.host.equals(expected.host, ignoreCase = true) &&
            actual.port == expected.port &&
            actual.rawPath == expected.rawPath
    }

    /** The callback's code or error; null when it carries neither. */
    fun parse(uri: String): AuthCallback? {
        val query = runCatching { URI(uri).rawQuery }.getOrNull() ?: return null
        val params = query.split('&')
            .filter { it.isNotEmpty() }
            .associate { part ->
                val key = part.substringBefore('=')
                val value = part.substringAfter('=', "")
                decode(key) to decode(value)
            }
        val state = params["state"]
        params["error"]?.let { return AuthCallback.Failure(it, params["error_description"], state) }
        val code = params["code"]?.takeIf { it.isNotEmpty() } ?: return null
        return AuthCallback.Code(code, state)
    }

    private fun decode(value: String): String = URLDecoder.decode(value, Charsets.UTF_8.name())
}

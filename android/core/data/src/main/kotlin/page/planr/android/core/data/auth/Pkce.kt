package page.planr.android.core.data.auth

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/** A PKCE pair (RFC 7636): the secret verifier and its S256 challenge. */
data class PkcePair(val verifier: String, val challenge: String)

/**
 * PKCE + `state` generation for the OAuth 2.1 authorization-code flow.
 * Supabase's OAuth server only accepts `code_challenge_method=S256`.
 */
object Pkce {
    private const val VERIFIER_BYTES = 32 // -> 43 base64url chars, the RFC minimum
    private const val STATE_BYTES = 32

    private val base64Url: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()

    fun generate(random: SecureRandom = SecureRandom()): PkcePair {
        val verifier = randomToken(VERIFIER_BYTES, random)
        return PkcePair(verifier, challengeFor(verifier))
    }

    /** `BASE64URL(SHA256(ASCII(verifier)))`, unpadded. */
    fun challengeFor(verifier: String): String =
        base64Url.encodeToString(
            MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)),
        )

    /** An unguessable `state` value binding the callback to this request (CSRF). */
    fun newState(random: SecureRandom = SecureRandom()): String = randomToken(STATE_BYTES, random)

    private fun randomToken(bytes: Int, random: SecureRandom): String =
        base64Url.encodeToString(ByteArray(bytes).also(random::nextBytes))
}

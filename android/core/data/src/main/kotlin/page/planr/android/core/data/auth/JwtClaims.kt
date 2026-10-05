package page.planr.android.core.data.auth

import java.util.Base64
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import page.planr.android.core.model.PlanrJson

/**
 * The claims the app reads from a Supabase access token. The signature is
 * NOT verified here: the token came straight from the token endpoint over
 * TLS, and PostgREST/Realtime verify it on every request anyway.
 */
data class JwtClaims(
    /** The auth user id (`auth.users.id`); `members.auth_user_id` points at it. */
    val subject: String,
    /** Expiry, epoch seconds. */
    val expiresAtEpochSec: Long?,
    /** The OAuth client that obtained the token. */
    val clientId: String?,
) {
    companion object {
        /** Decodes the payload segment; null for anything that isn't a JWT with a `sub`. */
        fun parse(token: String): JwtClaims? {
            val payload = token.split('.').getOrNull(1) ?: return null
            val json = runCatching {
                val bytes = Base64.getUrlDecoder().decode(payload.trimEnd('='))
                PlanrJson.parseToJsonElement(bytes.decodeToString()) as JsonObject
            }.getOrNull() ?: return null
            val sub = (json["sub"] as? JsonPrimitive)?.contentOrNull ?: return null
            return JwtClaims(
                subject = sub,
                expiresAtEpochSec = (json["exp"] as? JsonPrimitive)?.longOrNull,
                clientId = (json["client_id"] as? JsonPrimitive)?.contentOrNull,
            )
        }
    }
}

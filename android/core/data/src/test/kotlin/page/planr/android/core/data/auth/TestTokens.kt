package page.planr.android.core.data.auth

import java.util.Base64
import page.planr.android.core.data.config.PlanrConfig

/** Unsigned JWTs with the claims the app reads. */
object TestTokens {
    private val b64 = Base64.getUrlEncoder().withoutPadding()

    fun jwt(sub: String = "user-1", exp: Long = 1_780_003_600, extra: String = ""): String {
        val header = b64.encodeToString("""{"alg":"ES256","typ":"JWT"}""".toByteArray())
        val payload = b64.encodeToString("""{"sub":"$sub","exp":$exp,"role":"authenticated"$extra}""".toByteArray())
        return "$header.$payload.signature"
    }

    val config = PlanrConfig(
        supabaseUrl = "https://abc.supabase.co",
        supabaseAnonKey = "sb_publishable_test",
        oauthClientId = "client-123",
        webOrigin = "https://planr.page",
    )
}

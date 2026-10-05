package page.planr.android.core.data.config

import kotlin.test.Test
import kotlin.test.assertEquals

class PlanrConfigTest {
    private val base = PlanrConfig(
        supabaseUrl = "https://abc.supabase.co",
        supabaseAnonKey = "key",
        oauthClientId = "client",
        webOrigin = "https://planr.page",
    )

    @Test
    fun `callback is on its own host, not the consent page's`() {
        // Same host as the consent page would keep Chrome from opening the app.
        assertEquals("https://auth.planr.page/app/auth/callback", base.authCallbackUrl)
    }

    @Test
    fun `callback follows a configured origin`() {
        val staging = base.copy(authCallbackOrigin = "https://auth.staging.planr.page/")
        assertEquals("https://auth.staging.planr.page/app/auth/callback", staging.authCallbackUrl)
    }
}

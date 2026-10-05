package page.planr.android.core.data.config

import page.planr.android.core.data.BuildConfig

/**
 * Build-time runtime config (see android/README.md):
 * the Supabase project, the public OAuth client, and the web origin that hosts
 * the consent page.
 */
data class PlanrConfig(
    val supabaseUrl: String,
    /** The publishable (anon) key; safe to ship, RLS does the gating. */
    val supabaseAnonKey: String,
    val oauthClientId: String,
    val webOrigin: String,
) {
    /** False for a build made without config: sign-in shows "not configured". */
    val isConfigured: Boolean
        get() = supabaseUrl.isNotBlank() && supabaseAnonKey.isNotBlank() && oauthClientId.isNotBlank()

    /**
     * The OAuth redirect: a private-use scheme (RFC 8252 §7.1). Not the
     * `https://planr.page/app/auth/callback` App Link — the consent page is on
     * planr.page too, and Chrome keeps a same-host redirect inside the Custom
     * Tab instead of handing it to the app. A custom scheme is always handed off;
     * PKCE keeps a code intercepted by another app useless.
     */
    val authCallbackUrl: String
        get() = AUTH_CALLBACK_URL

    companion object {
        const val AUTH_CALLBACK_URL = "page.planr.android:/oauth/callback"

        fun fromBuildConfig(): PlanrConfig = PlanrConfig(
            supabaseUrl = BuildConfig.PLANR_SUPABASE_URL,
            supabaseAnonKey = BuildConfig.PLANR_SUPABASE_ANON_KEY,
            oauthClientId = BuildConfig.PLANR_OAUTH_CLIENT_ID,
            webOrigin = BuildConfig.PLANR_WEB_ORIGIN,
        )
    }
}

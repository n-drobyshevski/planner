package page.planr.android.core.data.config

import page.planr.android.core.data.BuildConfig

/**
 * Build-time runtime config (see android/README.md):
 * the Supabase project, the public OAuth client, and the web origin that hosts
 * the consent page and the App Link callback.
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

    /** The OAuth redirect, an Android App Link (`/app/auth/callback`). */
    val authCallbackUrl: String
        get() = "${webOrigin.trimEnd('/')}/app/auth/callback"

    companion object {
        fun fromBuildConfig(): PlanrConfig = PlanrConfig(
            supabaseUrl = BuildConfig.PLANR_SUPABASE_URL,
            supabaseAnonKey = BuildConfig.PLANR_SUPABASE_ANON_KEY,
            oauthClientId = BuildConfig.PLANR_OAUTH_CLIENT_ID,
            webOrigin = BuildConfig.PLANR_WEB_ORIGIN,
        )
    }
}

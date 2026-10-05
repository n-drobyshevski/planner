package page.planr.android.core.data.config

import page.planr.android.core.data.BuildConfig

/**
 * Build-time runtime config (see android/README.md):
 * the Supabase project, the public OAuth client, the web origin that hosts
 * the consent page, and the origin of the App Link callback.
 */
data class PlanrConfig(
    val supabaseUrl: String,
    /** The publishable (anon) key; safe to ship, RLS does the gating. */
    val supabaseAnonKey: String,
    val oauthClientId: String,
    val webOrigin: String,
    /**
     * Host of the OAuth App Link. Not [webOrigin]: Chrome keeps a same-host
     * redirect (consent on planr.page → callback) inside the Custom Tab instead
     * of handing it to the app, so the callback lives on its own host.
     */
    val authCallbackOrigin: String = DEFAULT_AUTH_CALLBACK_ORIGIN,
) {
    /** False for a build made without config: sign-in shows "not configured". */
    val isConfigured: Boolean
        get() = supabaseUrl.isNotBlank() && supabaseAnonKey.isNotBlank() && oauthClientId.isNotBlank()

    /** The OAuth redirect, an Android App Link (`/app/auth/callback`). */
    val authCallbackUrl: String
        get() = "${authCallbackOrigin.trimEnd('/')}/app/auth/callback"

    companion object {
        const val DEFAULT_AUTH_CALLBACK_ORIGIN = "https://auth.planr.page"

        fun fromBuildConfig(): PlanrConfig = PlanrConfig(
            supabaseUrl = BuildConfig.PLANR_SUPABASE_URL,
            supabaseAnonKey = BuildConfig.PLANR_SUPABASE_ANON_KEY,
            oauthClientId = BuildConfig.PLANR_OAUTH_CLIENT_ID,
            webOrigin = BuildConfig.PLANR_WEB_ORIGIN,
            authCallbackOrigin = BuildConfig.PLANR_AUTH_CALLBACK_ORIGIN,
        )
    }
}

package page.planr.android.core.data.auth

import page.planr.android.core.data.remote.MemberRef

/** Resolves the planner member for an auth user (`members.auth_user_id = sub`). */
fun interface MemberLookup {
    suspend fun memberFor(authUserId: String): MemberRef?
}

/** Wipes every locally cached row (Room) and refreshes surfaces that show them. */
fun interface LocalDataCleaner {
    suspend fun clearAll()
}

/** The bearer token supabase-kt attaches to PostgREST and Realtime. */
fun interface AccessTokenSource {
    /** A currently valid access token (refreshed if needed), or null when signed out. */
    suspend fun accessToken(): String?
}

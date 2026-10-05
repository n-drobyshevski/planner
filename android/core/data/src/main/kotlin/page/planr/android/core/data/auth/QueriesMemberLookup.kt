package page.planr.android.core.data.auth

import dagger.Lazy
import javax.inject.Inject
import page.planr.android.core.data.remote.MemberRef
import page.planr.android.core.data.remote.WorkspaceQueries

/**
 * [MemberLookup] through PostgREST. Lazy: the Supabase client behind the
 * queries asks [SessionManager] for its token, and SessionManager needs this.
 */
class QueriesMemberLookup @Inject constructor(
    private val queries: Lazy<WorkspaceQueries>,
) : MemberLookup {
    override suspend fun memberFor(authUserId: String): MemberRef? = queries.get().findMemberByAuthUser(authUserId)
}

package page.planr.android.core.data.remote

import javax.inject.Inject
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.model.MemberPreferencesPatch
import page.planr.android.core.model.Member

/** The member's own preference writes (`updateMemberPreferences` in lib/supabase/mutations.ts). */
class MemberMutations @Inject constructor(
    private val gateway: PostgrestGateway,
) {
    /**
     * Writes the set fields of [patch] to [memberId]'s row and returns it as
     * stored. RLS (`members_update_self`) limits this to the signed-in member.
     */
    suspend fun updatePreferences(memberId: String, patch: MemberPreferencesPatch): Member {
        val row = gateway.update(SupabaseTables.MEMBERS, payload(patch), listOf(eq("id", memberId))).firstOrNull()
            ?: error("The member row wasn't updated.")
        return row.decodeAs(Member.serializer())
    }

    internal companion object {
        /** Only the set columns; a null zone is written as SQL null. */
        fun payload(patch: MemberPreferencesPatch): JsonObject = buildJsonObject {
            patch.timezone.ifSet { put("timezone", it) }
            patch.secondaryTimezone.ifSet { put("secondary_timezone", it) }
            patch.showSuccessToasts.ifSet { put("show_success_toasts", it) }
        }
    }
}

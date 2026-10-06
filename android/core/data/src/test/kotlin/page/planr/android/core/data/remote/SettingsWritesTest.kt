package page.planr.android.core.data.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import page.planr.android.core.data.health.SleepBlockPrefs
import page.planr.android.core.data.model.MemberPreferencesPatch
import page.planr.android.core.data.model.SleepPrefsPatch
import page.planr.android.core.recurrence.PatchField

/** The Settings screen's writes: only the edited columns go out. */
class SettingsWritesTest {
    private val gateway = FakePostgrestGateway()

    private val memberRow = Fixtures.row(
        """
        {"id":"${Fixtures.MEMBER_A}","workspace_id":"${Fixtures.WS}","name":"Anna","color":"#c0492a",
         "timezone":"Europe/Berlin","secondary_timezone":null,"show_success_toasts":true}
        """,
    )

    @Test
    fun `member preferences send only the set columns, a cleared zone as null`() = runTest {
        gateway.seed(SupabaseTables.MEMBERS, memberRow)

        val stored = MemberMutations(gateway).updatePreferences(
            Fixtures.MEMBER_A,
            MemberPreferencesPatch(timezone = PatchField.Value(null), showSuccessToasts = PatchField.Value(false)),
        )

        val update = gateway.callsOf<FakePostgrestGateway.Call.Update>().single()
        assertEquals(
            buildJsonObject {
                put("timezone", JsonNull)
                put("show_success_toasts", false)
            },
            update.patch,
        )
        assertEquals(listOf<RowFilter>(RowFilter.Eq("id", Fixtures.MEMBER_A)), update.filters)
        assertNull(stored.timezone)
        assertEquals(false, stored.showSuccessToasts)
    }

    @Test
    fun `a member write that matched no row fails`() = runTest {
        assertFailsWith<IllegalStateException> {
            MemberMutations(gateway).updatePreferences("nobody", MemberPreferencesPatch(showSuccessToasts = PatchField.Value(true)))
        }
    }

    @Test
    fun `sleep settings upsert on member_id with only the edited columns`() = runTest {
        gateway.seed(
            SupabaseTables.MEMBER_SLEEP_PREFS,
            Fixtures.row(
                """
                {"member_id":"${Fixtures.MEMBER_A}","workspace_id":"${Fixtures.WS}","sleep_cycle_length_min":95,
                 "sleep_category_id":"cat-sleep","night_window_start_hour":21,"night_window_end_hour":11,
                 "auto_adjust_sleep_on_feedback":true}
                """,
            ),
        )

        val stored = SleepRemote(gateway).saveBlockPrefs(
            Fixtures.WS,
            Fixtures.MEMBER_A,
            SleepPrefsPatch(autoAdjust = PatchField.Value(false)),
        )

        val upsert = gateway.callsOf<FakePostgrestGateway.Call.Upsert>().single()
        assertEquals("member_id", upsert.onConflict)
        assertEquals(
            buildJsonObject {
                put("member_id", Fixtures.MEMBER_A)
                put("workspace_id", Fixtures.WS)
                put("auto_adjust_sleep_on_feedback", false)
            },
            upsert.rows.single(),
        )
        assertEquals(SleepBlockPrefs("cat-sleep", 21, 11, autoAdjust = false), stored)
        assertEquals(JsonPrimitive(95), gateway.rows(SupabaseTables.MEMBER_SLEEP_PREFS).single()["sleep_cycle_length_min"])
    }

    @Test
    fun `a first sleep save creates the row, a cleared category is written as null`() = runTest {
        val stored = SleepRemote(gateway).saveBlockPrefs(
            Fixtures.WS,
            Fixtures.MEMBER_A,
            SleepPrefsPatch(sleepCategoryId = PatchField.Value(null), nightWindowStartHour = PatchField.Value(22)),
        )

        assertEquals(JsonNull, gateway.callsOf<FakePostgrestGateway.Call.Upsert>().single().rows.single()["sleep_category_id"])
        assertEquals(SleepBlockPrefs(null, 22, 12, autoAdjust = true), stored)
    }

    @Test
    fun `hours outside the database ranges are refused before any write`() {
        assertFailsWith<IllegalArgumentException> { SleepPrefsPatch(nightWindowStartHour = PatchField.Value(3)) }
        assertFailsWith<IllegalArgumentException> { SleepPrefsPatch(nightWindowEndHour = PatchField.Value(20)) }
    }

    @Test
    fun `patches stack and unstack field by field`() {
        val first = MemberPreferencesPatch(timezone = PatchField.Value("Asia/Tokyo"))
        val second = MemberPreferencesPatch(timezone = PatchField.Value("UTC"), showSuccessToasts = PatchField.Value(false))
        val pending = first + second

        assertEquals(second, pending)
        assertEquals(MemberPreferencesPatch(showSuccessToasts = PatchField.Value(false)), pending.without(second.copy(showSuccessToasts = PatchField.Unchanged)))
        assertEquals(pending, pending.without(first), "a later value is kept when the earlier write lands")
    }
}

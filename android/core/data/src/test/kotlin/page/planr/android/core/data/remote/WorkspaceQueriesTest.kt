package page.planr.android.core.data.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Instant
import kotlinx.coroutines.test.runTest
import page.planr.android.core.model.TimeWindow

class WorkspaceQueriesTest {

    private val window = TimeWindow(Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-06-08T00:00:00Z"))

    @Test
    fun `fetchWindow keeps fetchWindow's filters and post-filter`() = runTest {
        val gateway = FakePostgrestGateway().apply {
            seed(
                SupabaseTables.EVENTS,
                Fixtures.eventRow(id = "inside"),
                // Single event that ended before the window: dropped.
                Fixtures.eventRow(id = "past", start = "2026-05-01T09:00:00+00:00", end = "2026-05-01T10:00:00+00:00"),
                // Open-ended series from the past: kept for expansion.
                Fixtures.eventRow(id = "series", start = "2026-01-05T09:00:00+00:00", end = "2026-01-05T10:00:00+00:00", rrule = "FREQ=WEEKLY"),
                // Series that ended before the window: dropped.
                Fixtures.eventRow(
                    id = "ended",
                    start = "2026-01-05T09:00:00+00:00",
                    end = "2026-01-05T10:00:00+00:00",
                    rrule = "FREQ=DAILY;COUNT=3",
                    recurrenceEndsAt = "2026-01-07T09:00:00+00:00",
                ),
                // Starts after the window: excluded server-side.
                Fixtures.eventRow(id = "later", start = "2026-06-09T09:00:00+00:00", end = "2026-06-09T10:00:00+00:00"),
            )
        }
        val data = WorkspaceQueries(gateway).fetchWindow(Fixtures.WS, window)

        assertEquals(setOf("inside", "series"), data.events.map { it.id }.toSet())
        val select = gateway.callsOf<FakePostgrestGateway.Call.Select>()
        assertEquals(
            listOf(RowFilter.Eq("workspace_id", Fixtures.WS), RowFilter.Lt("starts_at", "2026-06-08T00:00:00.000Z")),
            select[0].filters,
        )
        assertEquals(listOf(RowOrder("starts_at")), select[0].order)
        assertEquals(SupabaseTables.EVENT_OVERRIDES, select[1].table)
        assertTrue(select[1].filters.single() is RowFilter.In)
    }

    @Test
    fun `no events means no override query`() = runTest {
        val gateway = FakePostgrestGateway()
        val data = WorkspaceQueries(gateway).fetchWindow(Fixtures.WS, window)
        assertTrue(data.events.isEmpty())
        assertEquals(1, gateway.calls.size)
    }

    @Test
    fun `member lookup matches auth_user_id like verifyMcpToken`() = runTest {
        val gateway = FakePostgrestGateway().apply {
            seed(
                SupabaseTables.MEMBERS,
                Fixtures.row("""{"id":"m1","workspace_id":"${Fixtures.WS}","auth_user_id":"user-1"}"""),
            )
        }
        val queries = WorkspaceQueries(gateway)
        assertEquals(MemberRef("m1", Fixtures.WS), queries.findMemberByAuthUser("user-1"))
        assertNull(queries.findMemberByAuthUser("someone-else"))
        assertEquals("id, workspace_id", gateway.callsOf<FakePostgrestGateway.Call.Select>().first().columns)
    }

    @Test
    fun `fetchTasks orders by position then created_at`() = runTest {
        val gateway = FakePostgrestGateway().apply { seed(SupabaseTables.TASKS, Fixtures.taskRow()) }
        val tasks = WorkspaceQueries(gateway).fetchTasks(Fixtures.WS)
        assertEquals("Buy paint", tasks.single().title)
        assertEquals(
            listOf(RowOrder("position"), RowOrder("created_at")),
            gateway.callsOf<FakePostgrestGateway.Call.Select>().single().order,
        )
    }
}

package page.planr.android.core.data.remote

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Duration.Companion.days
import kotlin.time.Instant
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import page.planr.android.core.model.TimeWindow

class WorkspaceQueriesTest {

    private val window = TimeWindow(Instant.parse("2026-06-01T00:00:00Z"), Instant.parse("2026-06-08T00:00:00Z"))

    @Test
    fun `fetchWindow bounds the query server-side and keeps the post-filter`() = runTest {
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
        val pages = gateway.callsOf<FakePostgrestGateway.Call.SelectPage>()
        assertEquals(
            listOf(
                RowFilter.Eq("workspace_id", Fixtures.WS),
                RowFilter.Lt("starts_at", "2026-06-08T00:00:00.000Z"),
                RowFilter.AnyOf(
                    listOf(RowFilter.IsNull("rrule", negate = true), RowFilter.Gte("ends_at", "2026-06-01T00:00:00.000Z")),
                ),
            ),
            pages[0].filters,
        )
        assertEquals(listOf(RowOrder("id")), pages[0].order)
        assertEquals(500L, pages[0].limit)
        assertEquals(SupabaseTables.EVENT_OVERRIDES, pages[1].table)
        assertTrue(pages[1].filters.single() is RowFilter.In)
        assertTrue(gateway.callsOf<FakePostgrestGateway.Call.Select>().isEmpty())
    }

    @Test
    fun `the window bound keeps a one-off ending exactly at the start`() = runTest {
        val gateway = FakePostgrestGateway().apply {
            seed(
                SupabaseTables.EVENTS,
                Fixtures.eventRow(id = "at-start", start = "2026-05-31T23:00:00+00:00", end = "2026-06-01T00:00:00+00:00"),
                Fixtures.eventRow(id = "just-before", start = "2026-05-31T23:00:00+00:00", end = "2026-05-31T23:59:59.999+00:00"),
                Fixtures.eventRow(
                    id = "ended-series",
                    start = "2026-01-05T09:00:00+00:00",
                    end = "2026-01-05T10:00:00+00:00",
                    rrule = "FREQ=DAILY;COUNT=3",
                    recurrenceEndsAt = "2026-01-07T09:00:00+00:00",
                ),
            )
        }
        val data = WorkspaceQueries(gateway).fetchWindow(Fixtures.WS, window)

        assertEquals(listOf("at-start"), data.events.map { it.id })
        // What the server sent: the old one-off is excluded there, the ended
        // series is sent (rrule is set) and only dropped by mayIntersect.
        val first = gateway.callsOf<FakePostgrestGateway.Call.SelectPage>().first()
        val served = gateway.selectPage(first.table, first.columns, first.filters, first.order, first.limit)
        assertEquals(setOf("at-start", "ended-series"), served.rows.map { it.string("id") }.toSet())
    }

    @Test
    fun `events page by id until the count is exhausted`() = runTest {
        val gateway = FakePostgrestGateway().apply { seed(SupabaseTables.EVENTS, *events(1_203)) }
        val data = WorkspaceQueries(gateway).fetchWindow(Fixtures.WS, window)

        val ids = data.events.map { it.id }
        assertEquals(1_203, ids.size)
        assertEquals(ids.toSet().size, ids.size)
        val pages = eventPages(gateway)
        assertEquals(3, pages.size)
        assertTrue(pages[0].filters.none { it is RowFilter.Gt })
        assertEquals(RowFilter.Gt("id", ids[499]), pages[1].filters.last())
        assertEquals(RowFilter.Gt("id", ids[999]), pages[2].filters.last())
    }

    @Test
    fun `an exact multiple of the page size takes no extra empty page`() = runTest {
        val gateway = FakePostgrestGateway().apply { seed(SupabaseTables.EVENTS, *events(1_000)) }
        val data = WorkspaceQueries(gateway).fetchWindow(Fixtures.WS, window)

        assertEquals(1_000, data.events.size)
        assertEquals(2, eventPages(gateway).size)
    }

    @Test
    fun `short pages from a low max_rows don't end the fetch early`() = runTest {
        val gateway = FakePostgrestGateway(maxRows = 300).apply { seed(SupabaseTables.EVENTS, *events(1_203)) }
        val data = WorkspaceQueries(gateway).fetchWindow(Fixtures.WS, window)

        assertEquals(1_203, data.events.map { it.id }.toSet().size)
        assertEquals(5, eventPages(gateway).size)
    }

    @Test
    fun `overrides are fetched in chunks of 120 event ids, in chunk order`() = runTest {
        val rows = events(250)
        val gateway = FakePostgrestGateway().apply {
            seed(SupabaseTables.EVENTS, *rows)
            rows.reversed().forEach { seed(SupabaseTables.EVENT_OVERRIDES, overrideRow(it.string("id")!!, "ov-${it.string("id")}")) }
        }
        val data = WorkspaceQueries(gateway).fetchWindow(Fixtures.WS, window)

        val chunks = overridePages(gateway).map { (it.filters.single() as RowFilter.In).values }
        assertEquals(listOf(120, 120, 10), chunks.map { it.size })
        assertEquals(data.events.map { it.id }, chunks.flatten())
        assertEquals(250, data.overrides.size)
        assertEquals(data.events.map { it.id }, data.overrides.map { it.eventId })
    }

    @Test
    fun `one event's overrides page too`() = runTest {
        val gateway = FakePostgrestGateway().apply {
            seed(SupabaseTables.EVENTS, Fixtures.eventRow(id = "busy"))
            repeat(700) { seed(SupabaseTables.EVENT_OVERRIDES, overrideRow("busy", "ov-%04d".format(it), day = it)) }
        }
        val data = WorkspaceQueries(gateway).fetchWindow(Fixtures.WS, window)

        assertEquals(700, data.overrides.map { it.id }.toSet().size)
        assertEquals(2, overridePages(gateway).size)
    }

    @Test
    fun `at most four override chunks are in flight at once`() = runTest {
        val fake = FakePostgrestGateway().apply { seed(SupabaseTables.EVENTS, *events(1_000)) } // 9 chunks
        val release = CompletableDeferred<Unit>()
        var inFlight = 0
        var maxInFlight = 0
        val gated = object : PostgrestGateway by fake {
            override suspend fun selectPage(
                table: String,
                columns: String,
                filters: List<RowFilter>,
                order: List<RowOrder>,
                limit: Long,
            ): SelectPage {
                if (table != SupabaseTables.EVENT_OVERRIDES) return fake.selectPage(table, columns, filters, order, limit)
                inFlight++
                maxInFlight = maxOf(maxInFlight, inFlight)
                try {
                    release.await()
                    return fake.selectPage(table, columns, filters, order, limit)
                } finally {
                    inFlight--
                }
            }
        }
        val fetch = async { WorkspaceQueries(gated).fetchWindow(Fixtures.WS, window) }
        runCurrent()
        assertEquals(4, inFlight)

        release.complete(Unit)
        assertEquals(1_000, fetch.await().events.size)
        assertEquals(4, maxInFlight)
        assertEquals(9, overridePages(fake).size)
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
    fun `calendar blocks of tasks are looked up by task_id, one row is enough`() = runTest {
        val block = JsonObject(Fixtures.eventRow() + ("task_id" to JsonPrimitive(Fixtures.TASK_ID)))
        val gateway = FakePostgrestGateway().apply { seed(SupabaseTables.EVENTS, block) }
        val queries = WorkspaceQueries(gateway)

        assertTrue(queries.hasEventsOfTasks(Fixtures.WS, listOf("other", Fixtures.TASK_ID)))
        assertFalse(queries.hasEventsOfTasks(Fixtures.WS, listOf("other")))
        val select = gateway.callsOf<FakePostgrestGateway.Call.Select>().first()
        assertEquals(SupabaseTables.EVENTS, select.table)
        assertEquals("id", select.columns)
        assertEquals(1L, select.limit)
        assertEquals(RowFilter.In("task_id", listOf("other", Fixtures.TASK_ID)), select.filters.last())
    }

    @Test
    fun `a long subtree is asked about in chunks`() = runTest {
        val gateway = FakePostgrestGateway()
        val ids = (0 until 250).map { "task-$it" }
        assertFalse(WorkspaceQueries(gateway).hasEventsOfTasks(Fixtures.WS, ids))
        assertEquals(3, gateway.callsOf<FakePostgrestGateway.Call.Select>().size)
    }

    @Test
    fun `fetchTasks pages by id and orders by position then created_at`() = runTest {
        val gateway = FakePostgrestGateway().apply { seed(SupabaseTables.TASKS, Fixtures.taskRow()) }
        val tasks = WorkspaceQueries(gateway).fetchTasks(Fixtures.WS)
        assertEquals("Buy paint", tasks.single().title)
        val page = gateway.callsOf<FakePostgrestGateway.Call.SelectPage>().single()
        assertEquals(listOf(RowFilter.Eq("workspace_id", Fixtures.WS)), page.filters)
        assertEquals(listOf(RowOrder("id")), page.order)
    }

    @Test
    fun `fetchTasks returns every task past max_rows, sorted`() = runTest {
        // Ids ascend while positions cycle, so the server's id order isn't the result order.
        val rows = (0 until 1_203).map { i ->
            JsonObject(
                Fixtures.taskRow(id = "task-%05d".format(i)) + mapOf(
                    "position" to JsonPrimitive((i % 7).toDouble()),
                    "created_at" to JsonPrimitive("2026-05-01T10:%02d:%02d+00:00".format(i / 60 % 60, i % 60)),
                ),
            )
        }
        val gateway = FakePostgrestGateway().apply { seed(SupabaseTables.TASKS, *rows.toTypedArray()) }
        val tasks = WorkspaceQueries(gateway).fetchTasks(Fixtures.WS)

        assertEquals(1_203, tasks.map { it.id }.toSet().size)
        assertEquals(3, gateway.callsOf<FakePostgrestGateway.Call.SelectPage>().size)
        assertEquals(tasks.sortedWith(compareBy({ it.position }, { it.createdAt })), tasks)
        assertTrue(tasks.zipWithNext().any { (a, b) -> a.id > b.id })
    }

    private fun events(count: Int): Array<JsonObject> =
        Array(count) { Fixtures.eventRow(id = "ev-%05d".format(it)) }

    private fun eventPages(gateway: FakePostgrestGateway) =
        gateway.callsOf<FakePostgrestGateway.Call.SelectPage>().filter { it.table == SupabaseTables.EVENTS }

    private fun overridePages(gateway: FakePostgrestGateway) =
        gateway.callsOf<FakePostgrestGateway.Call.SelectPage>().filter { it.table == SupabaseTables.EVENT_OVERRIDES }

    private fun overrideRow(eventId: String, id: String, day: Int = 0) = Fixtures.row(
        """
        {
          "id": "$id",
          "workspace_id": "${Fixtures.WS}",
          "event_id": "$eventId",
          "occurrence_date": "${Instant.parse("2026-06-01T09:00:00Z") + day.days}",
          "type": "cancel"
        }
        """,
    )
}

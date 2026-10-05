package page.planr.android.core.data.remote

import io.github.jan.supabase.postgrest.PropertyConversionMethod
import io.github.jan.supabase.postgrest.query.filter.PostgrestFilterBuilder
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * supabase-kt keeps only the first filter per column; the gateway must turn
 * the `updated_at` guard into one logical `and=(...)` group. The `or` group
 * `fetchWindow` sends is pinned here exactly as PostgREST documents it.
 */
class SupabaseFilterTest {

    @Test
    fun `two filters on one column become a quoted and group`() {
        val builder = PostgrestFilterBuilder(PropertyConversionMethod.NONE)
        builder.apply(listOf(eq("id", "e1")) + updatedAtGuard(kotlin.time.Instant.parse("2026-05-20T08:15:30.123Z")))
        assertEquals(
            mapOf(
                "id" to listOf("eq.e1"),
                "and" to listOf("(updated_at.gte.\"2026-05-20T08:15:30.123Z\",updated_at.lt.\"2026-05-20T08:15:30.124Z\")"),
            ),
            builder.params,
        )
    }

    @Test
    fun `in filter renders a parenthesised list`() {
        val builder = PostgrestFilterBuilder(PropertyConversionMethod.NONE)
        builder.apply(listOf(isIn("event_id", listOf("a", "b"))))
        assertEquals(mapOf("event_id" to listOf("in.(a,b)")), builder.params)
    }

    @Test
    fun `a quoted in filter keeps free text values whole`() {
        val builder = PostgrestFilterBuilder(PropertyConversionMethod.NONE)
        builder.apply(listOf(isInQuoted("attributes->>icalUid", listOf("a,b@x", "(c)"))))
        assertEquals(mapOf("attributes->>icalUid" to listOf("in.(\"a,b@x\",\"(c)\")")), builder.params)
    }

    @Test
    fun `anyOf renders one or group with quoted values and a bare null`() {
        val builder = PostgrestFilterBuilder(PropertyConversionMethod.NONE)
        builder.apply(listOf(anyOf(isNotNull("rrule"), gte("ends_at", "2026-06-01T00:00:00.000Z"))))
        assertEquals(
            mapOf("or" to listOf("(rrule.not.is.null,ends_at.gte.\"2026-06-01T00:00:00.000Z\")")),
            builder.params,
        )
    }

    @Test
    fun `anyOf children are always quoted`() {
        val builder = PostgrestFilterBuilder(PropertyConversionMethod.NONE)
        builder.apply(listOf(eq("workspace_id", "w1"), anyOf(eq("title", "a,b"), gt("id", "e1"), isNull("rrule"))))
        assertEquals(
            mapOf(
                "workspace_id" to listOf("eq.w1"),
                "or" to listOf("(title.eq.\"a,b\",id.gt.\"e1\",rrule.is.null)"),
            ),
            builder.params,
        )
    }

    @Test
    fun `gt and isNull render bare at the top level`() {
        val gtBuilder = PostgrestFilterBuilder(PropertyConversionMethod.NONE)
        gtBuilder.apply(listOf(gt("id", "e1")))
        assertEquals(mapOf("id" to listOf("gt.e1")), gtBuilder.params)

        val nullBuilder = PostgrestFilterBuilder(PropertyConversionMethod.NONE)
        nullBuilder.apply(listOf(isNull("rrule")))
        assertEquals(mapOf("rrule" to listOf("is.null")), nullBuilder.params)
    }

    @Test
    fun `two anyOf groups throw instead of repeating or`() {
        val builder = PostgrestFilterBuilder(PropertyConversionMethod.NONE)
        assertFailsWith<IllegalArgumentException> {
            builder.apply(listOf(anyOf(isNull("rrule")), anyOf(gt("id", "e1"))))
        }
    }
}

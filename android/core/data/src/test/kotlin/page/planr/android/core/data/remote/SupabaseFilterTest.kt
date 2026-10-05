package page.planr.android.core.data.remote

import io.github.jan.supabase.postgrest.PropertyConversionMethod
import io.github.jan.supabase.postgrest.query.filter.PostgrestFilterBuilder
import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * supabase-kt keeps only the first filter per column; the gateway must turn
 * the `updated_at` guard into one logical `and=(...)` group.
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
}

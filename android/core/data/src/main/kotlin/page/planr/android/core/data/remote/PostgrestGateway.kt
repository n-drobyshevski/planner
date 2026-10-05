package page.planr.android.core.data.remote

import kotlinx.serialization.json.JsonObject

/**
 * The handful of PostgREST table operations the app performs, as plain rows
 * (`JsonObject`, snake_case columns exactly as PostgREST returns them).
 *
 * The queries and mutations are written against this seam instead of
 * supabase-kt directly, so their column payloads and filters can be asserted
 * in plain JVM tests (see `FakePostgrestGateway`). [SupabasePostgrestGateway]
 * is the production implementation. RLS applies to every call.
 */
interface PostgrestGateway {

    /** `select(columns)` with AND-ed [filters], [order] and an optional [limit]. */
    suspend fun select(
        table: String,
        columns: String = "*",
        filters: List<RowFilter> = emptyList(),
        order: List<RowOrder> = emptyList(),
        limit: Long? = null,
    ): List<JsonObject>

    /**
     * One page of a `select`, plus the exact number of rows matching
     * [filters] (`Prefer: count=exact`). Paginated reads use this: the count,
     * not a short page, tells them when they're done, since a server whose
     * `max_rows` is below [limit] returns short pages too.
     */
    suspend fun selectPage(
        table: String,
        columns: String = "*",
        filters: List<RowFilter>,
        order: List<RowOrder>,
        limit: Long,
    ): SelectPage

    /** Inserts [rows] and returns them as stored (`.insert(...).select()`). */
    suspend fun insert(table: String, rows: List<JsonObject>): List<JsonObject>

    /**
     * Updates the rows matching [filters] with [patch] and returns them
     * (`.update(...).select()`). An empty result means nothing matched, which
     * the optimistic-concurrency guard reads as a stale write.
     */
    suspend fun update(table: String, patch: JsonObject, filters: List<RowFilter>): List<JsonObject>

    /** Upsert merging on the UNIQUE [onConflict] columns; returns the stored rows. */
    suspend fun upsert(table: String, rows: List<JsonObject>, onConflict: String): List<JsonObject>

    /** Deletes the rows matching [filters]. */
    suspend fun delete(table: String, filters: List<RowFilter>)
}

/** One PostgREST filter. Values are already in their wire form (ISO strings, uuids). */
sealed interface RowFilter {
    val column: String

    data class Eq(override val column: String, val value: String) : RowFilter

    data class Lt(override val column: String, val value: String) : RowFilter

    data class Gte(override val column: String, val value: String) : RowFilter

    /**
     * `column=in.(…)`. Uuids go bare; with [quoted] every value is
     * double-quoted, so free text holding `,` `(` `)` stays one value.
     */
    data class In(override val column: String, val values: List<String>, val quoted: Boolean = false) : RowFilter

    data class Gt(override val column: String, val value: String) : RowFilter

    /** `column.is.null`, or `column.not.is.null` when [negate]. */
    data class IsNull(override val column: String, val negate: Boolean = false) : RowFilter

    /**
     * PostgREST logical `or=(…)` over [filters]; their values are rendered
     * quoted. At most one per query.
     */
    data class AnyOf(val filters: List<RowFilter>) : RowFilter {
        override val column: String get() = "or"
    }
}

/** One page of rows and the exact number of rows matching the filters; null if the server sent none. */
data class SelectPage(val rows: List<JsonObject>, val total: Long?)

/** An ORDER BY term. */
data class RowOrder(val column: String, val ascending: Boolean = true)

/** Shorthands that read like the web's query builder chain. */
internal fun eq(column: String, value: String) = RowFilter.Eq(column, value)
internal fun lt(column: String, value: String) = RowFilter.Lt(column, value)
internal fun gte(column: String, value: String) = RowFilter.Gte(column, value)
internal fun isIn(column: String, values: List<String>) = RowFilter.In(column, values)
internal fun isInQuoted(column: String, values: List<String>) = RowFilter.In(column, values, quoted = true)
internal fun gt(column: String, value: String) = RowFilter.Gt(column, value)
internal fun isNull(column: String) = RowFilter.IsNull(column)
internal fun isNotNull(column: String) = RowFilter.IsNull(column, negate = true)
internal fun anyOf(vararg filters: RowFilter) = RowFilter.AnyOf(filters.toList())

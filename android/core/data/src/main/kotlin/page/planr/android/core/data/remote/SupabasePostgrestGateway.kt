package page.planr.android.core.data.remote

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.postgrest.query.filter.PostgrestFilterBuilder
import io.ktor.http.HttpStatusCode
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonObject
import page.planr.android.core.data.auth.AccessTokenSource

/**
 * [PostgrestGateway] over supabase-kt's PostgREST plugin.
 *
 * A 401 (`JWT expired`, a revoked session) forces one token refresh and one
 * retry: the proactive refresh works off the device clock and can't know
 * about a server-side revocation.
 */
@Singleton
class SupabasePostgrestGateway @Inject constructor(
    private val supabase: SupabaseClient,
    private val tokens: AccessTokenSource,
) : PostgrestGateway {

    override suspend fun select(
        table: String,
        columns: String,
        filters: List<RowFilter>,
        order: List<RowOrder>,
        limit: Long?,
    ): List<JsonObject> = retryingUnauthorized {
        supabase.from(table).select(Columns.raw(columns)) {
            filter { apply(filters) }
            order.forEach { order(it.column, if (it.ascending) Order.ASCENDING else Order.DESCENDING) }
            limit?.let { limit(it) }
        }.decodeList<JsonObject>()
    }

    override suspend fun insert(table: String, rows: List<JsonObject>): List<JsonObject> = retryingUnauthorized {
        supabase.from(table).insert(rows) { select() }.decodeList<JsonObject>()
    }

    override suspend fun update(
        table: String,
        patch: JsonObject,
        filters: List<RowFilter>,
    ): List<JsonObject> = retryingUnauthorized {
        supabase.from(table).update(patch) {
            select()
            filter { apply(filters) }
        }.decodeList<JsonObject>()
    }

    override suspend fun upsert(
        table: String,
        rows: List<JsonObject>,
        onConflict: String,
    ): List<JsonObject> = retryingUnauthorized {
        supabase.from(table).upsert(rows) {
            this.onConflict = onConflict
            select()
        }.decodeList<JsonObject>()
    }

    override suspend fun delete(table: String, filters: List<RowFilter>) = retryingUnauthorized {
        supabase.from(table).delete { filter { apply(filters) } }
        Unit
    }

    /**
     * Runs [request]; on a 401 refreshes the token the request was sent with
     * and runs it once more. Every request here is safe to repeat: a 401 is
     * returned before PostgREST touches the database.
     */
    private suspend fun <T> retryingUnauthorized(request: suspend () -> T): T {
        val sentWith = tokens.accessToken() // the same cached token supabase-kt attaches
        return try {
            request()
        } catch (e: RestException) {
            if (e.statusCode != HttpStatusCode.Unauthorized.value) throw e
            tokens.refreshRejected(sentWith) ?: throw e
            request()
        }
    }
}

/**
 * Adds [filters] to a supabase-kt filter block.
 *
 * supabase-kt 3.2 keeps only the FIRST filter per column in the URL, so two
 * filters on one column (the `updated_at` concurrency guard's `gte` + `lt`)
 * would silently drop the second. Those are sent as one PostgREST logical
 * `and=(col.gte."…",col.lt."…")` group instead — the same predicate. Values
 * are double-quoted there because ISO timestamps contain `.` and `:`, which
 * are reserved inside logical expressions.
 */
internal fun PostgrestFilterBuilder.apply(filters: List<RowFilter>) {
    filters.groupBy { it.column }.forEach { (_, group) ->
        if (group.size == 1) {
            addFilter(group.single(), quoted = false)
        } else {
            and { group.forEach { addFilter(it, quoted = true) } }
        }
    }
}

private fun PostgrestFilterBuilder.addFilter(filter: RowFilter, quoted: Boolean) {
    fun v(value: String) = if (quoted) "\"$value\"" else value
    when (filter) {
        is RowFilter.Eq -> filter(filter.column, FilterOperator.EQ, v(filter.value))
        is RowFilter.Lt -> filter(filter.column, FilterOperator.LT, v(filter.value))
        is RowFilter.Gte -> filter(filter.column, FilterOperator.GTE, v(filter.value))
        is RowFilter.In -> filter(filter.column, FilterOperator.IN, filter.values.joinToString(",", "(", ")"))
    }
}

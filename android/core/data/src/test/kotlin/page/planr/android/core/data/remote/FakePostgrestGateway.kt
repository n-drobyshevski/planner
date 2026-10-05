package page.planr.android.core.data.remote

import kotlin.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * An in-memory PostgREST: tables of raw rows, filters evaluated like
 * Postgres would (timestamps compared as instants), and an `updated_at`
 * "trigger" that stamps every UPDATE with a fresh microsecond time. Records
 * every call so tests can assert the exact payloads and filters.
 */
class FakePostgrestGateway(
    private var nowMicros: Long = 1_780_000_000_000_000L,
) : PostgrestGateway {

    val tables = mutableMapOf<String, MutableList<JsonObject>>()
    val calls = mutableListOf<Call>()

    sealed interface Call {
        val table: String

        data class Select(override val table: String, val columns: String, val filters: List<RowFilter>, val order: List<RowOrder>, val limit: Long?) : Call
        data class Insert(override val table: String, val rows: List<JsonObject>) : Call
        data class Update(override val table: String, val patch: JsonObject, val filters: List<RowFilter>) : Call
        data class Upsert(override val table: String, val rows: List<JsonObject>, val onConflict: String) : Call
        data class Delete(override val table: String, val filters: List<RowFilter>) : Call
    }

    fun seed(table: String, vararg rows: JsonObject) {
        tables.getOrPut(table) { mutableListOf() }.addAll(rows)
    }

    fun rows(table: String): List<JsonObject> = tables[table].orEmpty()

    inline fun <reified C : Call> callsOf(): List<C> = calls.filterIsInstance<C>()

    override suspend fun select(
        table: String,
        columns: String,
        filters: List<RowFilter>,
        order: List<RowOrder>,
        limit: Long?,
    ): List<JsonObject> {
        calls += Call.Select(table, columns, filters, order, limit)
        val matched = rows(table).filter { row -> filters.all { it.matches(row) } }
        return if (limit != null) matched.take(limit.toInt()) else matched
    }

    override suspend fun insert(table: String, rows: List<JsonObject>): List<JsonObject> {
        calls += Call.Insert(table, rows)
        val stored = rows.map { row -> withServerColumns(row) }
        tables.getOrPut(table) { mutableListOf() }.addAll(stored)
        return stored
    }

    override suspend fun update(table: String, patch: JsonObject, filters: List<RowFilter>): List<JsonObject> {
        calls += Call.Update(table, patch, filters)
        val list = tables[table] ?: return emptyList()
        val updated = mutableListOf<JsonObject>()
        list.replaceAll { row ->
            if (filters.all { it.matches(row) }) {
                JsonObject(row + patch + ("updated_at" to JsonPrimitive(nextTimestamp()))).also { updated += it }
            } else {
                row
            }
        }
        return updated
    }

    override suspend fun upsert(table: String, rows: List<JsonObject>, onConflict: String): List<JsonObject> {
        calls += Call.Upsert(table, rows, onConflict)
        val keys = onConflict.split(',').map { it.trim() }
        val list = tables.getOrPut(table) { mutableListOf() }
        return rows.map { row ->
            val index = list.indexOfFirst { existing -> keys.all { k -> sameValue(existing[k], row[k]) } }
            if (index >= 0) {
                JsonObject(list[index] + row).also { list[index] = it }
            } else {
                withServerColumns(row).also { list += it }
            }
        }
    }

    override suspend fun delete(table: String, filters: List<RowFilter>) {
        calls += Call.Delete(table, filters)
        tables[table]?.removeAll { row -> filters.all { it.matches(row) } }
    }

    /** id / created_at / updated_at defaults, like the DB columns. */
    private fun withServerColumns(row: JsonObject): JsonObject {
        val now = JsonPrimitive(nextTimestamp())
        val defaults = mapOf(
            "id" to JsonPrimitive("gen-${calls.size}-${row.hashCode().toUInt()}"),
            "created_at" to now,
            "updated_at" to now,
        )
        return JsonObject(defaults + row)
    }

    /** Postgres text form with microseconds, like real `updated_at` values. */
    private fun nextTimestamp(): String {
        nowMicros += 1_234_567 // ~1.2 s later, never on a whole millisecond
        val instant = Instant.fromEpochMilliseconds(nowMicros / 1000)
        val micros = (nowMicros % 1_000_000).toString().padStart(6, '0')
        val base = instant.toString().substring(0, 19).replace('T', ' ')
        return "$base.$micros+00"
    }
}

private fun RowFilter.matches(row: JsonObject): Boolean {
    val actual = (row[column] as? JsonPrimitive)?.contentOrNull
    return when (this) {
        is RowFilter.Eq -> actual != null && compare(actual, value) == 0
        is RowFilter.Lt -> actual != null && compare(actual, value) < 0
        is RowFilter.Gte -> actual != null && compare(actual, value) >= 0
        is RowFilter.In -> actual != null && values.any { compare(actual, it) == 0 }
    }
}

private fun sameValue(a: Any?, b: Any?): Boolean {
    val x = (a as? JsonPrimitive)?.contentOrNull ?: return false
    val y = (b as? JsonPrimitive)?.contentOrNull ?: return false
    return compare(x, y) == 0
}

/** Timestamps compare as instants (any text form), numbers numerically, else as text. */
private fun compare(a: String, b: String): Int {
    val ia = parseInstant(a)
    val ib = parseInstant(b)
    if (ia != null && ib != null) return ia.compareTo(ib)
    val da = a.toDoubleOrNull()
    val db = b.toDoubleOrNull()
    if (da != null && db != null) return da.compareTo(db)
    return a.compareTo(b)
}

private fun parseInstant(text: String): Instant? =
    if (text.length >= 19 && text[4] == '-' && text[7] == '-') {
        runCatching { page.planr.android.core.model.PostgresInstantSerializer.parse(text) }.getOrNull()
    } else {
        null
    }

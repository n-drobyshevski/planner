package page.planr.android.core.model

import kotlin.time.Instant
import kotlinx.serialization.KSerializer
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.descriptors.SerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder

/**
 * Postgres `timestamptz` <-> [Instant]. The Kotlin counterpart of the web's
 * `toMs`/`toIso` in lib/supabase/mappers.ts.
 *
 * PostgREST emits ISO-8601 (`2026-06-01T09:00:00+00:00`), but Realtime change
 * payloads can carry Postgres' text form (`2026-06-01 09:00:00+00`), so decoding
 * accepts both. Encoding always writes ISO-8601 UTC (`...Z`).
 */
object PostgresInstantSerializer : KSerializer<Instant> {
    override val descriptor: SerialDescriptor =
        PrimitiveSerialDescriptor("page.planr.PostgresInstant", PrimitiveKind.STRING)

    override fun serialize(encoder: Encoder, value: Instant) {
        encoder.encodeString(value.toString())
    }

    override fun deserialize(decoder: Decoder): Instant = parse(decoder.decodeString())

    /** Parses either the ISO-8601 or the Postgres text form of a timestamptz. */
    fun parse(text: String): Instant = Instant.parse(normalize(text.trim()))

    private val SHORT_OFFSET = Regex("([+-]\\d{2})$")

    private fun normalize(text: String): String {
        // "2026-06-01 09:00:00+00" -> "2026-06-01T09:00:00+00:00"
        val isoSeparated = if (text.length > 10 && text[10] == ' ') {
            text.substring(0, 10) + "T" + text.substring(11)
        } else {
            text
        }
        return SHORT_OFFSET.replace(isoSeparated) { "${it.groupValues[1]}:00" }
    }
}

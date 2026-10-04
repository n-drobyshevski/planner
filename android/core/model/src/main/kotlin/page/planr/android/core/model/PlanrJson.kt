package page.planr.android.core.model

import kotlinx.serialization.json.Json

/**
 * The one Json configuration for Supabase payloads. Lenient on purpose: the web
 * adds columns and enum values first, and an older app build must keep decoding
 * rows — unknown keys are ignored and an unknown enum value falls back to the
 * property's default (e.g. [ContextLabel.Bar]).
 */
val PlanrJson: Json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    encodeDefaults = true
}

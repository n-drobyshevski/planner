package page.planr.android.core.insights.js

import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.floor
import page.planr.android.core.insights.model.MsWindow

/**
 * JavaScript number semantics the web's Insights code relies on. Kotlin's own
 * `round` is half-even and `String.format` is locale-dependent, so every
 * `Math.round` / `toFixed` site of the port goes through here.
 */
object JsMath {

    private const val DAY_MS = 86_400_000.0

    /**
     * `Math.round`: half toward +∞. Not `floor(x + 0.5)` (wrong for
     * 0.49999999999999994) and not `kotlin.math.round` (half-even).
     */
    fun round(x: Double): Double {
        if (x.isNaN() || x.isInfinite()) return x
        val r = floor(x)
        return if (x - r >= 0.5) r + 1 else r
    }

    fun roundToLong(x: Double): Long = round(x).toLong()

    fun roundToInt(x: Double): Int = round(x).toInt()

    /**
     * `Number.prototype.toFixed`, locale-free: the EXACT binary value rounded
     * half up, with JS's sign handling — `(-0).toFixed(1)` is "0.0" but
     * `(-0.04).toFixed(1)` is "-0.0" and `(-1.25).toFixed(1)` is "-1.3".
     */
    fun toFixed(x: Double, digits: Int): String {
        if (x == 0.0) return BigDecimal.ZERO.setScale(digits).toPlainString()
        if (x < 0) return "-" + toFixed(-x, digits)
        return BigDecimal(x).setScale(digits, RoundingMode.HALF_UP).toPlainString()
    }

    /** `whole > 0 ? Math.round(part / whole * 100) : 0` (ledes.ts `pct`, tab-bits.tsx `srPercent`). */
    fun percentOf(part: Double, whole: Double): Int = if (whole > 0) roundToInt(part / whole * 100) else 0

    /** `Math.round((end - start) / 86_400_000)`: a window's length in days (period.ts). */
    fun dayCount(window: MsWindow): Int = roundToInt((window.end - window.start) / DAY_MS)
}

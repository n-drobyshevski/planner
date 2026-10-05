package page.planr.android.core.insights.analytics

import kotlin.math.abs
import page.planr.android.core.insights.model.Anomaly
import page.planr.android.core.insights.model.AnomalyDirection
import page.planr.android.core.insights.model.BucketUsage
import page.planr.android.core.insights.model.DayUsage
import page.planr.android.core.insights.model.Streak
import page.planr.android.core.insights.model.TrendDirection
import page.planr.android.core.insights.model.TrendKind

/** Momentum signals (lib/analytics/momentum.ts). */
object MomentumAnalytics {
    const val MIN_TREND_BUCKETS = 4
    const val FLAT_SHARE = 0.1
    const val MIN_CONSISTENCY_DAYS = 7
    const val CONSISTENCY_BAND = 0.5
    const val DEFAULT_ANOMALY_MIN_SAMPLE = 14
    const val DEFAULT_ANOMALY_Z = 3.0
    const val ANOMALY_CAP = 5

    /**
     * momentum.ts `bucketTrend`: Theil–Sen over (index, ms), null under
     * [MIN_TREND_BUCKETS]. Flat when the slope is zero or the projected change
     * across the series is under [FLAT_SHARE] of the median bucket.
     */
    fun bucketTrend(buckets: List<BucketUsage>): TrendDirection {
        if (buckets.size < MIN_TREND_BUCKETS) return TrendDirection(null, null)
        val slope = Stats.theilSenSlope(buckets.mapIndexed { i, b -> i.toDouble() to b.ms.toDouble() })
            ?: return TrendDirection(null, null)
        // Compare the unboxed value: a boxed Double's equals tells -0.0 from 0.0.
        val s: Double = slope
        val projected = abs(s * (buckets.size - 1))
        val flat = s == 0.0 || projected < FLAT_SHARE * Stats.median(buckets.map { it.ms.toDouble() })
        val direction = if (flat) TrendKind.Flat else if (s > 0) TrendKind.Up else TrendKind.Down
        return TrendDirection(s, direction)
    }

    /**
     * momentum.ts `activeStreak`: runs of days with `ms >= minMsPerDay`;
     * `current` counts back from the LAST element of [perDay].
     */
    fun activeStreak(perDay: List<DayUsage>, minMsPerDay: Long = 1): Streak {
        var longest = 0
        var run = 0
        for (d in perDay) {
            run = if (d.ms >= minMsPerDay) run + 1 else 0
            if (run > longest) longest = run
        }
        var current = 0
        var i = perDay.size - 1
        while (i >= 0 && perDay[i].ms >= minMsPerDay) {
            current += 1
            i--
        }
        return Streak(current, longest)
    }

    /**
     * momentum.ts `consistency`: the share of nonzero days within ±50% of the
     * median nonzero day (inclusive); null under [MIN_CONSISTENCY_DAYS] nonzero days.
     */
    fun consistency(perDay: List<DayUsage>): Double? {
        val nonzero = perDay.map { it.ms.toDouble() }.filter { it > 0 }
        if (nonzero.size < MIN_CONSISTENCY_DAYS) return null
        val med = Stats.median(nonzero)
        val within = nonzero.count { it >= (1 - CONSISTENCY_BAND) * med && it <= (1 + CONSISTENCY_BAND) * med }
        return within.toDouble() / nonzero.size
    }

    /**
     * momentum.ts `dayAnomalies`: robust z over NONZERO days (input order);
     * empty under [minSample] nonzero days or when the MAD is 0. Keeps
     * `|z| >= zThreshold`, stable-sorted by |z| descending, capped at [ANOMALY_CAP].
     */
    fun dayAnomalies(
        perDay: List<DayUsage>,
        minSample: Int = DEFAULT_ANOMALY_MIN_SAMPLE,
        zThreshold: Double = DEFAULT_ANOMALY_Z,
    ): List<Anomaly> {
        val nonzero = perDay.filter { it.ms > 0 }
        if (nonzero.size < minSample) return emptyList()
        val values = nonzero.map { it.ms.toDouble() }
        val med = Stats.median(values)
        val madValue = Stats.mad(values)
        val out = ArrayList<Anomaly>()
        for (d in nonzero) {
            val z = Stats.robustZ(d.ms.toDouble(), med, madValue) ?: continue
            if (abs(z) < zThreshold) continue
            out += Anomaly(d.dayMs, d.ms, z, if (z > 0) AnomalyDirection.High else AnomalyDirection.Low)
        }
        return out.sortedWith { a, b -> abs(b.z).compareTo(abs(a.z)) }.take(ANOMALY_CAP)
    }

    /**
     * The streak counted back from min(window end, today): the days with
     * `dayMs <= now` only (optimize-tab.tsx:244-247); null when there are none.
     */
    fun elapsedStreak(perDay: List<DayUsage>, now: Long): Streak? {
        val elapsed = perDay.filter { it.dayMs <= now }
        return if (elapsed.isEmpty()) null else activeStreak(elapsed)
    }
}

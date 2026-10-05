package page.planr.android.core.insights.model

/** trends.ts `BucketUsage`. */
data class BucketUsage(val start: Long, val end: Long, val ms: Long)

/** trends.ts `RollingPoint`. */
data class RollingPoint(val dayMs: Long, val avgMs: Double)

/** trends.ts `CategoryBucketRow`: [byKey] holds every series key, in series order. */
data class CategoryBucketRow(val start: Long, val end: Long, val byKey: Map<String, Long>)

/** trends.ts `CategoryBuckets`. */
data class CategoryBuckets(val seriesKeys: List<String>, val rows: List<CategoryBucketRow>)

/** trends.ts `Delta`; [deltaPct] is null when the previous value is 0. */
data class Delta(val delta: Double, val deltaPct: Double?)

enum class TrendKind(val id: String) { Up("up"), Down("down"), Flat("flat") }

/** momentum.ts `TrendDirection`. */
data class TrendDirection(val slopeMsPerBucket: Double?, val direction: TrendKind?)

/** momentum.ts `Streak`. */
data class Streak(val current: Int, val longest: Int)

enum class AnomalyDirection(val id: String) { High("high"), Low("low") }

/** momentum.ts `Anomaly`. */
data class Anomaly(val dayMs: Long, val ms: Long, val z: Double, val direction: AnomalyDirection)

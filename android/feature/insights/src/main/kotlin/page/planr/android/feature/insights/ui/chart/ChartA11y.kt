package page.planr.android.feature.insights.ui.chart

/**
 * What TalkBack says about a chart's bands. The same [BandInfo] feeds the
 * visual tooltip, so the two can never disagree. Pure, so the per-band nodes
 * are unit-tested without a device (ChartGeometryTest).
 */
object ChartA11y {

    /** "<title>: <label> <value>, <label> <value>". Locale-neutral punctuation, no string resource. */
    fun describe(b: BandInfo): String = b.title + ": " + b.rows.joinToString(", ") { "${it.label} ${it.value}" }

    /** One band's accessibility node: its description and, when the chart opens bands, the click action. */
    data class BandNode(
        val index: Int,
        val description: String,
        /** The action's label (e.g. "Open day"); null without an action. */
        val clickLabel: String?,
        val onClick: (() -> Unit)?,
    )

    /** One node per band, in order; each gets [onOpen] as its click action when it is set. */
    fun bandNodes(bands: List<BandInfo>, onOpen: ((Int) -> Unit)?, openLabel: String?): List<BandNode> =
        bands.mapIndexed { i, band ->
            BandNode(
                index = i,
                description = describe(band),
                clickLabel = if (onOpen != null) openLabel else null,
                onClick = onOpen?.let { open -> { open(i) } },
            )
        }
}

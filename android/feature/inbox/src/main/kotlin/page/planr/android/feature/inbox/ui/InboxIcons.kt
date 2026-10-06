package page.planr.android.feature.inbox.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The Inbox's line icons, the web row's Lucide set (inbox-row.tsx
 * `KIND_ICON`, ISC licensed) drawn from path data. 24×24, 2px round strokes.
 */
internal object InboxIcons {
    val ArrowLeft by lazy { lucide("ArrowLeft", "m12 19-7-7 7-7", "M19 12H5") }
    val ChevronRight by lazy { lucide("ChevronRight", "m9 18 6-6-6-6") }
    val CalendarCheck by lazy {
        lucide(
            "CalendarCheck",
            "M8 2v4",
            "M16 2v4",
            "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
            "M3 10h18",
            "m9 16 2 2 4-4",
        )
    }
    val SquareCheckBig by lazy {
        lucide("SquareCheckBig", "M21 10.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12.5", "m9 11 3 3L22 4")
    }
    val BedDouble by lazy {
        lucide(
            "BedDouble",
            "M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8",
            "M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4",
            "M12 4v6",
            "M2 18h20",
        )
    }
    val CalendarPlus by lazy {
        lucide(
            "CalendarPlus",
            "M8 2v4",
            "M16 2v4",
            "M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8",
            "M3 10h18",
            "M16 19h6",
            "M19 16v6",
        )
    }

    private fun lucide(name: String, vararg paths: String): ImageVector =
        ImageVector.Builder(
            name = name,
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = 24f,
            viewportHeight = 24f,
        ).apply {
            paths.forEach { d ->
                addPath(
                    pathData = addPathNodes(d),
                    fill = null,
                    stroke = SolidColor(Color.Black),
                    strokeLineWidth = 2f,
                    strokeLineCap = StrokeCap.Round,
                    strokeLineJoin = StrokeJoin.Round,
                )
            }
        }.build()
}

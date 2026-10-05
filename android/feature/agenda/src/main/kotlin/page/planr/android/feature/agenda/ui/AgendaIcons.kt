package page.planr.android.feature.agenda.ui

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * The few line icons the agenda needs, drawn from Lucide's path data (the
 * web's icon set, ISC licensed) so the app matches the web without pulling in
 * an icon library. 24×24, 2px round strokes; tint them like any icon.
 */
internal object AgendaIcons {
    val ChevronLeft by lazy { lucide("ChevronLeft", "m15 18-6-6 6-6") }
    val ChevronRight by lazy { lucide("ChevronRight", "m9 18 6-6-6-6") }
    val ChevronDown by lazy { lucide("ChevronDown", "m6 9 6 6 6-6") }
    val Plus by lazy { lucide("Plus", "M5 12h14", "M12 5v14") }
    val Minus by lazy { lucide("Minus", "M5 12h14") }
    val Close by lazy { lucide("Close", "M18 6 6 18", "m6 6 12 12") }
    val ArrowLeft by lazy { lucide("ArrowLeft", "m12 19-7-7 7-7", "M19 12H5") }
    val Pencil by lazy {
        lucide(
            "Pencil",
            "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
            "m15 5 4 4",
        )
    }
    val Trash by lazy {
        lucide(
            "Trash",
            "M3 6h18",
            "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
            "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
            "M10 11v6",
            "M14 11v6",
        )
    }
    val Repeat by lazy {
        lucide("Repeat", "m17 2 4 4-4 4", "M3 11v-1a4 4 0 0 1 4-4h14", "m7 22-4-4 4-4", "M21 13v1a4 4 0 0 1-4 4H3")
    }
    val Lock by lazy {
        lucide("Lock", "M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M7 11V7a5 5 0 0 1 10 0v4")
    }
    val Users by lazy {
        lucide(
            "Users",
            "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
            "M5 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
            "M22 21v-2a4 4 0 0 0-3-3.87",
            "M16 3.13a4 4 0 0 1 0 7.75",
        )
    }
    val Eye by lazy {
        lucide(
            "Eye",
            "M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",
            "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
        )
    }
    val MapPin by lazy {
        lucide(
            "MapPin",
            "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
            "M9 10a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
        )
    }
    val Globe by lazy {
        lucide(
            "Globe",
            "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0",
            "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",
            "M2 12h20",
        )
    }
    val Notes by lazy { lucide("Notes", "M15 18H3", "M17 6H3", "M21 12H3") }

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

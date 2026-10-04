package page.planr.android.core.design.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

/**
 * Gentle geometry from DESIGN.md (`rounded`): sm 0.45rem, md 0.6rem (event
 * blocks), lg 0.75rem (buttons, inputs), xl 1.05rem (cards). Pills (badges,
 * chips) use a full-round shape.
 */
object PlanrRadii {
    val sm = 7.dp
    val md = 10.dp
    val lg = 12.dp
    val xl = 17.dp
}

val PlanrShapes = Shapes(
    extraSmall = RoundedCornerShape(PlanrRadii.sm),
    small = RoundedCornerShape(PlanrRadii.md),
    medium = RoundedCornerShape(PlanrRadii.lg),
    large = RoundedCornerShape(PlanrRadii.xl),
    extraLarge = RoundedCornerShape(20.dp),
)

/** Event block corner (`rounded.md`). */
val EventBlockShape = RoundedCornerShape(PlanrRadii.md)

/** Spacing tokens (`spacing` in DESIGN.md). */
object PlanrSpacing {
    val xs = 4.dp
    val sm = 6.dp
    val md = 10.dp
    val lg = 12.dp
    val xl = 16.dp

    /** Minimum touch target on phones (2.75rem). */
    val touchTarget = 44.dp
}

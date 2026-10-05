package page.planr.android.feature.tasks.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import page.planr.android.core.design.theme.PlanrSwatches
import page.planr.android.core.model.Member

/** A member's initial on their identity color (the web's assignee avatar). */
@Composable
internal fun MemberAvatar(member: Member, modifier: Modifier = Modifier, size: Dp = 24.dp) {
    Box(
        modifier = modifier
            .size(size)
            .background(taskColor(member.color), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = member.name.take(1).uppercase(),
            color = PlanrSwatches.ink,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            fontSize = (size.value * 0.42f).sp,
        )
    }
}

package page.planr.android.feature.agenda.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.IconToggleButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import page.planr.android.core.design.theme.PlanrTheme
import page.planr.android.core.design.theme.parseHexColor
import page.planr.android.feature.agenda.PartnerToggle
import page.planr.android.feature.agenda.R

/**
 * Shows or hides the partner's personal events: their initial in their
 * member colour, a filled disc while shown and an outlined one while hidden
 * (the web sidebar's overlay toggle). Joint events show either way.
 */
@Composable
internal fun PartnerToggleButton(partner: PartnerToggle, onToggle: (Boolean) -> Unit) {
    val slot = if (partner.isMemberA) PlanrTheme.colors.memberA else PlanrTheme.colors.memberB
    val identity = parseHexColor(partner.color, slot.fill)
    val label = stringResource(R.string.agenda_partner_events, partner.name)
    IconToggleButton(
        checked = partner.shown,
        onCheckedChange = onToggle,
        modifier = Modifier.semantics { contentDescription = label },
    ) {
        val disc = Modifier
            .size(26.dp)
            .clip(CircleShape)
        Box(
            modifier = if (partner.shown) {
                disc.background(identity)
            } else {
                disc.border(1.5.dp, identity, CircleShape)
            },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = partner.name.trim().take(1).uppercase().ifEmpty { "?" },
                style = MaterialTheme.typography.labelLarge,
                color = if (partner.shown) slot.onFill else identity,
            )
        }
    }
}

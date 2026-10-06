package page.planr.android.account.health

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import page.planr.android.R
import page.planr.android.core.design.theme.PlanrSpacing
import page.planr.android.core.design.theme.PlanrTheme

/**
 * What Planr does with Health Connect data. Health Connect opens this from its
 * permission screen ("Read privacy policy") and from Android's permission
 * usage settings; it refuses to grant access to an app without it.
 */
class HealthPermissionsRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            PlanrTheme {
                Surface(Modifier.fillMaxSize()) {
                    Column(
                        Modifier
                            .safeDrawingPadding()
                            .verticalScroll(rememberScrollState())
                            .padding(PlanrSpacing.xl),
                        verticalArrangement = Arrangement.spacedBy(PlanrSpacing.md),
                    ) {
                        Text(
                            stringResource(R.string.health_rationale_title),
                            style = MaterialTheme.typography.titleLarge,
                            modifier = Modifier.semantics { heading() },
                        )
                        Text(stringResource(R.string.health_rationale_body), style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = ::finish) { Text(stringResource(R.string.health_rationale_close)) }
                    }
                }
            }
        }
    }
}

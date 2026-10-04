package page.planr.android.core.recurrence

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.time.Instant
import page.planr.android.core.model.OverrideType

// Parity tests against the TypeScript golden fixtures land with the port; these
// cover the parts that are already real.
class EditSemanticsTest {

    private val at = Instant.parse("2026-03-30T07:00:00Z")

    @Test
    fun `cancelOccurrence keys a cancel override on the original start`() {
        val input = EditSemantics.cancelOccurrence("e1", at)

        assertEquals(OverrideType.Cancel, input.type)
        assertEquals(at, input.occurrenceDate)
        assertNull(input.patch)
    }

    @Test
    fun `modifyOccurrence carries the patch`() {
        val patch = OccurrencePatch(title = "Moved", location = PatchField.Value(null))

        val input = EditSemantics.modifyOccurrence("e1", at, patch)

        assertEquals(OverrideType.Modify, input.type)
        assertEquals(patch, input.patch)
    }
}

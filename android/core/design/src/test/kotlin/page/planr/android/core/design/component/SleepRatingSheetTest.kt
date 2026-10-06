package page.planr.android.core.design.component

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SheetValue
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.w3c.dom.Element

@OptIn(ExperimentalMaterial3Api::class)
class SleepRatingSheetTest {

    @Test
    fun `the sheet can't be hidden while a save is in flight`() {
        // Hiding first and asking the caller to close second would leave an
        // invisible sheet over the screen, and a failed save unseen.
        assertFalse(sleepSheetMayMoveTo(SheetValue.Hidden, saving = true))
        assertTrue(sleepSheetMayMoveTo(SheetValue.Expanded, saving = true))
        assertTrue(sleepSheetMayMoveTo(SheetValue.Hidden, saving = false))
        assertTrue(sleepSheetMayMoveTo(SheetValue.Expanded, saving = false))
    }

    @Test
    fun `anchor words drop the level number, in either language`() {
        assertEquals("Poor", ratingWord("1 Poor"))
        assertEquals("Neither alert nor sleepy", ratingWord("5 Neither alert nor sleepy"))
        assertEquals("Борюсь со сном", ratingWord("9 Борюсь со сном"))
        assertEquals("Great", ratingWord("Great"))
    }

    @Test
    fun `the scales match the web's, in both languages`() {
        // The sheet draws one segment per label, so the string arrays are the scales.
        for (dir in listOf("values", "values-ru")) {
            val xml = DocumentBuilderFactory.newInstance().newDocumentBuilder()
                .parse(File("src/main/res/$dir/strings_sleep.xml"))
            val arrays = xml.getElementsByTagName("string-array")
            val levels = (0 until arrays.length).associate { i ->
                val array = arrays.item(i) as Element
                val items = array.getElementsByTagName("item")
                array.getAttribute("name") to (0 until items.length).map { items.item(it).textContent }
            }
            for ((name, count) in mapOf(
                "sleep_rating_quality_levels" to SleepRatingDraft.QUALITY_LEVELS,
                "sleep_rating_fatigue_levels" to SleepRatingDraft.FATIGUE_LEVELS,
            )) {
                val labels = levels.getValue(name)
                assertEquals(count, labels.size, "$dir/$name")
                labels.forEachIndexed { i, label -> assertTrue(label.startsWith("${i + 1} "), "$dir/$name: $label") }
            }
        }
    }
}

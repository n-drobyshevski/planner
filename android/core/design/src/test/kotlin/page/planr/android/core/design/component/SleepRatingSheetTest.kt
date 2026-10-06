package page.planr.android.core.design.component

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.w3c.dom.Element

class SleepRatingSheetTest {

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

package page.planr.android.feature.inbox

import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import org.junit.Test
import org.w3c.dom.Element

/** Every Inbox string exists in English and Russian, with the same placeholders. */
class InboxStringsTest {
    private fun strings(dir: String): Map<String, String> {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder()
            .parse(File("src/main/res/$dir/strings.xml"))
        val nodes = doc.getElementsByTagName("string")
        return (0 until nodes.length).map { nodes.item(it) as Element }.associate { it.getAttribute("name") to it.textContent }
    }

    private fun placeholders(text: String): List<String> = Regex("%\\d+\\$[sd]").findAll(text).map { it.value }.sorted().toList()

    @Test
    fun `russian mirrors english`() {
        val en = strings("values")
        val ru = strings("values-ru")
        assertEquals(en.keys, ru.keys)
        en.forEach { (name, text) -> assertEquals(placeholders(text), placeholders(ru.getValue(name)), name) }
    }

    @Test
    fun `the russian sleep row puts a date after «в ночь на», never a nominative weekday`() {
        val ru = strings("values-ru")
        val skeleton = ru.getValue("inbox_log_sleep_date_skeleton")
        assertFalse(skeleton.contains('E') || skeleton.contains('c'), "no weekday: «на среда» is ungrammatical")
        assertTrue(skeleton.contains("MMMM"), "a full month, which ru formats in the genitive")
        // What the platform's best pattern for "dMMMM" is in Russian.
        val wednesday = LocalDate.of(2026, 10, 7)
        val date = DateTimeFormatter.ofPattern("d MMMM", Locale.forLanguageTag("ru")).format(wednesday)
        assertEquals("Как спалось в ночь на 7 октября?", String.format(ru.getValue("inbox_log_sleep_frame"), date))
    }

    @Test
    fun `the english sleep row keeps the weekday`() {
        assertTrue(strings("values").getValue("inbox_log_sleep_date_skeleton").contains("EEEE"))
    }
}

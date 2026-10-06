package page.planr.android.feature.inbox

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.assertEquals
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
}

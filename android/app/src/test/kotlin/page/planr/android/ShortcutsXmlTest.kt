package page.planr.android

import java.io.File
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import org.w3c.dom.Element
import page.planr.android.feature.quickadd.QuickAddActivity
import page.planr.android.feature.quickadd.QuickAddKind
import page.planr.android.navigation.LaunchRoute
import page.planr.android.navigation.TopLevelTab
import page.planr.android.widgets.WidgetLaunch

/**
 * res/xml/shortcuts.xml spells out package, class and extra names as plain
 * strings (resources get no manifest placeholders); this keeps them in step
 * with the code they launch.
 */
class ShortcutsXmlTest {
    private val android = "http://schemas.android.com/apk/res/android"

    /** Shortcut id → its intent. Unit tests run in the module directory. */
    private val intents: Map<String, Element> by lazy {
        val factory = DocumentBuilderFactory.newInstance().apply { isNamespaceAware = true }
        val doc = factory.newDocumentBuilder().parse(File("src/main/res/xml/shortcuts.xml"))
        val shortcuts = doc.getElementsByTagName("shortcut")
        (0 until shortcuts.length).associate { i ->
            val shortcut = shortcuts.item(i) as Element
            shortcut.getAttributeNS(android, "shortcutId") to shortcut.getElementsByTagName("intent").item(0) as Element
        }
    }

    private fun Element.attr(name: String) = getAttributeNS(android, name)

    private fun Element.extras(): Map<String, String> {
        val nodes = getElementsByTagName("extra")
        return (0 until nodes.length).associate { i ->
            val extra = nodes.item(i) as Element
            extra.attr("name") to extra.attr("value")
        }
    }

    @Test
    fun `every shortcut targets this app`() {
        assertEquals(setOf("new_task", "new_event", "tasks"), intents.keys)
        intents.values.forEach { assertEquals(BuildConfig.APPLICATION_ID, it.attr("targetPackage")) }
    }

    @Test
    fun `new task and new event open Quick add on their kind`() {
        mapOf("new_task" to QuickAddKind.Task, "new_event" to QuickAddKind.Event).forEach { (id, kind) ->
            val intent = assertNotNull(intents[id])
            assertEquals(QuickAddActivity::class.java.name, intent.attr("targetClass"))
            assertEquals(mapOf(QuickAddActivity.EXTRA_MODE to kind.name), intent.extras())
        }
    }

    @Test
    fun `tasks opens the app on the tasks tab`() {
        val intent = assertNotNull(intents["tasks"])
        assertEquals(MainActivity::class.java.name, intent.attr("targetClass"))
        assertEquals(WidgetLaunch.ACTION_OPEN, intent.attr("action"))
        val route = intent.extras()[WidgetLaunch.EXTRA_ROUTE]
        assertEquals(LaunchRoute.Tab(TopLevelTab.Tasks), LaunchRoute.parse(route))
    }
}

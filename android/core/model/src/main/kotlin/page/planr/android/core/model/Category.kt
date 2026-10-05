package page.planr.android.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * A `categories` row (a "context" in the UI). `ownerId == null` means a shared
 * category: both members see it, and events filed under it are joint.
 */
@Serializable
data class Category(
    val id: String,
    @SerialName("workspace_id") val workspaceId: String,
    @SerialName("owner_id") val ownerId: String? = null,
    val name: String,
    val color: String,
    @SerialName("sort_order") val sortOrder: Int = 0,
) {
    val isShared: Boolean get() = ownerId == null
}

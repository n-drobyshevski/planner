# kotlinx.serialization: keep generated serializers for @Serializable models.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers @kotlinx.serialization.Serializable class page.planr.android.** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}

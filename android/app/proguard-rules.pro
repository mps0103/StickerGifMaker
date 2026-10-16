-keep class com.mps.stickergif.** { *; }
-keep class com.google.mlkit.** { *; }
-keep class com.squareup.gifencoder.** { *; }
-keep class pl.droidsonroids.gif.** { *; }
-dontwarn com.google.mlkit.**

# JNI entry points are looked up by name at runtime, so R8 must not rename them.
-keepclasseswithmembernames class com.mps.stickergif.sticker.AnimatedWebPEncoder {
    native <methods>;
}
-keep class com.android.billingclient.** { *; }

# WorkManager (pulled in by the Google ads and ML Kit libraries) builds its Room
# database by calling the generated WorkDatabase_Impl constructor reflectively.
# R8's full mode drops a constructor nothing calls directly, which crashed the
# release build at startup with "Failed to create an instance of WorkDatabase".
-keep class * extends androidx.room.RoomDatabase { <init>(); }

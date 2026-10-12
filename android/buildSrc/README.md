# Camera edge-to-edge compatibility

`io.ionic.libs:ioncamera-android:1.0.2`, used by Capacitor Camera, reads
`Window.getStatusBarColor()` and `getNavigationBarColor()` in its image editor.
Both APIs are deprecated on Android 15. The latest upstream release still
contains these calls as of 2026-10-12.

The AGP instrumentation transform changes only those two reads, only in
`IONCAMRImageEditorActivity.onCreate`, to `Color.TRANSPARENT`. This is equivalent
to the following source correction in the existing `enableEdgeToEdge` call:

```kotlin
statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)
```

The editor already has a black theme and handles system-bar/display-cutout
insets. Light system icons, inset handling, camera capture, picking and editing
are preserved. No warnings or permissions are suppressed. The transform runs
before D8/R8 and fails if the expected upstream method changes, requiring a
review when the dependency is upgraded. Remove it when Ionic ships a fix.

Upstream source:
https://github.com/ionic-team/ion-android-camera/blob/main/src/main/kotlin/io/ionic/libs/ioncameralib/view/IONCAMRImageEditorActivity.kt

Material Components 1.14.0 separately migrates its sheet dialogs to modern
edge-to-edge handling, with legacy color operations restricted to older OSes.

Validation: buildSrc bytecode tests; minified releaseSmoke Android instrumentation
tests on API 35 and 36; signed release AAB and R8 mapping uploaded together.

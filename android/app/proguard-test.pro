# Preserve the instrumentation harness; the app under test still uses the exact
# release R8/resource-shrinking configuration. These flags affect only test APKs.
-dontobfuscate
-dontoptimize
-dontshrink

package de.alberring.connect;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Tests the fully optimized app using platform APIs only. AndroidX/JUnit runners
 * share the target's class loader and can call Kotlin methods removed by R8.
 * Keeping those methods just for the harness would change the app under test.
 */
public final class ReleaseSmokeInstrumentation extends Instrumentation {
    private int failures;

    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

    @Override public void onStart() {
        runTest(1, "loginAndNativeBridge", this::loginAndNativeBridge);
        runTest(2, "cameraEditor", this::cameraEditor);
        runTest(3, "inputViewportAndZoomRecovery", this::inputViewportAndZoomRecovery);
        Bundle result = new Bundle();
        result.putString(REPORT_KEY_STREAMRESULT, failures == 0
            ? "\nOK (3 tests)\n" : "\nFAILURES!!! Tests run: 3, Failures: " + failures + "\n");
        finish(Activity.RESULT_OK, result);
    }

    private interface Test { void run() throws Exception; }

    private void runTest(int current, String name, Test test) {
        Bundle status = new Bundle();
        status.putString("id", "InstrumentationTestRunner");
        status.putString("class", getClass().getName());
        status.putString("test", name);
        status.putInt("numtests", 3);
        status.putInt("current", current);
        sendStatus(1, status);
        try {
            test.run();
            status.putString(REPORT_KEY_STREAMRESULT, ".");
            sendStatus(0, status);
        } catch (Throwable error) {
            failures++;
            status.putString("stack", Log.getStackTraceString(error));
            status.putString(REPORT_KEY_STREAMRESULT, "\n" + Log.getStackTraceString(error));
            sendStatus(-2, status);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private Activity launch(String className) {
        Intent intent = new Intent().setClassName(getTargetContext(), className);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return startActivitySync(intent);
    }

    private static WebView webView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView result = webView(group.getChildAt(i));
                if (result != null) return result;
            }
        }
        return null;
    }

    private String evaluate(Activity activity, String script) throws Exception {
        CompletableFuture<String> result = new CompletableFuture<>();
        runOnMainSync(() -> {
            WebView view = webView(activity.getWindow().getDecorView());
            if (view == null) result.completeExceptionally(new AssertionError("WebView missing"));
            else view.evaluateJavascript(script, result::complete);
        });
        return result.get(10, TimeUnit.SECONDS);
    }

    private void loginAndNativeBridge() throws Exception {
        Activity activity = launch("de.alberring.connect.MainActivity");
        try {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
            boolean ready = false;
            while (System.nanoTime() < deadline) {
                if ("true".equals(evaluate(activity,
                        "!!(window.Capacitor && window.Capacitor.nativePromise && document.querySelector('input[type=password]'))"))) {
                    ready = true;
                    break;
                }
                Thread.sleep(200);
            }
            require(ready, "Bundled login screen and native bridge must load");
            evaluate(activity, "window.__releaseSmoke = 'pending'; (async () => {"
                + "const call = (plugin, method, args = {}) => Capacitor.nativePromise(plugin, method, args);"
                + "const network = await call('Network','getStatus');"
                + "const camera = await call('Camera','checkPermissions');"
                + "const key = 'release-smoke-synthetic';"
                + "try { await call('AlberringSecureStorage','set',{key,value:'synthetic-value'});"
                + "const stored = await call('AlberringSecureStorage','get',{key});"
                + "if(stored.value !== 'synthetic-value') throw Error('Storage round trip');"
                + "} finally { await call('AlberringSecureStorage','remove',{key}); }"
                + "const removed = await call('AlberringSecureStorage','get',{key});"
                + "if(typeof network.connected !== 'boolean' || typeof camera.camera !== 'string' || removed.value !== null)"
                + "throw Error('Plugin response invalid');"
                + "window.__releaseSmoke = 'ok';"
                + "})().catch(error => { window.__releaseSmoke = String(error); });");
            String result = "\"pending\"";
            deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (System.nanoTime() < deadline && result.equals("\"pending\"")) {
                result = evaluate(activity, "window.__releaseSmoke");
                if (result.equals("\"pending\"")) Thread.sleep(100);
            }
            require("\"ok\"".equals(result), "Native plugin bridge failed: " + result);
        } finally { runOnMainSync(activity::finish); waitForIdleSync(); }
    }

    private void inputViewportAndZoomRecovery() throws Exception {
        Activity activity = launch("de.alberring.connect.MainActivity");
        try {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
            while (!"true".equals(evaluate(activity, "!!document.querySelector('input[type=password]')"))) {
                require(System.nanoTime() < deadline, "Login screen must load");
                Thread.sleep(100);
            }
            runOnMainSync(() -> {
                WebView view = webView(activity.getWindow().getDecorView());
                require(view.getSettings().getBuiltInZoomControls(), "Pinch zoom recovery must be enabled");
                require(view.getSettings().getUseWideViewPort(), "Device-width viewport must be honored");
            });
            evaluate(activity, "document.querySelector('input[type=password]').focus()");
            waitForIdleSync();
            Thread.sleep(500); // Let the native keyboard and focus animation settle.
            require("true".equals(evaluate(activity,
                "Math.abs(visualViewport.scale - 1) < 0.02 && "
                + "parseFloat(getComputedStyle(document.querySelector('input[type=password]')).fontSize) >= 16")),
                "Focusing the login field must preserve viewport scale");
            // Exercise real user-controlled magnification and recovery using the
            // WebView API, without changing the release WebView's configuration.
            runOnMainSync(() -> {
                WebView view = webView(activity.getWindow().getDecorView());
                view.clearFocus();
                view.zoomBy(1.5f);
            });
            Thread.sleep(400);
            require("true".equals(evaluate(activity, "visualViewport.scale > 1.2")), "User zoom must work");
            runOnMainSync(() -> webView(activity.getWindow().getDecorView()).zoomBy(1f / 1.5f));
            Thread.sleep(400);
            require("true".equals(evaluate(activity, "Math.abs(visualViewport.scale - 1) < 0.05")),
                "The view must be able to return to its original scale");
        } finally { runOnMainSync(activity::finish); waitForIdleSync(); }
    }

    private void cameraEditor() throws Exception {
        File input = new File(getTargetContext().getCacheDir(), "release-smoke-input.jpg");
        File output = new File(getTargetContext().getCacheDir(), "release-smoke-output.jpg");
        Bitmap bitmap = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888);
        try (FileOutputStream stream = new FileOutputStream(input)) {
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream);
        } finally { bitmap.recycle(); }
        Intent intent = new Intent().setClassName(getTargetContext(),
            "io.ionic.libs.ioncameralib.view.IONCAMRImageEditorActivity");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra("IMAGE_EDITOR_IN_URI_EXTRAS", Uri.fromFile(input).toString());
        intent.putExtra("IMAGE_EDITOR_OUT_URI_EXTRAS", Uri.fromFile(output).toString());
        Activity activity = null;
        try {
            activity = startActivitySync(intent);
            final Activity editorActivity = activity;
            waitForIdleSync();
            runOnMainSync(() -> {
                int editor = getTargetContext().getResources().getIdentifier("imageEditorView", "id", getTargetContext().getPackageName());
                int cancel = getTargetContext().getResources().getIdentifier("cancelButton", "id", getTargetContext().getPackageName());
                require(editor != 0 && editorActivity.findViewById(editor) != null, "Editor resource must survive shrinking");
                require(cancel != 0 && editorActivity.findViewById(cancel) != null, "Cancel control missing");
                require(editorActivity.getWindow().getDecorView().getRootWindowInsets() != null, "Window insets missing");
            });
        } finally {
            if (activity != null) { final Activity finished = activity; runOnMainSync(finished::finish); }
            input.delete();
            output.delete();
        }
    }
}

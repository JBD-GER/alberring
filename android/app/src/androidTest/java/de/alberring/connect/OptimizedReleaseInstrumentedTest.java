package de.alberring.connect;

import static org.junit.Assert.*;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs against minified code and shrunk resources, using only synthetic data. */
@RunWith(AndroidJUnit4.class)
public class OptimizedReleaseInstrumentedTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String script) throws Exception {
        CompletableFuture<String> result = new CompletableFuture<>();
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(script, result::complete));
        return result.get(10, TimeUnit.SECONDS);
    }

    @Test public void loadsLoginAndCallsPluginsThroughTheWebViewBridge() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
            boolean ready = false;
            while (System.nanoTime() < deadline) {
                if ("true".equals(evaluate(scenario,
                        "!!(window.Capacitor && window.Capacitor.nativePromise && document.querySelector('input[type=password]'))"))) {
                    ready = true;
                    break;
                }
                Thread.sleep(200);
            }
            assertTrue("Bundled login screen and native bridge must load", ready);
            evaluate(scenario, "window.__releaseSmoke = 'pending'; Promise.all(["
                + "Capacitor.nativePromise('Network','getStatus',{}),"
                + "Capacitor.nativePromise('Camera','checkPermissions',{}),"
                + "Capacitor.nativePromise('AlberringSecureStorage','get',{key:'release-smoke-missing-key'})"
                + "]).then(([network,camera,storage]) => {"
                + "window.__releaseSmoke = typeof network.connected === 'boolean' && typeof camera.camera === 'string'"
                + " && storage.value === null ? 'ok' : 'invalid';"
                + "}).catch(error => { window.__releaseSmoke = String(error); });");
            String result = "\"pending\"";
            deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (System.nanoTime() < deadline && result.equals("\"pending\"")) {
                result = evaluate(scenario, "window.__releaseSmoke");
                if (result.equals("\"pending\"")) Thread.sleep(100);
            }
            assertEquals("Native plugin reflection/JavaScript interface must survive R8", "\"ok\"", result);
        }
    }

    @Test public void cameraEditorLoadsWithModernSystemBarsAndShrunkResources() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File input = new File(context.getCacheDir(), "release-smoke-input.jpg");
        File output = new File(context.getCacheDir(), "release-smoke-output.jpg");
        Bitmap bitmap = Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888);
        try (FileOutputStream stream = new FileOutputStream(input)) {
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream);
        } finally { bitmap.recycle(); }
        Intent intent = new Intent().setClassName(context,
            "io.ionic.libs.ioncameralib.view.IONCAMRImageEditorActivity");
        intent.putExtra("IMAGE_EDITOR_IN_URI_EXTRAS", Uri.fromFile(input).toString());
        intent.putExtra("IMAGE_EDITOR_OUT_URI_EXTRAS", Uri.fromFile(output).toString());
        try (ActivityScenario<Activity> scenario = ActivityScenario.launch(intent)) {
            scenario.onActivity(activity -> {
                int editor = activity.getResources().getIdentifier("imageEditorView", "id", context.getPackageName());
                int cancel = activity.getResources().getIdentifier("cancelButton", "id", context.getPackageName());
                assertNotEquals("Dynamically resolved editor resource must survive shrinking", 0, editor);
                assertNotNull(activity.findViewById(editor));
                assertNotNull(activity.findViewById(cancel));
                assertNotNull(activity.getWindow().getDecorView().getRootWindowInsets());
            });
        } finally {
            input.delete();
            output.delete();
        }
    }
}

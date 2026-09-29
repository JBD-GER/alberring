package de.alberring.connect;

import static org.junit.Assert.*;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;

/** Executes against the real Android Keystore; never touches Supabase sessions. */
@RunWith(AndroidJUnit4.class)
public class SecureStorageInstrumentedTest {
    private static final String KEY = "native-instrumentation-only";
    private static final String VALUE = "synthetic-native-storage-test-value";

    private JSObject call(ActivityScenario<MainActivity> scenario, String method, JSObject data) throws Exception {
        CompletableFuture<JSObject> result = new CompletableFuture<>();
        scenario.onActivity(activity -> {
            try {
                AlberringSecureStoragePlugin storage = (AlberringSecureStoragePlugin)
                    activity.getBridge().getPlugin("AlberringSecureStorage").load();
                PluginCall call = new PluginCall(null, "AlberringSecureStorage", "instrumentation", method, data) {
                    @Override public void resolve() { result.complete(new JSObject()); }
                    @Override public void resolve(JSObject value) { result.complete(value); }
                    @Override public void reject(String message, String code, Exception error, JSObject value) {
                        JSObject rejected = new JSObject();
                        rejected.put("error", code);
                        result.complete(rejected);
                    }
                };
                switch (method) {
                    case "get": storage.get(call); break;
                    case "set": storage.set(call); break;
                    case "remove": storage.remove(call); break;
                    default: throw new IllegalArgumentException("Unknown test operation");
                }
            } catch (Exception error) { result.completeExceptionally(error); }
        });
        return result.get(10, TimeUnit.SECONDS);
    }

    private JSObject parameters(String key, String value) {
        JSObject data = new JSObject();
        data.put("key", key);
        if (value != null) data.put("value", value);
        return data;
    }

    @Test public void encryptsRoundTripsAndRemovesWithoutPlaintextFallback() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences disk = context.getSharedPreferences("alberring_encrypted_session", Context.MODE_PRIVATE);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                assertFalse(call(scenario, "set", parameters(KEY, VALUE)).has("error"));
                assertEquals(VALUE, call(scenario, "get", parameters(KEY, null)).getString("value"));
                String firstCiphertext = disk.getString(KEY, "");
                assertFalse(firstCiphertext.contains(VALUE));
                assertTrue(firstCiphertext.contains("ciphertext"));
                assertFalse(call(scenario, "set", parameters(KEY, VALUE)).has("error"));
                assertNotEquals(firstCiphertext, disk.getString(KEY, ""));
                assertFalse(call(scenario, "remove", parameters(KEY, null)).has("error"));
                assertTrue(call(scenario, "get", parameters(KEY, null)).isNull("value"));
            } finally { call(scenario, "remove", parameters(KEY, null)); }
        }
    }

    @Test public void rejectsTamperedCiphertextAndInvalidKeys() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        SharedPreferences disk = context.getSharedPreferences("alberring_encrypted_session", Context.MODE_PRIVATE);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            try {
                assertEquals("INVALID_KEY", call(scenario, "get", parameters("", null)).getString("error"));
                assertFalse(call(scenario, "set", parameters(KEY, VALUE)).has("error"));
                JSONObject envelope = new JSONObject(disk.getString(KEY, ""));
                byte[] ciphertext = Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP);
                ciphertext[ciphertext.length - 1] ^= 1;
                envelope.put("ciphertext", Base64.encodeToString(ciphertext, Base64.NO_WRAP));
                assertTrue(disk.edit().putString(KEY, envelope.toString()).commit());
                assertEquals("SECURE_STORAGE_UNAVAILABLE", call(scenario, "get", parameters(KEY, null)).getString("error"));
            } finally { call(scenario, "remove", parameters(KEY, null)); }
        }
    }
}

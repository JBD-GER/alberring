package de.alberring.connect;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

@CapacitorPlugin(name = "AlberringSecureStorage")
public final class AlberringSecureStoragePlugin extends Plugin {
    private SharedPreferences preferences() {
        return getContext().getSharedPreferences("alberring_encrypted_session", Context.MODE_PRIVATE);
    }

    private String key(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty() || key.getBytes(StandardCharsets.UTF_8).length > 256) {
            call.reject("Invalid storage key.", "INVALID_KEY");
            return null;
        }
        return key;
    }

    private SecretKey secretKey(boolean create) throws Exception {
        String alias = getContext().getPackageName() + ".auth.aes.v1";
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(alias)) return (SecretKey) store.getKey(alias, null);
        if (!create) throw new IllegalStateException("Session key unavailable");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    @PluginMethod
    public synchronized void get(PluginCall call) {
        String key = key(call);
        if (key == null) return;
        try {
            String stored = preferences().getString(key, null);
            JSObject result = new JSObject();
            if (stored == null) { result.put("value", JSONObject.NULL); call.resolve(result); return; }
            JSONObject envelope = new JSONObject(stored);
            if (envelope.getInt("version") != 1) throw new IllegalStateException("Unsupported ciphertext");
            byte[] iv = Base64.decode(envelope.getString("iv"), Base64.NO_WRAP);
            if (iv.length != 12) throw new IllegalStateException("Invalid nonce");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secretKey(false), new GCMParameterSpec(128, iv));
            cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
            byte[] plaintext = cipher.doFinal(Base64.decode(envelope.getString("ciphertext"), Base64.NO_WRAP));
            result.put("value", new String(plaintext, StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception ignored) {
            // Do not log tokens, ciphertext, key names or platform exception details.
            call.reject("Secure session storage is unavailable.", "SECURE_STORAGE_UNAVAILABLE");
        }
    }

    @PluginMethod
    public synchronized void set(PluginCall call) {
        String key = key(call);
        if (key == null) return;
        String value = call.getString("value");
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length > 524288) {
            call.reject("Invalid storage value.", "INVALID_VALUE"); return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secretKey(true));
            cipher.updateAAD(key.getBytes(StandardCharsets.UTF_8));
            JSONObject envelope = new JSONObject();
            envelope.put("version", 1);
            envelope.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
            envelope.put("ciphertext", Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP));
            if (!preferences().edit().putString(key, envelope.toString()).commit()) throw new IllegalStateException("Write failed");
            call.resolve();
        } catch (Exception ignored) {
            call.reject("The session could not be stored securely.", "SECURE_STORAGE_UNAVAILABLE");
        }
    }

    @PluginMethod
    public synchronized void remove(PluginCall call) {
        String key = key(call);
        if (key == null) return;
        if (!preferences().edit().remove(key).commit()) {
            call.reject("The secure session could not be removed.", "SECURE_STORAGE_UNAVAILABLE"); return;
        }
        call.resolve();
    }
}

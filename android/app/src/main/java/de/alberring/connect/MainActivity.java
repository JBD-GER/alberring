package de.alberring.connect;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import app.capgo.audiorecorder.CapacitorAudioRecorderPlugin;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AlberringSecureStoragePlugin.class);
        registerPlugin(AlberringSettingsPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Cancel natively, even when the WebView JavaScript has been suspended.
        if (getBridge() == null) return;
        getBridge().execute(() -> {
            PluginHandle handle = getBridge().getPlugin("CapacitorAudioRecorder");
            if (handle != null && handle.getInstance() instanceof CapacitorAudioRecorderPlugin) {
                CapacitorAudioRecorderPlugin recorder = (CapacitorAudioRecorderPlugin) handle.getInstance();
                recorder.getRecordingStatus(new PluginCall(null, "CapacitorAudioRecorder",
                    PluginCall.CALLBACK_ID_DANGLING, "getRecordingStatus", new JSObject()) {
                    @Override public void resolve(JSObject state) {
                        // Preserve a finished recording while its URI is being read.
                        if ("INACTIVE".equals(state.getString("status"))) return;
                        recorder.cancelRecording(new PluginCall(null, "CapacitorAudioRecorder",
                            PluginCall.CALLBACK_ID_DANGLING, "cancelRecording", new JSObject()) {
                            @Override public void resolve() { /* No JavaScript promise for native lifecycle. */ }
                        });
                    }
                });
            }
        });
    }
}

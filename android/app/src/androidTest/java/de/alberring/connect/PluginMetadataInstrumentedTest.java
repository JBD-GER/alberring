package de.alberring.connect;

import static org.junit.Assert.*;
import android.Manifest;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs against the shrunk release variant: no account, network or UI needed. */
@RunWith(AndroidJUnit4.class)
public class PluginMetadataInstrumentedTest {
    @Test public void retainsPushPermissionMetadataAndCallback() throws Exception {
        CapacitorPlugin plugin = PushNotificationsPlugin.class.getAnnotation(CapacitorPlugin.class);
        assertNotNull("R8 must retain the runtime plugin annotation", plugin);
        assertEquals("PushNotifications", plugin.name());
        boolean receiveFound = false;
        for (Permission permission : plugin.permissions()) {
            if ("receive".equals(permission.alias())) {
                assertArrayEquals(new String[] { Manifest.permission.POST_NOTIFICATIONS }, permission.strings());
                receiveFound = true;
            }
        }
        assertTrue("Android notification permission alias must survive shrinking", receiveFound);
        assertNotNull(PushNotificationsPlugin.class.getDeclaredMethod("permissionsCallback", PluginCall.class)
            .getAnnotation(PermissionCallback.class));
        assertNotNull(PushNotificationsPlugin.class.getDeclaredMethod("requestPermissions", PluginCall.class)
            .getAnnotation(PluginMethod.class));
    }
}

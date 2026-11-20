package de.alberring.connect;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.service.notification.StatusBarNotification;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.UserManager;
import android.provider.Settings;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.location.LocationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AlberringSettings")
public final class AlberringSettingsPlugin extends Plugin {
    @PluginMethod
    public void setBadgeCount(PluginCall call) {
        int count = Math.max(0, Math.min(9999, call.getInt("count", 0)));
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            // Android badges follow active notifications. Respect the launcher
            // and OS settings; do not manufacture a notification just for a badge.
            for (StatusBarNotification active : manager.getActiveNotifications()) {
                if (Build.VERSION.SDK_INT >= 26 && !"alberring-updates".equals(active.getNotification().getChannelId())) continue;
                if (count == 0) manager.cancel(active.getTag(), active.getId());
                else if (NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
                    Notification updated = Notification.Builder.recoverBuilder(getContext(), active.getNotification())
                        .setNumber(1).setOnlyAlertOnce(true).build();
                    manager.notify(active.getTag(), active.getId(), updated);
                }
            }
            call.resolve();
        } catch (Exception ignored) { call.reject("Badge could not be updated.", "BADGE_UNAVAILABLE"); }
    }

    private SharedPreferences history() {
        return getContext().getSharedPreferences("alberring_permission_history", Context.MODE_PRIVATE);
    }
    private String androidPermission(String permission) {
        if (permission == null) return null;
        switch (permission) {
            case "location": return Manifest.permission.ACCESS_COARSE_LOCATION;
            case "camera": return Manifest.permission.CAMERA;
            case "microphone": return Manifest.permission.RECORD_AUDIO;
            case "notifications": return Build.VERSION.SDK_INT >= 33 ? Manifest.permission.POST_NOTIFICATIONS : "legacy-notifications";
            default: return null;
        }
    }
    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception ignored) { call.reject("App settings are unavailable.", "SETTINGS_UNAVAILABLE"); }
    }

    @PluginMethod
    public void markPermissionRequested(PluginCall call) {
        String permission = call.getString("permission");
        if (androidPermission(permission) == null) { call.reject("Unknown permission.", "INVALID_PERMISSION"); return; }
        if (!history().edit().putBoolean(permission, true).commit()) {
            call.reject("Permission history is unavailable.", "PERMISSION_STATUS_UNAVAILABLE"); return;
        }
        call.resolve();
    }

    @PluginMethod
    public void permissionStatus(PluginCall call) {
        String permission = call.getString("permission");
        String nativePermission = androidPermission(permission);
        if (nativePermission == null) { call.reject("Unknown permission.", "INVALID_PERMISSION"); return; }
        try {
            JSObject result = new JSObject();
            String status;
            if ("legacy-notifications".equals(nativePermission)) {
                status = NotificationManagerCompat.from(getContext()).areNotificationsEnabled() ? "granted" : "permanentlyDenied";
            } else if (granted(nativePermission)) {
                status = "granted";
                if ("notifications".equals(permission) && !NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) status = "permanentlyDenied";
            } else if (ActivityCompat.shouldShowRequestPermissionRationale(getActivity(), nativePermission)) {
                status = "denied";
            } else {
                status = history().getBoolean(permission, false) ? "permanentlyDenied" : "notDetermined";
            }
            if ("location".equals(permission)) {
                UserManager users = (UserManager) getContext().getSystemService(Context.USER_SERVICE);
                if (users != null && users.hasUserRestriction(UserManager.DISALLOW_SHARE_LOCATION)) status = "restricted";
                LocationManager locations = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
                result.put("locationServicesEnabled", locations != null && LocationManagerCompat.isLocationEnabled(locations));
                result.put("precise", granted(Manifest.permission.ACCESS_FINE_LOCATION));
            }
            result.put("status", status);
            call.resolve(result);
        } catch (Exception ignored) { call.reject("Permission status is unavailable.", "PERMISSION_STATUS_UNAVAILABLE"); }
    }
}

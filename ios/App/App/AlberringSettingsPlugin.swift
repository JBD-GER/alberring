import AVFoundation
import Capacitor
import CoreLocation
import UIKit
import UserNotifications

@objc(AlberringSettingsPlugin)
public final class AlberringSettingsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlberringSettingsPlugin"
    public let jsName = "AlberringSettings"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "permissionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "markPermissionRequested", returnType: CAPPluginReturnPromise)
    ]

    @objc func openSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("App settings are unavailable.", "SETTINGS_UNAVAILABLE")
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                if opened { call.resolve() }
                else { call.reject("App settings are unavailable.", "SETTINGS_UNAVAILABLE") }
            }
        }
    }

    // iOS exposes notDetermined directly and needs no request-history marker.
    @objc func markPermissionRequested(_ call: CAPPluginCall) { call.resolve() }

    @objc func permissionStatus(_ call: CAPPluginCall) {
        guard let permission = call.getString("permission") else {
            call.reject("Permission is required.", "INVALID_PERMISSION"); return
        }
        DispatchQueue.main.async {
            switch permission {
            case "location":
                let manager = CLLocationManager()
                let status: String
                switch manager.authorizationStatus {
                case .notDetermined: status = "notDetermined"
                case .authorizedAlways, .authorizedWhenInUse: status = "granted"
                case .restricted: status = "restricted"
                case .denied: status = "permanentlyDenied"
                @unknown default: status = "restricted"
                }
                call.resolve(["status": status,
                              "precise": manager.accuracyAuthorization == .fullAccuracy,
                              "locationServicesEnabled": CLLocationManager.locationServicesEnabled()])
            case "camera", "microphone":
                let media: AVMediaType = permission == "camera" ? .video : .audio
                let status: String
                switch AVCaptureDevice.authorizationStatus(for: media) {
                case .notDetermined: status = "notDetermined"
                case .authorized: status = "granted"
                case .restricted: status = "restricted"
                case .denied: status = "permanentlyDenied"
                @unknown default: status = "restricted"
                }
                call.resolve(["status": status])
            case "notifications":
                UNUserNotificationCenter.current().getNotificationSettings { settings in
                    let status: String
                    switch settings.authorizationStatus {
                    case .notDetermined: status = "notDetermined"
                    case .authorized, .provisional, .ephemeral: status = "granted"
                    case .denied: status = "permanentlyDenied"
                    @unknown default: status = "restricted"
                    }
                    call.resolve(["status": status])
                }
            default: call.reject("Unknown permission.", "INVALID_PERMISSION")
            }
        }
    }
}

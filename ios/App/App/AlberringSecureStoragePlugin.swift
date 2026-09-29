import Capacitor
import Foundation
import Security

/// Only this app's authentication records; no iCloud sync or device migration.
@objc(AlberringSecureStoragePlugin)
public final class AlberringSecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AlberringSecureStoragePlugin"
    public let jsName = "AlberringSecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]
    private var service: String { (Bundle.main.bundleIdentifier ?? "de.alberring.connect") + ".auth" }

    private func query(_ call: CAPPluginCall) -> [String: Any]? {
        guard let key = call.getString("key"), !key.isEmpty, key.utf8.count <= 256 else {
            call.reject("Invalid storage key.", "INVALID_KEY")
            return nil
        }
        return [kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
                kSecAttrAccount as String: key,
                kSecAttrSynchronizable as String: false]
    }

    @objc func get(_ call: CAPPluginCall) {
        guard var query = query(call) else { return }
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            call.reject("Secure session storage is unavailable.", "SECURE_STORAGE_UNAVAILABLE")
            return
        }
        call.resolve(["value": value])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard var query = query(call) else { return }
        guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= 524288 else {
            call.reject("Invalid storage value.", "INVALID_VALUE")
            return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            query.merge(attributes) { _, replacement in replacement }
            status = SecItemAdd(query as CFDictionary, nil)
        }
        guard status == errSecSuccess else {
            call.reject("The session could not be stored securely.", "SECURE_STORAGE_UNAVAILABLE")
            return
        }
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let query = query(call) else { return }
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            call.reject("The secure session could not be removed.", "SECURE_STORAGE_UNAVAILABLE")
            return
        }
        call.resolve()
    }
}

import Capacitor

final class AlberringBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AlberringSecureStoragePlugin())
        bridge?.registerPluginInstance(AlberringSettingsPlugin())
    }

    func cancelActiveRecording() {
        guard let recorder = bridge?.plugin(withName: "CapacitorAudioRecorder") else { return }
        // The pinned plugin exports this Objective-C method through Capacitor.
        let selector = NSSelectorFromString("cancelRecording:")
        guard recorder.responds(to: selector) else { return }
        let call = CAPPluginCall(callbackId: "native-background-cancel", methodName: "cancelRecording",
                                 options: [:], success: { _, _ in }, error: { _ in })
        recorder.perform(selector, with: call)
    }
}

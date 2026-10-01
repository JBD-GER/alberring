import XCTest

// Used only by the ephemeral simulator test target. No changes to App sources.
final class StoreScreenshots: XCTestCase {
    private let app = XCUIApplication(bundleIdentifier: "de.alberring.connect")

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
    }

    private func capture(_ name: String) throws {
        XCTAssertFalse(app.keyboards.firstMatch.exists, "Keyboard must be closed in store screenshots")
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("StoreScreenshots", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try XCUIScreen.main.screenshot().pngRepresentation.write(to: directory.appendingPathComponent(name + ".png"))
    }

    func testStoreScreenshots() throws {
        let credentialsURL = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "review-access", withExtension: "json"))
        let credentials = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: credentialsURL)) as? [String: String])
        let email = try XCTUnwrap(credentials["email"])
        let password = try XCTUnwrap(credentials["password"])
        app.launchArguments = ["-AppleLanguages", "(de)", "-AppleLocale", "de_DE"]
        app.launch()
        let emailField = app.textFields.firstMatch
        guard emailField.waitForExistence(timeout: 60) else {
            // Before entering credentials, retain safe evidence of the launch failure.
            print("PRE_LOGIN_UI: \(app.debugDescription)")
            let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("LaunchDiagnostics", isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: directory.appendingPathComponent("pre-login.png"))
            XCTFail("Login form must load")
            return
        }
        emailField.tap()
        emailField.typeText(email)
        let passwordField = app.secureTextFields.firstMatch
        XCTAssertTrue(passwordField.exists)
        passwordField.tap()
        passwordField.typeText(password)
        let signIn = app.buttons["Sicher anmelden"]
        XCTAssertTrue(signIn.waitForExistence(timeout: 10))
        signIn.tap()
        let start = app.links["Start"].firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 45), "Authenticated app must load")
        for title in ["Tour für später schließen", "Tour schließen"] {
            let close = app.buttons[title]
            if close.exists && close.isHittable { close.tap() }
        }
        let loadedDashboard = app.staticTexts["Für Sie wichtig"].firstMatch
        XCTAssertTrue(loadedDashboard.waitForExistence(timeout: 25), "Dashboard data must load")
        try capture("01-dashboard")

        let chat = app.links.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", "Chat", "Chat ")).firstMatch
        XCTAssertTrue(chat.exists)
        chat.tap()
        let sampleChat = app.links.matching(NSPredicate(format: "label CONTAINS %@", "Prüfteam – Beispielchat")).firstMatch
        XCTAssertTrue(sampleChat.waitForExistence(timeout: 25), "Synthetic example chat must exist")
        sampleChat.tap()
        // Wait for chat rendering to settle before capture, without changing data.
        let messageBox = app.textViews.firstMatch
        XCTAssertTrue(messageBox.waitForExistence(timeout: 20), "Chat composer must load")
        try capture("02-chat")
        app.terminate()
    }
}

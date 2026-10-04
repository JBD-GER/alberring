require 'xcodeproj'
require 'fileutils'

# Run only on a disposable cloud checkout. App source and resources are unchanged.
project_path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == 'App' }
abort 'App target missing' unless app
abort 'Screenshot target already exists' if project.targets.any? { |target| target.name == 'StoreScreenshots' }

directory = 'ios/App/StoreScreenshots'
FileUtils.mkdir_p(directory)
FileUtils.cp('scripts/store-screenshots/StoreScreenshots.swift', directory)
credentials_path = ENV.fetch('SCREENSHOT_CREDENTIALS_FILE')
FileUtils.cp(credentials_path, File.join(directory, 'review-access.json'))
File.chmod(0600, File.join(directory, 'review-access.json'))

# The app deliberately fails closed if Keychain is unavailable. An unsigned
# simulator app has no application identifier and cannot use its private vault.
# Ad-hoc sign this disposable simulator build with the same app-scoped identity.
entitlements = {
  'application-identifier' => '4562LXMH4C.de.alberring.connect',
  'keychain-access-groups' => ['4562LXMH4C.de.alberring.connect'],
  'com.apple.developer.team-identifier' => '4562LXMH4C'
}
Xcodeproj::Plist.write_to_path(entitlements, File.join(directory, 'Simulator.entitlements'))
app.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS[sdk=iphonesimulator*]'] = 'StoreScreenshots/Simulator.entitlements'
end

target = project.new_target(:ui_test_bundle, 'StoreScreenshots', :ios, '15.0')
target.add_dependency(app)
group = project.main_group.new_group('StoreScreenshots', 'StoreScreenshots')
target.add_file_references([group.new_file('StoreScreenshots.swift')])
target.resources_build_phase.add_file_reference(group.new_file('review-access.json'))
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'SWIFT_VERSION' => '5.0',
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'ONLY_ACTIVE_ARCH' => 'YES',
    'PRODUCT_BUNDLE_IDENTIFIER' => 'de.alberring.connect.StoreScreenshots',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'TEST_TARGET_NAME' => 'App',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'CODE_SIGNING_ALLOWED' => 'YES'
  })
end
project.root_object.attributes['TargetAttributes'][target.uuid] = { 'TestTargetID' => app.uuid }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.configure_with_targets(app, target, launch_target: true)
scheme.test_action.build_configuration = 'Release'
scheme.save_as(project_path, 'StoreScreenshots', true)
puts 'Ephemeral screenshot test target configured; application sources unchanged.'

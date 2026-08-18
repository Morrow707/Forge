import Capacitor

// Capacitor 8's plugin auto-registration (see CapacitorBridge.registerPlugins
// in node_modules/@capacitor/ios) only ever reads two sources: five hardcoded
// built-in classes, and capacitor.config.json's packageClassList -- which
// `cap sync` populates from installed Capacitor plugin *packages* (an npm
// dependency with its own Package.swift/podspec). It never scans the app
// target's own Objective-C runtime for CAPBridgedPlugin conformance the way
// older Capacitor versions did, so a plugin that lives directly in this
// target's source (ArCameraPreviewPlugin.swift, ArMeasurePlugin.swift --
// neither is a separate installed package) compiles into the binary fine but
// is never actually told to register itself. That's exactly what produced
// `"ArCameraPreview" plugin is not implemented on ios` on a real device even
// though the Swift file, its @objc/jsName, and its Xcode Sources build phase
// entry were all individually correct -- registration was simply never
// invoked for it.
//
// The fix Capacitor's own docs prescribe for a local/custom native plugin is
// explicit registration via bridge.registerPluginInstance(...), called from
// capacitorDidLoad() -- the one hook that runs after the bridge exists but
// before the web view loads any JS, so both plugins are already in the
// registry by the time client/src/lib/native-ar-preview.ts or
// native-measure.ts (if that exists) makes its first call. SceneDelegate.swift
// instantiates this subclass instead of the bare CAPBridgeViewController.
class ForgeBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ArCameraPreviewPlugin())
        bridge?.registerPluginInstance(ArMeasurePlugin())
    }
}

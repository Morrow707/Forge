import Foundation
import ARKit
import SceneKit
import Capacitor

// Step one of the ARKit body-tracking swap (see bar-tracking.ts/
// bar-tracker-dialog.tsx for the MediaPipe pipeline this will eventually
// feed instead of the browser's getUserMedia camera). getUserMedia and
// ARSession can't both own the camera at once on iOS, so once this is live
// the web-side <video> element goes dark for that view and this plugin
// renders ARKit's own passthrough feed as a native view instead --
// positioned behind a transparent hole in the WebView at whatever screen
// rect the JS side reports its video container occupies (see
// native-ar-preview.ts). No skeleton/joint data is read or emitted yet --
// that's the follow-up once this preview is confirmed working on-device;
// this plugin only proves the camera feed itself renders correctly.
@objc(ArCameraPreviewPlugin)
public class ArCameraPreviewPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "ArCameraPreviewPlugin"
    public let jsName = "ArCameraPreview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRect", returnType: CAPPluginReturnPromise)
    ]

    private var previewView: ARSCNView?

    @objc func isSupported(_ call: CAPPluginCall) {
        call.resolve(["supported": ARBodyTrackingConfiguration.isSupported])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard ARBodyTrackingConfiguration.isSupported else {
            call.reject("ARBodyTrackingConfiguration is not supported on this device")
            return
        }
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView, let container = webView.superview else {
                call.reject("Bridge WebView is not available")
                return
            }

            let rect = self.rectFromCall(call)

            if let existing = self.previewView {
                existing.frame = rect
            } else {
                let scnView = ARSCNView(frame: rect)
                scnView.autoenablesDefaultLighting = true
                container.insertSubview(scnView, belowSubview: webView)
                self.previewView = scnView

                // Only the one DOM container the JS side clears `background`
                // on actually shows anything through this -- Forge's body
                // element always paints its own opaque background (see
                // index.css), so the rest of the app is unaffected by the
                // WebView itself becoming transparent here.
                webView.isOpaque = false
                webView.backgroundColor = .clear
                webView.scrollView.backgroundColor = .clear
            }

            let configuration = ARBodyTrackingConfiguration()
            self.previewView?.session.delegate = self
            self.previewView?.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.previewView?.session.pause()
            self.previewView?.removeFromSuperview()
            self.previewView = nil
            call.resolve()
        }
    }

    @objc func updateRect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.previewView?.frame = self.rectFromCall(call)
            call.resolve()
        }
    }

    private func rectFromCall(_ call: CAPPluginCall) -> CGRect {
        let x = call.getDouble("x") ?? 0
        let y = call.getDouble("y") ?? 0
        let width = call.getDouble("width") ?? UIScreen.main.bounds.width
        let height = call.getDouble("height") ?? UIScreen.main.bounds.height
        return CGRect(x: x, y: y, width: width, height: height)
    }
}

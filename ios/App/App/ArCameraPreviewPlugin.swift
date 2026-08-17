import Foundation
import ARKit
import SceneKit
import simd
import Capacitor

// Step one of the ARKit body-tracking swap (see bar-tracking.ts/
// bar-tracker-dialog.tsx for the MediaPipe pipeline this will eventually
// feed instead of the browser's getUserMedia camera). getUserMedia and
// ARSession can't both own the camera at once on iOS, so once this is live
// the web-side <video> element goes dark for that view and this plugin
// renders ARKit's own passthrough feed as a native view instead --
// positioned behind a transparent hole in the WebView at whatever screen
// rect the JS side reports its video container occupies (see
// native-ar-preview.ts).
//
// Body-tracking joints are now read and emitted (see session(_:didUpdate
// frame:) below) as the "bodyTracking" JS event -- see
// client/src/lib/native-ar-preview.ts's onBodyTracking. Still just the raw
// joints, though: the velocity/asymmetry/power math pose-tracking.ts
// currently derives from MediaPipe's 2D landmarks hasn't been ported to
// consume these 3D ones yet, so nothing in the app actually listens for
// this event yet -- that's the next step once real device testing confirms
// the joint data itself looks right.
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
    // Throttles the "bodyTracking" JS event to ~30fps -- ARKit can deliver
    // frame updates faster than that on some devices, and the analytics
    // math this eventually feeds (see pose-tracking.ts's velocity/tempo
    // calculations) doesn't need more resolution than a typical
    // getUserMedia video already gave it.
    private var lastEmitTimestamp: TimeInterval = 0
    private let emitIntervalSeconds: TimeInterval = 1.0 / 30.0
    private var hadBody = false
    // ARSkeletonDefinition.defaultBody3D.jointNames is index-matched to
    // ARSkeleton3D.jointModelTransforms -- read once and reused rather than
    // hardcoding ARKit's internal joint-name strings (which aren't exposed
    // as individual named constants the way .root/.head/.leftHand/
    // .rightHand are), so a wrong guessed string can't silently drop a
    // joint. The JS side maps these ARKit joint names to the specific ones
    // it needs by name, not index, once that mapping is worked out from a
    // real device's actual joint list.
    private let jointNames = ARSkeletonDefinition.defaultBody3D.jointNames

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

            self.hadBody = false
            self.lastEmitTimestamp = 0
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

    // MARK: - ARSessionDelegate

    // One ARBodyAnchor per session -- single-person tracking is what
    // ARBodyTrackingConfiguration is designed for -- read every frame and
    // forwarded to JS as real-world joint positions. jointModelTransforms
    // are relative to the body anchor's own root joint; composing with
    // bodyAnchor.transform (the root's own position/orientation in world
    // space) gives each joint's position in the same world coordinate
    // space ARKit reports everything else in, in meters.
    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let bodyAnchor = frame.anchors.compactMap { $0 as? ARBodyAnchor }.first

        guard let bodyAnchor = bodyAnchor else {
            if hadBody {
                hadBody = false
                notifyListeners("bodyTracking", data: ["tracked": false])
            }
            return
        }

        if frame.timestamp - lastEmitTimestamp < emitIntervalSeconds { return }
        lastEmitTimestamp = frame.timestamp
        hadBody = true

        let rootTransform = bodyAnchor.transform
        let modelTransforms = bodyAnchor.skeleton.jointModelTransforms
        var joints: [[String: Any]] = []
        joints.reserveCapacity(jointNames.count)
        for (index, name) in jointNames.enumerated() where index < modelTransforms.count {
            let worldTransform = simd_mul(rootTransform, modelTransforms[index])
            let position = worldTransform.columns.3
            joints.append([
                "name": name,
                "x": Double(position.x),
                "y": Double(position.y),
                "z": Double(position.z),
            ])
        }

        // Straight-line distance from the camera to the body's root joint --
        // both transforms are in the same world space, so this is just the
        // distance between their translation components. Lets the JS side
        // warn "step back" / "come closer" before a set even starts instead
        // of only finding out tracking was unreliable after the fact.
        let cameraPosition = frame.camera.transform.columns.3
        let rootPosition = rootTransform.columns.3
        let distanceMeters = Double(simd_distance(cameraPosition, rootPosition))

        notifyListeners("bodyTracking", data: [
            "tracked": true,
            "timestamp": frame.timestamp * 1000,
            "estimatedScaleFactor": Double(bodyAnchor.estimatedScaleFactor),
            "distanceMeters": distanceMeters,
            "joints": joints,
        ])
    }
}

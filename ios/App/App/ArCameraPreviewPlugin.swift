import Foundation
import ARKit
import SceneKit
import AVFoundation
import simd
import Capacitor

// The ARKit body-tracking swap, one tracker mode at a time (see
// bar-tracking.ts/bar-tracker-dialog.tsx for the MediaPipe pipeline this
// replaces, mode by mode, on iOS). getUserMedia and ARSession can't both
// own the camera at once, so once this is running for a given dialog the
// web-side <video> element goes dark for that view and this plugin renders
// ARKit's own passthrough feed as a native view instead -- positioned
// behind a transparent hole in the WebView at whatever screen rect the JS
// side reports its video container occupies (see native-ar-preview.ts).
//
// Body-tracking joints are read every frame and emitted (see
// session(_:didUpdate frame:) below) as the "bodyTracking" JS event -- see
// client/src/lib/native-ar-preview.ts's onBodyTracking. ar-body-landmarks.ts
// bridges these into the same shape pose-tracking.ts's MediaPipe-derived
// math already consumes, so jump mode (ar-jump-tracker-dialog.tsx) already
// runs on this unmodified. A live skeleton -- spheres at each joint,
// cylinders for bones, placed as real nodes at these same world positions
// -- renders on top of the passthrough feed every frame, independent of
// the ~30fps JS-emission throttle (see updateSkeletonVisual). Also running
// in this same session, never rendered: plane detection, purely for the
// tracking-accuracy benefit -- see the comment on configuration.planeDetection
// in start() below. (Scene reconstruction/LiDAR mesh was tried alongside it
// and reverted -- ARBodyTrackingConfiguration has no sceneReconstruction
// member on this SDK, confirmed by two separate CI failures, not just
// assumed from docs.)
//
// Implement (barbell/dumbbell/kettlebell) tracking -- start(trackImplement:
// true) only, for a bar-path/full mode dialog -- runs ArImplementTracker
// (see its own file comment) once per hand every frame, unthrottled same as
// the skeleton visual, with only the JS-facing leftImplement/rightImplement
// fields on "bodyTracking" gated by the emission throttle. Its search
// window centers on each hand joint projected into capturedImage's own
// pixel space (a DIFFERENT projection than hipScreenX/Y above -- that one
// targets the portrait display; this one targets the raw landscape sensor
// buffer capturedImage's bytes are laid out in).
@objc(ArCameraPreviewPlugin)
public class ArCameraPreviewPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "ArCameraPreviewPlugin"
    public let jsName = "ArCameraPreview"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resetImplementTracking", returnType: CAPPluginReturnPromise)
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
    // Index-matched to jointNames -- each joint's parent joint index in the
    // skeleton hierarchy (the root has no parent). This is exactly the
    // connectivity graph updateSkeletonVisual needs to draw bones, the same
    // way Apple's own "Capturing Body Motion in 3D" sample does it.
    private let parentIndices = ARSkeletonDefinition.defaultBody3D.parentIndices

    // MARK: - Skeleton visual (see updateSkeletonVisual's own comment)
    private static let skeletonColor = UIColor(red: 0.176, green: 0.831, blue: 0.686, alpha: 1.0) // #2dd4bf, matches the app's other tracker overlays
    private var skeletonNode: SCNNode?
    private var jointNodes: [String: SCNNode] = [:]
    private var boneNodes: [Int: SCNNode] = [:]

    // MARK: - Implement (barbell/dumbbell/kettlebell) tracking -- see
    // ArImplementTracker's own file comment for the algorithm. Off by
    // default (jump/sprint dialogs never set it) -- only a bar-path/full
    // mode dialog passes trackImplement:true to start(), since motion-diff
    // scanning capturedImage every frame is wasted work for a mode with
    // nothing held. One instance per hand, exactly mirroring
    // implement-tracking.ts's leftImplementTrackerRef/rightImplementTrackerRef
    // -- a two-handed grip (barbell) needs both sides independently tracked
    // for bar tilt to mean anything; a one-handed implement (dumbbell,
    // kettlebell) just leaves the other side's result unused, same as the
    // JS version.
    private var trackImplement = false
    private let leftImplementTracker = ArImplementTracker()
    private let rightImplementTracker = ArImplementTracker()

    // MARK: - Recording (see appendVideoFrame's own comment)
    private var isRecording = false
    private var recordingOutputURL: URL?
    private var assetWriter: AVAssetWriter?
    private var assetWriterInput: AVAssetWriterInput?
    private var pixelBufferAdaptor: AVAssetWriterInputPixelBufferAdaptor?
    private var recordingStartTime: TimeInterval?

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

                let skeleton = SCNNode()
                scnView.scene.rootNode.addChildNode(skeleton)
                self.skeletonNode = skeleton

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
            self.trackImplement = call.getBool("trackImplement") ?? false
            self.leftImplementTracker.reset()
            self.rightImplementTracker.reset()
            let configuration = ARBodyTrackingConfiguration()
            // Runs in the SAME session as body tracking -- no separate
            // ARSession needed. Never rendered -- no grid, no mesh
            // visualization -- this is purely for the accuracy benefit: a
            // detected floor plane gives the tracker a stable real-world
            // reference. NOT paired with sceneReconstruction (LiDAR mesh) --
            // that was tried and reverted (CI caught it twice: unlike
            // ARWorldTrackingConfiguration, ARBodyTrackingConfiguration has
            // no sceneReconstruction member at all on this SDK, despite what
            // its docs page seemed to say -- the compiler is the actual
            // source of truth here, not the docs). LiDAR's accuracy benefit
            // for body tracking, if any, isn't available through this
            // configuration.
            configuration.planeDetection = [.horizontal]
            // Explicit high-fps capture, not whatever Apple's default
            // happens to be -- a fast movement (a bar's concentric drive, a
            // sprint stride) motion-blurs measurably worse at a
            // conservative default rate than at the fastest rate this
            // device's body-tracking pipeline actually supports.
            // supportedVideoFormats is declared on the ARConfiguration base
            // class (unlike sceneReconstruction above, which genuinely
            // isn't inherited -- see that comment), so every subclass,
            // including ARBodyTrackingConfiguration, has a real list to
            // pick from here. One thing this can't promise: ARKit's body-
            // tracking joint UPDATES may still be throttled by the ML
            // model's own inference rate regardless of capture format --
            // this raises the ceiling capture can hit, it doesn't
            // necessarily raise the joint data rate to match.
            if let fastestFormat = ARBodyTrackingConfiguration.supportedVideoFormats.max(
                by: { $0.framesPerSecond < $1.framesPerSecond }
            ) {
                configuration.videoFormat = fastestFormat
            }
            self.previewView?.session.delegate = self
            self.previewView?.session.run(configuration, options: [.resetTracking, .removeExistingAnchors])
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // A recording nobody explicitly stopped (dialog closed/backgrounded
            // mid-capture) shouldn't leave a writer dangling -- cancelWriting
            // discards whatever was written rather than trying to finalize a
            // clip nothing asked for.
            if self.isRecording {
                self.isRecording = false
                self.assetWriter?.cancelWriting()
                self.assetWriter = nil
                self.assetWriterInput = nil
                self.pixelBufferAdaptor = nil
                self.recordingOutputURL = nil
            }
            self.previewView?.session.pause()
            self.previewView?.removeFromSuperview()
            self.previewView = nil
            // The scene (and every node in it, skeletonNode included) tears
            // down along with previewView above -- these dictionaries would
            // otherwise hold references to now-dead nodes.
            self.skeletonNode = nil
            self.jointNodes.removeAll()
            self.boneNodes.removeAll()
            self.trackImplement = false
            self.leftImplementTracker.reset()
            self.rightImplementTracker.reset()
            call.resolve()
        }
    }

    // Called at the start of each new tracked set (not each dialog open --
    // one AR session/dialog open covers multiple sets) so a lock held from
    // the previous set can't carry into the first frame of the next one.
    // Mirrors implement-tracking.ts's own ImplementTracker.reset(), called
    // the same way from bar-tracker-dialog.tsx's startTracking().
    @objc func resetImplementTracking(_ call: CAPPluginCall) {
        leftImplementTracker.reset()
        rightImplementTracker.reset()
        call.resolve()
    }

    // Video isn't recorded from a browser getUserMedia stream the way the
    // MediaPipe-tracked dialogs do (there is no browser stream once this
    // plugin owns the camera -- see the file-level comment) -- instead this
    // writes ARFrame.capturedImage straight to an MP4 as ARSession delivers
    // frames, via AVAssetWriter. startRecording only flips a flag; the
    // writer itself is created lazily on the first frame that actually
    // arrives afterward (see appendVideoFrame), since only then is the
    // captured image's real pixel dimensions known.
    @objc func startRecording(_ call: CAPPluginCall) {
        guard !isRecording else {
            call.reject("Already recording")
            return
        }
        recordingOutputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        recordingStartTime = nil
        isRecording = true
        call.resolve()
    }

    @objc func stopRecording(_ call: CAPPluginCall) {
        guard isRecording else {
            call.reject("Not recording")
            return
        }
        isRecording = false
        guard let writer = assetWriter, let outputURL = recordingOutputURL, writer.status == .writing else {
            // No frames ever actually landed (e.g. stopped an instant after
            // starting, before the next ARFrame arrived) -- nothing to
            // finalize.
            assetWriter = nil
            assetWriterInput = nil
            pixelBufferAdaptor = nil
            recordingOutputURL = nil
            call.reject("No frames were captured")
            return
        }
        assetWriterInput?.markAsFinished()
        writer.finishWriting { [weak self] in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if writer.status == .completed {
                    call.resolve(["path": outputURL.path])
                } else {
                    call.reject(writer.error?.localizedDescription ?? "Recording failed")
                }
                self.assetWriter = nil
                self.assetWriterInput = nil
                self.pixelBufferAdaptor = nil
                self.recordingOutputURL = nil
            }
        }
    }

    // Runs on every ARFrame regardless of body-detection state or the
    // joint-emission throttle in session(_:didUpdate:) below -- a capture
    // with a moment of no body in frame (setting up, walking into position)
    // shouldn't have a gap in the video. ARKit's captured image is always
    // the sensor's native landscape orientation no matter how the phone is
    // held; the app records portrait everywhere else, so this tags the
    // output with a 90° rotation transform (metadata-level, not a re-encode)
    // the same way AVCaptureConnection.videoOrientation = .portrait would
    // for the equivalent getUserMedia-based capture.
    private func appendVideoFrame(_ frame: ARFrame) {
        guard isRecording, let outputURL = recordingOutputURL else { return }

        if assetWriter == nil {
            let resolution = frame.camera.imageResolution
            guard let writer = try? AVAssetWriter(outputURL: outputURL, fileType: .mp4) else {
                isRecording = false
                recordingOutputURL = nil
                return
            }
            let videoSettings: [String: Any] = [
                AVVideoCodecKey: AVVideoCodecType.h264,
                AVVideoWidthKey: Int(resolution.width),
                AVVideoHeightKey: Int(resolution.height)
            ]
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
            input.expectsMediaDataInRealTime = true
            input.transform = CGAffineTransform(rotationAngle: .pi / 2)
            let adaptor = AVAssetWriterInputPixelBufferAdaptor(
                assetWriterInput: input,
                sourcePixelBufferAttributes: [
                    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
                ]
            )
            guard writer.canAdd(input) else { return }
            writer.add(input)
            writer.startWriting()
            writer.startSession(atSourceTime: .zero)
            assetWriter = writer
            assetWriterInput = input
            pixelBufferAdaptor = adaptor
            recordingStartTime = frame.timestamp
        }

        guard let writer = assetWriter, writer.status == .writing,
              let input = assetWriterInput, input.isReadyForMoreMediaData,
              let adaptor = pixelBufferAdaptor,
              let startTime = recordingStartTime else { return }
        let presentationTime = CMTime(seconds: frame.timestamp - startTime, preferredTimescale: 600)
        adaptor.append(frame.capturedImage, withPresentationTime: presentationTime)
    }

    // Live skeleton overlay -- small spheres at each joint, thin cylinders
    // for bones, placed as real nodes at ARKit's own world-space joint
    // positions directly in the AR scene. This needs no manual camera-
    // projection math: SceneKit is a real 3D renderer, so a node placed at
    // a world position already draws perspective-correct wherever the
    // camera is looking, the same as any other AR content. Runs every
    // frame regardless of the JS-emission throttle in
    // session(_:didUpdate:) -- native rendering should stay smooth even
    // though the JS side doesn't need more than ~30fps of joint data.
    private func updateSkeletonVisual(positions: [String: SIMD3<Float>]) {
        guard let root = skeletonNode else { return }
        root.isHidden = false

        for (index, name) in jointNames.enumerated() {
            guard let pos = positions[name] else { continue }
            let jointNode: SCNNode
            if let existing = jointNodes[name] {
                jointNode = existing
            } else {
                let sphere = SCNSphere(radius: 0.015)
                sphere.firstMaterial?.diffuse.contents = Self.skeletonColor
                sphere.firstMaterial?.lightingModel = .constant
                jointNode = SCNNode(geometry: sphere)
                root.addChildNode(jointNode)
                jointNodes[name] = jointNode
            }
            jointNode.simdPosition = pos

            guard index < parentIndices.count else { continue }
            // ARSkeletonDefinition.parentIndices is NSArray<NSNumber *> in
            // the raw Objective-C header (NS_REFINED_FOR_SWIFT) -- Apple's
            // Swift overlay exposes the refined version as a plain [Int],
            // not [NSNumber], so this reads it directly rather than via
            // .intValue.
            let parentIdx = parentIndices[index]
            guard parentIdx >= 0, parentIdx < jointNames.count else { continue }
            guard let parentPos = positions[jointNames[parentIdx]] else { continue }

            let boneNode: SCNNode
            if let existing = boneNodes[index] {
                boneNode = existing
            } else {
                let cylinder = SCNCylinder(radius: 0.008, height: 1)
                cylinder.firstMaterial?.diffuse.contents = Self.skeletonColor
                cylinder.firstMaterial?.lightingModel = .constant
                boneNode = SCNNode(geometry: cylinder)
                root.addChildNode(boneNode)
                boneNodes[index] = boneNode
            }
            orientBone(boneNode, from: parentPos, to: pos)
        }
    }

    // Standard "align a default-up-axis cylinder to point along an
    // arbitrary direction" quaternion: rotation axis is the cross product
    // of the cylinder's default up vector and the target direction,
    // rotation angle is the angle between them.
    private func orientBone(_ node: SCNNode, from: SIMD3<Float>, to: SIMD3<Float>) {
        let vector = to - from
        let distance = simd_length(vector)
        node.simdPosition = (from + to) * 0.5
        if let cylinder = node.geometry as? SCNCylinder {
            cylinder.height = CGFloat(max(distance, 0.001))
        }
        guard distance > 0.0001 else { return }
        let up = SIMD3<Float>(0, 1, 0)
        let dir = vector / distance
        let dot = simd_dot(up, dir)
        if dot > 0.9999 {
            node.simdOrientation = simd_quatf(angle: 0, axis: SIMD3<Float>(1, 0, 0))
        } else if dot < -0.9999 {
            node.simdOrientation = simd_quatf(angle: .pi, axis: SIMD3<Float>(1, 0, 0))
        } else {
            let axis = simd_normalize(simd_cross(up, dir))
            node.simdOrientation = simd_quatf(angle: acos(dot), axis: axis)
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
        appendVideoFrame(frame)

        let bodyAnchor = frame.anchors.compactMap { $0 as? ARBodyAnchor }.first

        guard let bodyAnchor = bodyAnchor else {
            skeletonNode?.isHidden = true
            // A body-tracking dropout can span an arbitrary gap (the
            // athlete stepped out of frame, tracking got lost) -- a held
            // implement lock, or even just the stale previous-frame luma
            // buffer, isn't trustworthy to resume from once tracking picks
            // back up. Full reset, not just rejectLock, clears that stale
            // buffer too.
            if trackImplement {
                leftImplementTracker.reset()
                rightImplementTracker.reset()
            }
            if hadBody {
                hadBody = false
                notifyListeners("bodyTracking", data: ["tracked": false])
            }
            return
        }

        hadBody = true

        let rootTransform = bodyAnchor.transform
        let modelTransforms = bodyAnchor.skeleton.jointModelTransforms
        // Built once, fed to both the skeleton visual (below, every frame)
        // and the JS-facing joints array (below the emission throttle) --
        // positions is a name-keyed lookup the visual needs for bone
        // endpoints; joints preserves the original array shape/order JS
        // already expects, unchanged by adding the visual.
        var positions: [String: SIMD3<Float>] = [:]
        var joints: [[String: Any]] = []
        positions.reserveCapacity(jointNames.count)
        joints.reserveCapacity(jointNames.count)
        for (index, name) in jointNames.enumerated() where index < modelTransforms.count {
            let worldTransform = simd_mul(rootTransform, modelTransforms[index])
            let column = worldTransform.columns.3
            let pos = SIMD3<Float>(column.x, column.y, column.z)
            positions[name] = pos
            joints.append(["name": name, "x": Double(pos.x), "y": Double(pos.y), "z": Double(pos.z)])
        }
        updateSkeletonVisual(positions: positions)

        // Runs every frame, unthrottled, same reasoning as the skeleton
        // visual above -- ArImplementTracker's motion diff needs
        // frame-to-frame continuity, and only the JS-facing result below
        // (not the tracking itself) is throttled to emitIntervalSeconds.
        var leftImplementResult: ArImplementTracker.TrackResult?
        var rightImplementResult: ArImplementTracker.TrackResult?
        if trackImplement {
            let imageViewport = frame.camera.imageResolution
            if let leftWristWorld = findJointPosition(positions, exact: "left_hand_joint", keyword: "left_hand") {
                let screen = frame.camera.projectPoint(
                    leftWristWorld, orientation: .landscapeRight, viewportSize: imageViewport
                )
                leftImplementResult = leftImplementTracker.track(
                    frame: frame, wristImageX: Double(screen.x), wristImageY: Double(screen.y), wristWorld: leftWristWorld
                )
                leftImplementResult = plausibilityGated(leftImplementResult, against: leftWristWorld, tracker: leftImplementTracker)
            } else {
                leftImplementTracker.rejectLock()
            }
            if let rightWristWorld = findJointPosition(positions, exact: "right_hand_joint", keyword: "right_hand") {
                let screen = frame.camera.projectPoint(
                    rightWristWorld, orientation: .landscapeRight, viewportSize: imageViewport
                )
                rightImplementResult = rightImplementTracker.track(
                    frame: frame, wristImageX: Double(screen.x), wristImageY: Double(screen.y), wristWorld: rightWristWorld
                )
                rightImplementResult = plausibilityGated(rightImplementResult, against: rightWristWorld, tracker: rightImplementTracker)
            } else {
                rightImplementTracker.rejectLock()
            }
        }

        if frame.timestamp - lastEmitTimestamp < emitIntervalSeconds { return }
        lastEmitTimestamp = frame.timestamp

        // Straight-line distance from the camera to the body's root joint --
        // both transforms are in the same world space, so this is just the
        // distance between their translation components. Lets the JS side
        // warn "step back" / "come closer" before a set even starts instead
        // of only finding out tracking was unreliable after the fact.
        let cameraPosition = frame.camera.transform.columns.3
        let rootPosition = rootTransform.columns.3
        let distanceMeters = Double(simd_distance(cameraPosition, rootPosition))

        // Hip root projected into normalized (0-1) on-screen space -- the
        // one piece sprint-tracking.ts's checkpoint-crossing model needs
        // that world-space joints alone can't give it: a start/finish
        // checkpoint is a screen position the coach taps, so the tracked
        // reference point needs to be comparable in that same screen space,
        // not real-world meters. projectPoint does the same 3D-to-2D
        // projection SceneKit already does implicitly to render the
        // skeleton on screen, just handed back as a point instead of drawn.
        // .portrait matches this plugin's one fixed orientation (see
        // appendVideoFrame's own rotation-transform comment -- there's no
        // dynamic orientation handling anywhere else in this file either).
        let viewportSize = previewView?.bounds.size ?? UIScreen.main.bounds.size
        let hipScreen = frame.camera.projectPoint(
            SIMD3<Float>(rootPosition.x, rootPosition.y, rootPosition.z),
            orientation: .portrait,
            viewportSize: viewportSize
        )
        let hipScreenX = viewportSize.width > 0 ? Double(hipScreen.x / viewportSize.width) : 0
        let hipScreenY = viewportSize.height > 0 ? Double(hipScreen.y / viewportSize.height) : 0

        var data: [String: Any] = [
            "tracked": true,
            "timestamp": frame.timestamp * 1000,
            "estimatedScaleFactor": Double(bodyAnchor.estimatedScaleFactor),
            "distanceMeters": distanceMeters,
            "hipScreenX": hipScreenX,
            "hipScreenY": hipScreenY,
            "joints": joints,
        ]
        if trackImplement {
            data["leftImplement"] = implementResultDict(leftImplementResult)
            data["rightImplement"] = implementResultDict(rightImplementResult)
        }
        notifyListeners("bodyTracking", data: data)
    }

    // Exact match first (ARKit's actual joint-name string, if this guess is
    // right), substring keyword second -- same two-tier matching
    // ar-body-landmarks.ts's findJoint already uses for these same guessed
    // names, kept in sync deliberately: there should only be ONE guess
    // about ARKit's hand-joint naming to verify against a real device, not
    // a second, possibly-different one living here.
    private func findJointPosition(_ positions: [String: SIMD3<Float>], exact: String, keyword: String) -> SIMD3<Float>? {
        if let pos = positions[exact] { return pos }
        for (name, pos) in positions where name.lowercased().contains(keyword) {
            return pos
        }
        return nil
    }

    // No real implement plausibly sits this far from the hand holding it --
    // same 0.35m ceiling and same reasoning as bar-tracker-dialog.tsx's own
    // MAX_PLAUSIBLE_GRIP_OFFSET_M check, just moved to where the tracked
    // result is actually produced instead of round-tripped through JS to
    // apply it there. A found "implement" this far from the wrist is
    // something else that happened to move nearby (a spotter's hand, a
    // reflection) -- reject the lock so the NEXT frame reacquires clean
    // rather than continuing to dead-reckon from a position just proven
    // wrong.
    private let maxPlausibleGripOffsetM: Float = 0.35

    private func plausibilityGated(
        _ result: ArImplementTracker.TrackResult?,
        against wristWorld: SIMD3<Float>,
        tracker: ArImplementTracker
    ) -> ArImplementTracker.TrackResult? {
        guard let result = result else { return nil }
        guard simd_distance(result.world, wristWorld) <= maxPlausibleGripOffsetM else {
            tracker.rejectLock()
            return nil
        }
        return result
    }

    private func implementResultDict(_ result: ArImplementTracker.TrackResult?) -> [String: Any]? {
        guard let result = result else { return nil }
        var dict: [String: Any] = [
            "x": Double(result.world.x),
            "y": Double(result.world.y),
            "z": Double(result.world.z),
            "confidence": result.confidence,
        ]
        if let color = result.color {
            dict["color"] = ["r": color.r, "g": color.g, "b": color.b]
        }
        return dict
    }
}

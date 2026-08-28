import Foundation
import AVFoundation
import CoreMedia
import CoreVideo
import Vision
import UIKit
import Capacitor

// Phase 1 of the AVFoundation + Vision tracking pipeline that replaces ARKit on iOS (see
// ArCameraPreviewPlugin.swift's own file comment for why -- a long on-device investigation
// confirmed ARKit's captured pixel data is genuinely, unfixably out of focus, with no public
// API to control focus/zoom/lens selection at all). ArCameraPreviewPlugin.swift and the
// ar-*-tracker-dialog.tsx files it powers are NOT touched by this work -- they stay exactly
// as they are, kept only as an untouched fallback, dead code once this pipeline replaces them.
//
// Phase 1 proved the camera side: a plain AVCaptureSession (the same foundation the stock
// Camera app uses) gives real zoom, real lens switching, and real autofocus/exposure that
// ARKit's ARSession never exposed a public API for. Phase 2 (analyzeRecording, below) adds
// Vision body-pose detection run OFFLINE against a recording already on disk -- not a live
// sample-buffer delegate -- see this file's own comment on record-first/analyze-later for why:
// running VNDetectHumanBodyPoseRequest live against a 60fps 4K feed would thermally throttle
// an older device the same way live ARKit inference risked. Still no object/implement tracking
// -- that's Phase 5.
//
// Positioned behind the WebView the same way ArCameraPreviewPlugin's ARSCNView is (see its own
// comment on webView.isOpaque / insertSubview(belowSubview:)) -- the JS side punches a
// transparent hole in its own DOM at whatever rect its video container occupies, and this
// plugin's AVCaptureVideoPreviewLayer renders behind that hole.
//
// Records to disk via AVCaptureMovieFileOutput -- AVFoundation's own native movie writer, not
// the hand-rolled AVAssetWriter-per-frame loop ArCameraPreviewPlugin.swift had to build for
// ARFrame.capturedImage. Record-first, analyze-later: Vision processing against the recorded
// clip runs offline afterward (Phase 2+), not live against the capture session, to avoid
// thermally throttling an older device the way live 60fps ML inference against a 4K feed
// would (this app already has direct on-device proof thermal state is a real, measurable
// variable -- see the AR camera diagnostic work that motivated this whole rewrite).
@objc(AvBodyTrackingPlugin)
public class AvBodyTrackingPlugin: CAPPlugin, CAPBridgedPlugin, AVCaptureFileOutputRecordingDelegate {
    public let identifier = "AvBodyTrackingPlugin"
    public let jsName = "AvBodyTracking"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCameraPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateRect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listLenses", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "selectLens", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setZoom", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFocusPoint", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "analyzeRecording", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAnalysis", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDiagnosticLog", returnType: CAPPluginReturnPromise)
    ]

    // Same buffered-log pattern as ArCameraPreviewPlugin.swift's diagLogBuffer -- see its own
    // comment on why polling getDiagnosticLog() beats relying on a live event alone.
    private var diagLogBuffer: [String] = []
    private func logDiag(_ message: String) {
        diagLogBuffer.append(message)
        notifyListeners("diagnosticLog", data: ["message": message])
    }

    @objc func getDiagnosticLog(_ call: CAPPluginCall) {
        call.resolve(["log": diagLogBuffer])
    }

    private var session: AVCaptureSession?
    private var previewLayerView: UIView?
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var currentInput: AVCaptureDeviceInput?
    private var movieOutput: AVCaptureMovieFileOutput?
    private var recordingCall: CAPPluginCall?
    private var backgroundTaskID: UIBackgroundTaskIdentifier = .invalid

    // Session configuration/startRunning happens off the main thread -- startRunning() in
    // particular is a blocking call Apple's own docs warn can take noticeable time, and
    // nothing here needs it to be synchronous with the UI work in continueStart.
    private static let sessionQueue = DispatchQueue(label: "com.forge.avbodytracking.session")
    // Separate from sessionQueue -- Phase 2's frame-by-frame Vision analysis can run at the
    // same time a new preview session is starting for the next set, and shouldn't contend
    // with (or block) camera setup.
    private static let analysisQueue = DispatchQueue(label: "com.forge.avbodytracking.analysis")
    private var analysisBackgroundTaskID: UIBackgroundTaskIdentifier = .invalid
    // Checked once per frame inside runPoseAnalysis's while loop -- real cancellation, not
    // just the JS side hiding its own spinner while the native loop keeps running to
    // completion regardless. Reset at the start of every new analyzeRecording call so a
    // stale cancellation from a previous (already-finished) analysis can't immediately
    // abort the next one.
    private var analysisCancelled = false

    // The public, documented Vision joint names this plugin reports -- unlike ARKit's own
    // joint-name strings (which needed on-device discovery to nail down, per
    // ArCameraPreviewPlugin.swift's own comment), these are Apple's own documented
    // VNHumanBodyPoseObservation.JointName constants, mapped to plain camelCase strings for
    // the JS bridge. ~19 joints, no hands/face detail -- matches the plan's own accounting.
    private static let bodyPoseJoints: [(VNHumanBodyPoseObservation.JointName, String)] = [
        (.nose, "nose"), (.leftEye, "leftEye"), (.rightEye, "rightEye"),
        (.leftEar, "leftEar"), (.rightEar, "rightEar"), (.neck, "neck"),
        (.leftShoulder, "leftShoulder"), (.rightShoulder, "rightShoulder"),
        (.leftElbow, "leftElbow"), (.rightElbow, "rightElbow"),
        (.leftWrist, "leftWrist"), (.rightWrist, "rightWrist"),
        (.root, "root"), (.leftHip, "leftHip"), (.rightHip, "rightHip"),
        (.leftKnee, "leftKnee"), (.rightKnee, "rightKnee"),
        (.leftAnkle, "leftAnkle"), (.rightAnkle, "rightAnkle"),
    ]

    @objc func isSupported(_ call: CAPPluginCall) {
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        call.resolve([
            // Any built-in camera at all -- unlike ARBodyTrackingConfiguration.isSupported
            // (TrueDepth-front-camera-gated on some devices), a plain AVCaptureSession works
            // with any lens, so "supported" here just means "does this device have a camera."
            "supported": AVCaptureDevice.default(for: .video) != nil,
            "cameraPermission": authorizationStatusString(status),
        ])
    }

    private func authorizationStatusString(_ status: AVAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "unknown"
        }
    }

    // Standalone isolation test, same purpose as ArCameraPreviewPlugin's own
    // requestCameraPermission -- proves the permission prompt itself fires, independent of
    // start()'s own session/view setup.
    @objc func requestCameraPermission(_ call: CAPPluginCall) {
        logDiag("requestCameraPermission() called")
        AVCaptureDevice.requestAccess(for: .video) { granted in
            DispatchQueue.main.async {
                self.logDiag("requestCameraPermission result: \(granted ? "granted" : "denied")")
                call.resolve(["granted": granted])
            }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        diagLogBuffer.removeAll()
        logDiag("start() called")
        purgeStaleRecordings()

        // Explicit authorizationStatus handling -- ARKit's ARSession absorbed this
        // complexity internally; a bare AVCaptureSession doesn't, so this plugin owns
        // telling the JS side clearly (a "sessionError" event, not a silently blank
        // preview) whenever access was already denied rather than merely undetermined.
        let status = AVCaptureDevice.authorizationStatus(for: .video)
        logDiag("authorizationStatus=\(status.rawValue)")
        switch status {
        case .authorized:
            continueStart(call)
        case .notDetermined:
            logDiag("requesting camera permission...")
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    self.logDiag("permission result: \(granted ? "granted" : "denied")")
                    guard granted else {
                        self.notifyListeners("sessionError", data: ["message": "Camera access denied"])
                        call.reject("Camera access denied -- enable it in Settings > Forge > Camera")
                        return
                    }
                    self.continueStart(call)
                }
            }
        case .denied, .restricted:
            logDiag("FAILED: camera permission previously denied/restricted")
            let message = "Camera access denied -- enable it in Settings > Forge > Camera"
            notifyListeners("sessionError", data: ["message": message])
            call.reject(message)
        @unknown default:
            logDiag("FAILED: unknown authorization status")
            call.reject("Unknown camera authorization status")
        }
    }

    private func continueStart(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.logDiag("continueStart() running")
            let device = UIDevice.current
            self.logDiag("device model=\(device.model) systemVersion=\(device.systemVersion)")
            guard let webView = self.bridge?.webView, let container = webView.superview else {
                self.logDiag("FAILED: bridge webView/superview not available")
                call.reject("Bridge WebView is not available")
                return
            }

            let rect = self.rectFromCall(call)
            self.logDiag("rect: \(rect)")

            let lensPreference = call.getString("lens") ?? "wide"
            guard let captureDevice = self.pickCaptureDevice(preferring: lensPreference) else {
                self.logDiag("FAILED: no capture device available")
                call.reject("No camera device available")
                return
            }
            self.logDiag("using lens: \(self.lensId(for: captureDevice.deviceType))")

            // A fresh session every start() call, not a reuse branch -- unlike
            // ArCameraPreviewPlugin's ARSCNView (heavier, more stateful), an AVCaptureSession
            // is cheap to recreate, and stop() below always fully tears the previous one down.
            let session = AVCaptureSession()
            session.beginConfiguration()
            if session.canSetSessionPreset(.hd1920x1080) {
                session.sessionPreset = .hd1920x1080
            }

            do {
                let input = try AVCaptureDeviceInput(device: captureDevice)
                guard session.canAddInput(input) else {
                    self.logDiag("FAILED: cannot add camera input")
                    session.commitConfiguration()
                    call.reject("Cannot add camera input")
                    return
                }
                session.addInput(input)
                self.currentInput = input
            } catch {
                self.logDiag("FAILED: AVCaptureDeviceInput error: \(error.localizedDescription)")
                session.commitConfiguration()
                call.reject("Failed to open camera: \(error.localizedDescription)")
                return
            }

            let movieOutput = AVCaptureMovieFileOutput()
            if session.canAddOutput(movieOutput) {
                session.addOutput(movieOutput)
                self.movieOutput = movieOutput
            } else {
                self.logDiag("WARNING: cannot add movie output -- recording unavailable")
            }

            session.commitConfiguration()
            self.session = session
            NotificationCenter.default.addObserver(
                self, selector: #selector(self.handleRuntimeError(_:)),
                name: .AVCaptureSessionRuntimeError, object: session
            )

            self.applyHighestFrameRate(to: captureDevice)

            if self.previewLayerView != nil {
                self.logDiag("WARNING: previewLayerView already existed at start() -- removing stale view")
                self.previewLayerView?.removeFromSuperview()
                self.previewLayerView = nil
                self.previewLayer = nil
            }
            let layerView = UIView(frame: rect)
            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            layer.frame = layerView.bounds
            if let connection = layer.connection, connection.isVideoOrientationSupported {
                connection.videoOrientation = .portrait
            }
            layerView.layer.addSublayer(layer)
            container.insertSubview(layerView, belowSubview: webView)
            self.previewLayerView = layerView
            self.previewLayer = layer
            self.logDiag("created preview layer, inserted behind webView")

            webView.isOpaque = false
            webView.backgroundColor = .clear
            webView.scrollView.backgroundColor = .clear

            Self.sessionQueue.async {
                session.startRunning()
                DispatchQueue.main.async {
                    self.logDiag("session.startRunning() returned, resolving")
                    call.resolve()
                }
            }
        }
    }

    @objc private func handleRuntimeError(_ notification: Notification) {
        let message = (notification.userInfo?[AVCaptureSessionErrorKey] as? NSError)?.localizedDescription
            ?? "Unknown capture session error"
        logDiag("AVCaptureSessionRuntimeError: \(message)")
        notifyListeners("sessionError", data: ["message": message])
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let movieOutput = self.movieOutput, movieOutput.isRecording {
                movieOutput.stopRecording()
            }
            self.recordingCall = nil
            if let session = self.session {
                NotificationCenter.default.removeObserver(self, name: .AVCaptureSessionRuntimeError, object: session)
                Self.sessionQueue.async {
                    session.stopRunning()
                }
            }
            self.previewLayerView?.removeFromSuperview()
            self.previewLayerView = nil
            self.previewLayer = nil
            self.session = nil
            self.currentInput = nil
            self.movieOutput = nil
            call.resolve()
        }
    }

    @objc func updateRect(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let rect = self.rectFromCall(call)
            self.previewLayerView?.frame = rect
            self.previewLayer?.frame = self.previewLayerView?.bounds ?? rect
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

    // MARK: - Lens enumeration/selection

    private func availableCameraDevices() -> [AVCaptureDevice] {
        AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInUltraWideCamera, .builtInWideAngleCamera, .builtInTelephotoCamera],
            mediaType: .video,
            position: .back
        ).devices
    }

    // Short, stable ids independent of AVCaptureDevice.DeviceType's raw string -- listLenses
    // and selectLens/start (lensPreference) both key on these, so the JS side never has to
    // know or care about Apple's actual device-type constant strings.
    private func lensId(for type: AVCaptureDevice.DeviceType) -> String {
        switch type {
        case .builtInUltraWideCamera: return "ultraWide"
        case .builtInTelephotoCamera: return "telephoto"
        default: return "wide"
        }
    }

    private func lensLabel(for type: AVCaptureDevice.DeviceType) -> String {
        switch type {
        case .builtInUltraWideCamera: return "Ultra Wide"
        case .builtInTelephotoCamera: return "Telephoto"
        default: return "Wide"
        }
    }

    @objc func listLenses(_ call: CAPPluginCall) {
        let lenses = availableCameraDevices().map { device -> [String: Any] in
            [
                "id": lensId(for: device.deviceType),
                "label": lensLabel(for: device.deviceType),
                "minZoom": Double(device.minAvailableVideoZoomFactor),
                "maxZoom": Double(device.maxAvailableVideoZoomFactor),
            ]
        }
        call.resolve(["lenses": lenses])
    }

    private func pickCaptureDevice(preferring lens: String) -> AVCaptureDevice? {
        let devices = availableCameraDevices()
        if let match = devices.first(where: { lensId(for: $0.deviceType) == lens }) {
            return match
        }
        // Fall back to whatever's actually available rather than failing outright -- e.g. an
        // iPhone with no telephoto lens should still be able to open the camera at all.
        return devices.first ?? AVCaptureDevice.default(for: .video)
    }

    @objc func selectLens(_ call: CAPPluginCall) {
        guard let session = self.session else {
            call.reject("Camera not started")
            return
        }
        guard let lens = call.getString("lens") else {
            call.reject("Missing lens")
            return
        }
        guard let newDevice = pickCaptureDevice(preferring: lens) else {
            call.reject("No matching camera device")
            return
        }
        DispatchQueue.main.async {
            session.beginConfiguration()
            if let oldInput = self.currentInput {
                session.removeInput(oldInput)
            }
            do {
                let newInput = try AVCaptureDeviceInput(device: newDevice)
                guard session.canAddInput(newInput) else {
                    session.commitConfiguration()
                    self.logDiag("FAILED: cannot switch to lens \(lens)")
                    call.reject("Cannot switch to that lens")
                    return
                }
                session.addInput(newInput)
                self.currentInput = newInput
                session.commitConfiguration()
                self.applyHighestFrameRate(to: newDevice)
                self.logDiag("switched lens to \(self.lensId(for: newDevice.deviceType))")
                call.resolve()
            } catch {
                session.commitConfiguration()
                self.logDiag("FAILED: lens switch error: \(error.localizedDescription)")
                call.reject("Failed to switch lens: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Zoom / focus ("their quality functions")

    @objc func setZoom(_ call: CAPPluginCall) {
        guard let device = currentInput?.device else {
            call.reject("Camera not started")
            return
        }
        guard let rawFactor = call.getDouble("factor") else {
            call.reject("Missing factor")
            return
        }
        let factor = CGFloat(rawFactor)
        let clamped = max(device.minAvailableVideoZoomFactor, min(factor, device.maxAvailableVideoZoomFactor))
        do {
            try device.lockForConfiguration()
            // Ramped, not snapped -- an instant jump reads as a jarring jump-cut on the
            // preview; a real camera app's zoom always eases toward the target.
            device.ramp(toVideoZoomFactor: clamped, withRate: 4.0)
            device.unlockForConfiguration()
            call.resolve(["appliedFactor": Double(clamped)])
        } catch {
            call.reject("Failed to set zoom: \(error.localizedDescription)")
        }
    }

    // Tap-to-focus/expose at a normalized (0-1, top-left origin) point -- the standard
    // AVFoundation pattern, one of the "quality functions" ARKit's own ARSession never
    // exposed control over at all.
    @objc func setFocusPoint(_ call: CAPPluginCall) {
        guard let device = currentInput?.device else {
            call.reject("Camera not started")
            return
        }
        guard let x = call.getDouble("x"), let y = call.getDouble("y") else {
            call.reject("Missing x/y")
            return
        }
        let point = CGPoint(x: x, y: y)
        do {
            try device.lockForConfiguration()
            if device.isFocusPointOfInterestSupported {
                device.focusPointOfInterest = point
                if device.isFocusModeSupported(.autoFocus) {
                    device.focusMode = .autoFocus
                }
            }
            if device.isExposurePointOfInterestSupported {
                device.exposurePointOfInterest = point
                if device.isExposureModeSupported(.autoExpose) {
                    device.exposureMode = .autoExpose
                }
            }
            device.unlockForConfiguration()
            logDiag("focus point set to (\(x), \(y))")
            call.resolve()
        } catch {
            call.reject("Failed to set focus point: \(error.localizedDescription)")
        }
    }

    // Explicit, not left to the session preset's default -- the exact lesson
    // ArCameraPreviewPlugin.swift's own comment already documents (a fast movement blurs
    // measurably worse at a conservative default capture rate). Restricted to formats at
    // least matching the 1080p session preset -- an unfiltered max-fps search can land on a
    // tiny low-res slow-motion format (some devices offer very high fps at a fraction of
    // full resolution), which would quietly undo the resolution pose detection actually needs.
    private func applyHighestFrameRate(to device: AVCaptureDevice) {
        let eligibleFormats = device.formats.filter { format in
            let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            return dims.width >= 1920 && dims.height >= 1080
        }
        let candidates = eligibleFormats.isEmpty ? device.formats : eligibleFormats
        guard let bestFormat = candidates.max(by: { lhs, rhs in
            let lhsMaxFps = lhs.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 0
            let rhsMaxFps = rhs.videoSupportedFrameRateRanges.map { $0.maxFrameRate }.max() ?? 0
            return lhsMaxFps < rhsMaxFps
        }) else { return }
        guard let bestRange = bestFormat.videoSupportedFrameRateRanges.max(by: { $0.maxFrameRate < $1.maxFrameRate }) else {
            return
        }
        do {
            try device.lockForConfiguration()
            device.activeFormat = bestFormat
            device.activeVideoMinFrameDuration = bestRange.minFrameDuration
            device.activeVideoMaxFrameDuration = bestRange.minFrameDuration
            device.unlockForConfiguration()
            let dims = CMVideoFormatDescriptionGetDimensions(bestFormat.formatDescription)
            logDiag("activeFormat set: \(dims.width)x\(dims.height) @ up to \(bestRange.maxFrameRate)fps")
        } catch {
            logDiag("WARNING: failed to set highest frame rate: \(error.localizedDescription)")
        }
    }

    // MARK: - Recording (record-first, analyze-later -- see file comment)

    @objc func startRecording(_ call: CAPPluginCall) {
        guard let movieOutput = self.movieOutput else {
            call.reject("Recording not available")
            return
        }
        guard !movieOutput.isRecording else {
            call.reject("Already recording")
            return
        }
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("av-\(UUID().uuidString)")
            .appendingPathExtension("mov")
        DispatchQueue.main.async {
            movieOutput.startRecording(to: outputURL, recordingDelegate: self)
            self.logDiag("startRecording -> \(outputURL.lastPathComponent)")
            call.resolve()
        }
    }

    @objc func stopRecording(_ call: CAPPluginCall) {
        guard let movieOutput = self.movieOutput, movieOutput.isRecording else {
            call.reject("Not recording")
            return
        }
        // Resolved from fileOutput(_:didFinishRecordingTo:...) once the file is actually
        // finalized on disk -- AVCaptureMovieFileOutput writes/closes the container
        // asynchronously, so resolving immediately here could hand JS a path that isn't
        // readable yet.
        self.recordingCall = call
        // Background-execution edge case: a coach can lock the phone the instant after
        // tapping stop, and iOS suspends backgrounded apps within seconds -- wrapping this in
        // an explicit background task requests the OS time to actually finish finalizing the
        // movie container instead of dying mid-write.
        self.backgroundTaskID = UIApplication.shared.beginBackgroundTask(withName: "AvBodyTrackingFinalize") { [weak self] in
            guard let self = self else { return }
            UIApplication.shared.endBackgroundTask(self.backgroundTaskID)
            self.backgroundTaskID = .invalid
        }
        movieOutput.stopRecording()
    }

    public func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        if backgroundTaskID != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTaskID)
            backgroundTaskID = .invalid
        }
        guard let call = recordingCall else { return }
        recordingCall = nil
        if let error = error {
            logDiag("recording finished with error: \(error.localizedDescription)")
            call.reject("Recording failed: \(error.localizedDescription)")
            return
        }
        logDiag("recording finished: \(outputFileURL.lastPathComponent)")
        call.resolve(["path": outputFileURL.path])
    }

    // Local-storage-bloat edge case: 60/120fps at 1080p+ writes large files fast enough that
    // a single team's testing day could fill a 64GB device. Called explicitly by the JS side
    // the moment it's read a clip into memory (mirrors ArCameraPreviewPlugin's
    // stopArRecording -> Filesystem.readFile flow in native-ar-preview.ts) -- deletion isn't
    // left to a background cleanup job that might not run in time.
    @objc func deleteRecording(_ call: CAPPluginCall) {
        guard let pathString = call.getString("path") else {
            call.reject("Missing path")
            return
        }
        try? FileManager.default.removeItem(atPath: pathString)
        logDiag("deleted recording at \(pathString)")
        call.resolve()
    }

    // MARK: - Phase 2: Vision body-pose detection (offline, against the recorded clip)

    // Reads the clip via AVAssetReader (not a live sample-buffer delegate -- see file
    // comment), runs VNDetectHumanBodyPoseRequest per frame, and emits one "poseFrame" event
    // per processed frame as it's produced -- a "simulated-realtime" stream the JS side
    // consumes the exact same way it would a live one, even though this runs entirely after
    // recording already stopped. sampleEveryNthFrame defaults to 1 (every frame) -- Phase 2's
    // own job is finding out, on real hardware, whether that's fast enough during a rest
    // period or needs downsampling; not assumed either way here.
    @objc func analyzeRecording(_ call: CAPPluginCall) {
        guard let pathString = call.getString("path") else {
            call.reject("Missing path")
            return
        }
        let sampleEveryNthFrame = max(1, call.getInt("sampleEveryNthFrame") ?? 1)
        let url = URL(fileURLWithPath: pathString)
        logDiag("analyzeRecording() called for \(url.lastPathComponent), sampleEveryNthFrame=\(sampleEveryNthFrame)")
        analysisCancelled = false
        Self.analysisQueue.async {
            self.runPoseAnalysis(url: url, sampleEveryNthFrame: sampleEveryNthFrame, call: call)
        }
    }

    // A slow take on an older device is exactly the case Phase 1's own record-first design
    // was meant to protect against thermally, but nothing protected the athlete/coach from
    // just having to wait on a stuck-feeling analysis with no way out -- this gives them one.
    // Only flips the flag; runPoseAnalysis's own loop is what actually stops, on its next
    // iteration, wherever it happens to be.
    @objc func cancelAnalysis(_ call: CAPPluginCall) {
        analysisCancelled = true
        logDiag("cancelAnalysis() called")
        call.resolve()
    }

    // Runs on Self.analysisQueue, NOT the main thread -- AVAssetReader's copyNextSampleBuffer
    // and Vision's synchronous perform() are both blocking calls, potentially for seconds
    // across a whole clip, and nothing here touches UI directly (notifyListeners/call.resolve
    // are dispatched to main explicitly where it matters).
    private func runPoseAnalysis(url: URL, sampleEveryNthFrame: Int, call: CAPPluginCall) {
        // Background-execution edge case, same as stopRecording's finalize step -- a coach
        // backgrounding the app to check something mid-analysis shouldn't kill this partway
        // through a clip.
        let taskID = UIApplication.shared.beginBackgroundTask(withName: "AvBodyTrackingAnalyze") { [weak self] in
            guard let self = self else { return }
            UIApplication.shared.endBackgroundTask(self.analysisBackgroundTaskID)
            self.analysisBackgroundTaskID = .invalid
        }
        analysisBackgroundTaskID = taskID
        defer {
            if analysisBackgroundTaskID != .invalid {
                UIApplication.shared.endBackgroundTask(analysisBackgroundTaskID)
                analysisBackgroundTaskID = .invalid
            }
        }

        let asset = AVAsset(url: url)
        guard let track = asset.tracks(withMediaType: .video).first else {
            logDiag("analyzeRecording FAILED: no video track in \(url.lastPathComponent)")
            DispatchQueue.main.async { call.reject("No video track in recording") }
            return
        }
        // AVAssetReader hands back pixel buffers in their raw stored orientation -- it does
        // NOT apply the track's own preferredTransform for you (unlike AVPlayer, which does).
        // Deriving the correct CGImagePropertyOrientation from that transform directly is
        // robust regardless of what orientation the camera connection was actually recording
        // in, rather than assuming Phase 1's setup got it right.
        let orientation = cgOrientation(for: track.preferredTransform)

        guard let reader = try? AVAssetReader(asset: asset) else {
            logDiag("analyzeRecording FAILED: could not create AVAssetReader")
            DispatchQueue.main.async { call.reject("Could not read recording") }
            return
        }
        let outputSettings: [String: Any] = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        guard reader.canAdd(trackOutput) else {
            logDiag("analyzeRecording FAILED: cannot add track output")
            DispatchQueue.main.async { call.reject("Could not set up frame reader") }
            return
        }
        reader.add(trackOutput)
        reader.startReading()

        let poseRequest = VNDetectHumanBodyPoseRequest()
        var frameIndex = 0
        var processedCount = 0
        var trackedCount = 0
        let startTime = Date()

        while reader.status == .reading {
            if analysisCancelled {
                reader.cancelReading()
                logDiag("analyzeRecording cancelled after \(processedCount) frames")
                DispatchQueue.main.async { call.reject("Analysis cancelled") }
                return
            }
            guard let sampleBuffer = trackOutput.copyNextSampleBuffer() else { break }
            let thisFrameIndex = frameIndex
            frameIndex += 1
            guard thisFrameIndex % sampleEveryNthFrame == 0 else { continue }
            guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { continue }
            let timestampSeconds = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer))
            // Vision's normalized joint coordinates are relative to the UPRIGHT (oriented)
            // image, not the raw pixel buffer's own native layout -- CVPixelBufferGetWidth/
            // Height report the raw buffer (landscape sensor order for a 90-degree-rotated
            // recording), so width/height get swapped here to match what Vision actually
            // measured against. The JS bridge (vision-body-landmarks.ts) needs real pixel
            // dimensions, not just normalized 0-1 values, to undo the aspect-ratio distortion
            // pose-tracking.ts's own angle math is sensitive to on non-square (portrait) video
            // -- see that file's comment on why angle computations need proportionally-correct
            // coordinates, not independently-normalized-per-axis ones.
            let rawWidth = CVPixelBufferGetWidth(pixelBuffer)
            let rawHeight = CVPixelBufferGetHeight(pixelBuffer)
            let swapDimensions: Bool
            switch orientation {
            case .left, .right, .leftMirrored, .rightMirrored: swapDimensions = true
            default: swapDimensions = false
            }
            let frameWidth = swapDimensions ? rawHeight : rawWidth
            let frameHeight = swapDimensions ? rawWidth : rawHeight

            var joints: [[String: Any]] = []
            var tracked = false
            let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
            do {
                try handler.perform([poseRequest])
                if let observation = poseRequest.results?.first as? VNHumanBodyPoseObservation {
                    tracked = true
                    trackedCount += 1
                    for (jointName, label) in Self.bodyPoseJoints {
                        guard let point = try? observation.recognizedPoint(jointName), point.confidence > 0.1 else {
                            continue
                        }
                        // Vision's own coordinate convention: normalized 0-1, origin at
                        // BOTTOM-left -- different from the top-left-origin image space most
                        // of the rest of this app assumes. Left as raw Vision coordinates
                        // here; Phase 3's vision-body-landmarks.ts bridge is where that
                        // Y-flip belongs (matching how ar-body-landmarks.ts's own comment
                        // handles ARKit's own coordinate quirks at the bridge layer, not
                        // here at the source).
                        joints.append([
                            "name": label,
                            "x": Double(point.location.x),
                            "y": Double(point.location.y),
                            "confidence": Double(point.confidence),
                        ])
                    }
                }
            } catch {
                logDiag("Vision request failed on frame \(thisFrameIndex): \(error.localizedDescription)")
            }

            processedCount += 1
            DispatchQueue.main.async {
                self.notifyListeners("poseFrame", data: [
                    "frameIndex": thisFrameIndex,
                    "timestamp": timestampSeconds,
                    "tracked": tracked,
                    "joints": joints,
                    "frameWidth": frameWidth,
                    "frameHeight": frameHeight,
                ])
            }
        }

        let elapsed = Date().timeIntervalSince(startTime)
        if let error = reader.error {
            logDiag("analyzeRecording finished with reader error: \(error.localizedDescription)")
        }
        logDiag(
            "analyzeRecording finished: \(processedCount) frames processed, "
                + "\(trackedCount) tracked, \(String(format: "%.2f", elapsed))s elapsed"
        )
        DispatchQueue.main.async {
            call.resolve([
                "frameCount": processedCount,
                "trackedFrameCount": trackedCount,
                "elapsedSeconds": elapsed,
            ])
        }
    }

    private func cgOrientation(for transform: CGAffineTransform) -> CGImagePropertyOrientation {
        switch (transform.a, transform.b, transform.c, transform.d) {
        case (0, 1, -1, 0): return .right
        case (0, -1, 1, 0): return .left
        case (-1, 0, 0, -1): return .down
        default: return .up
        }
    }

    // Defense-in-depth for the same storage-bloat edge case -- a temp file only survives to
    // here if the JS side's own deleteRecording call never ran (app killed before it could, a
    // crash, an upload that failed before cleanup). Swept at the start of every start() call
    // so a string of interrupted sessions can't slowly fill the device's storage.
    private func purgeStaleRecordings() {
        let tmp = FileManager.default.temporaryDirectory
        guard let files = try? FileManager.default.contentsOfDirectory(at: tmp, includingPropertiesForKeys: nil) else {
            return
        }
        for file in files where file.lastPathComponent.hasPrefix("av-") {
            try? FileManager.default.removeItem(at: file)
        }
    }
}

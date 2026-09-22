import Foundation
import Capacitor
import ReplayKit
import Photos

/// RECORDS WHAT THE ATHLETE ACTUALLY DID, because nothing else can.
///
/// The video workbench has no server behind it -- a comparison session is not stored in Forge
/// (Scott, 2026-09-22: "I don't want to save this in forge ... make them download the video to
/// their phones"). That leaves one question with no answer anywhere else in the app: if the
/// session is not saved, what is the artifact?
///
/// The coach's review tool answers it differently and could not answer it here. A coach review
/// is a TIMELINE OF CUES -- a drawing at a video timestamp, optionally with a voice-over clip,
/// replayed later by video-review-player.tsx against the original footage. That model needs a
/// server to hold the cues and Forge itself to re-perform them, and this feature has neither.
///
/// So the screen is the renderer. ReplayKit captures the app's own content while the athlete
/// scrubs, draws, toggles skeletons and talks, and writes one ordinary movie file. The hardest
/// part of the alternative -- reconstructing the timing of somebody moving back and forth
/// through a clip while speaking over it -- comes free, because the recording IS the
/// performance rather than a reconstruction of it.
///
/// What this costs, said plainly because the UI has to say it too: the capture is SCREEN
/// resolution, not source resolution. Two 1080p clips side by side export at roughly half width
/// each. That is a clip to send someone, not a master copy.
@objc(AvSessionRecorderPlugin)
public class AvSessionRecorderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AvSessionRecorderPlugin"
    public let jsName = "AvSessionRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToPhotos", returnType: CAPPluginReturnPromise),
    ]

    private let recorder = RPScreenRecorder.shared()
    /// Where the finished movie landed. Held so discard() can delete a take the athlete
    /// abandoned rather than leaving it in tmp for the OS to reap whenever it feels like it.
    private var lastOutputURL: URL?

    @objc func isSupported(_ call: CAPPluginCall) {
        // isAvailable is false on a device with screen recording restricted by a profile, and in
        // some simulator configurations. Answered rather than assumed, so the UI can offer the
        // workbench without a record button instead of failing at the moment somebody taps it.
        call.resolve([
            "supported": recorder.isAvailable,
            // Separate from availability: a restriction the athlete can lift themselves reads
            // differently from a device that simply cannot do this.
            "reason": recorder.isAvailable ? "" : "Screen recording is unavailable on this device.",
        ])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard recorder.isAvailable else {
            call.reject("Screen recording is unavailable on this device.")
            return
        }
        guard !recorder.isRecording else {
            call.reject("Already recording")
            return
        }
        // THE VOICE-OVER IS THE POINT, so the microphone is on by default. The purpose string
        // already in Info.plist describes exactly this ("when you record a voice-over on a
        // video review"), so nothing new is being asked of the App Store.
        recorder.isMicrophoneEnabled = call.getBool("microphone") ?? true
        // Never the camera: this records the workbench, and a front-camera inset would put the
        // athlete's face into a file the app then hands to a share sheet.
        recorder.isCameraEnabled = false

        // THE DESTINATION BELONGS TO stopRecording, NOT startRecording, and getting that
        // backwards cost four verify_build round trips. RPScreenRecorder records into its own
        // buffer and only writes a file when you stop it -- there is no startRecording(withOutput:)
        // at all, which is why a trailing closure there silently matched the deprecated
        // startRecording(withMicrophoneEnabled:handler:) and complained a URL was not a Bool.
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("forge-review-\(UUID().uuidString)")
            .appendingPathExtension("mp4")
        // A stale file at the destination makes the write fail rather than overwrite.
        try? FileManager.default.removeItem(at: outputURL)
        lastOutputURL = outputURL

        recorder.startRecording { [weak self] (error: Error?) in
            DispatchQueue.main.async {
                if let error = error {
                    self?.lastOutputURL = nil
                    call.reject("Couldn't start recording: \(error.localizedDescription)")
                    return
                }
                call.resolve()
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard recorder.isRecording else {
            call.reject("Not recording")
            return
        }
        guard let outputURL = lastOutputURL else {
            call.reject("Nothing was recording.")
            return
        }
        // stopRecording(withOutput:completionHandler:) is iOS 14+; the deployment target is
        // 15.0, so no availability guard is needed. The handler is (Error?) -> Void -- this is
        // the overload that writes a file, as opposed to stopRecording(handler:), which hands
        // back an RPPreviewViewController for the SYSTEM preview UI and no file at all.
        recorder.stopRecording(withOutput: outputURL) { [weak self] (error: Error?) in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if let error = error {
                    call.reject("Couldn't finish the recording: \(error.localizedDescription)")
                    return
                }
                guard FileManager.default.fileExists(atPath: outputURL.path) else {
                    call.reject("The recording finished but no file was written.")
                    return
                }
                let size = (try? FileManager.default.attributesOfItem(atPath: outputURL.path)[.size]) as? Int64
                self.lastOutputURL = outputURL
                call.resolve(["path": outputURL.path, "sizeBytes": size ?? 0])
            }
        }
    }

    /// Deletes a take the athlete did not keep. Nothing in Forge holds a reference to it, so
    /// without this it sits in tmp until iOS decides otherwise -- on a phone whose owner was
    /// just told their session is not stored anywhere.
    @objc func discard(_ call: CAPPluginCall) {
        if let url = lastOutputURL {
            try? FileManager.default.removeItem(at: url)
            lastOutputURL = nil
        }
        call.resolve()
    }

    /// Saves the finished take into Photos.
    ///
    /// NSPhotoLibraryAddUsageDescription already covers this and says so in the words the
    /// athlete will read ("save form-check videos ... when you choose to download them"). Add-only
    /// authorization is requested rather than full access: this writes one file and never reads
    /// the library.
    @objc func saveToPhotos(_ call: CAPPluginCall) {
        guard let pathString = call.getString("path") else {
            call.reject("Missing path")
            return
        }
        let url = URL(fileURLWithPath: pathString)
        guard FileManager.default.fileExists(atPath: url.path) else {
            call.reject("That recording is no longer on this device.")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                DispatchQueue.main.async {
                    call.reject("Forge needs permission to add videos to your photo library.")
                }
                return
            }
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url)
            }) { success, error in
                DispatchQueue.main.async {
                    if success {
                        call.resolve()
                    } else {
                        call.reject("Couldn't save to Photos: \(error?.localizedDescription ?? "unknown error")")
                    }
                }
            }
        }
    }
}

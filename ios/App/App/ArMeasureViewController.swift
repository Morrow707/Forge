import Foundation
import ARKit
import SceneKit
import Metal
import UIKit

// Native full-screen AR view behind ArMeasurePlugin -- see that file's own
// comment for why this exists and why it needs LiDAR.
//
// Hit-testing a person's head (or any other non-planar surface) needs the
// reconstructed mesh itself, not ARKit's plane/raycast API: ARSession.raycast
// only hits detected planes, so it can't answer "where is this point that's
// floating in the air above the floor." ARSCNView doesn't visualize or
// hit-test ARMeshAnchor geometry on its own, so the renderer(_:didAdd/
// didUpdate:for:) delegate methods below mirror every mesh anchor into a
// real (rendered-invisible, still hit-testable) SCNGeometry purely so
// SCNView.hitTest below has real scene geometry to hit against -- this is
// the standard pattern from Apple's own scene-reconstruction sample code,
// not something specific to this app.
final class ArMeasureViewController: UIViewController, ARSCNViewDelegate {
    private let onDone: (Double?) -> Void
    private let sceneView = ARSCNView()
    private let instructionLabel = UILabel()
    private let resultLabel = UILabel()
    private let doneButton = UIButton(type: .system)
    private let resetButton = UIButton(type: .system)
    private let closeButton = UIButton(type: .system)

    private var pointA: SCNVector3?
    private var pointB: SCNVector3?
    private var markerNodes: [SCNNode] = []
    private var lineNode: SCNNode?
    private var lastMeasurementMeters: Double?

    init(onDone: @escaping (Double?) -> Void) {
        self.onDone = onDone
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        sceneView.frame = view.bounds
        sceneView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        sceneView.delegate = self
        sceneView.automaticallyUpdatesLighting = true
        view.addSubview(sceneView)

        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        sceneView.addGestureRecognizer(tap)

        instructionLabel.text = "Tap the first point"
        styleLabel(instructionLabel, fontSize: 15, weight: .semibold)
        view.addSubview(instructionLabel)

        styleLabel(resultLabel, fontSize: 22, weight: .bold)
        resultLabel.isHidden = true
        view.addSubview(resultLabel)

        styleButton(closeButton, title: "Cancel", action: #selector(cancelTapped))
        view.addSubview(closeButton)

        styleButton(resetButton, title: "Reset", action: #selector(resetTapped))
        resetButton.isHidden = true
        view.addSubview(resetButton)

        doneButton.setTitle("Use This Measurement", for: .normal)
        doneButton.setTitleColor(.white, for: .normal)
        doneButton.backgroundColor = .systemBlue
        doneButton.layer.cornerRadius = 22
        doneButton.contentEdgeInsets = UIEdgeInsets(top: 12, left: 24, bottom: 12, right: 24)
        doneButton.addTarget(self, action: #selector(doneTapped), for: .touchUpInside)
        doneButton.translatesAutoresizingMaskIntoConstraints = false
        doneButton.isHidden = true
        view.addSubview(doneButton)

        NSLayoutConstraint.activate([
            instructionLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            instructionLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            instructionLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 16),
            instructionLabel.trailingAnchor.constraint(lessThanOrEqualTo: closeButton.leadingAnchor, constant: -8),

            resultLabel.topAnchor.constraint(equalTo: instructionLabel.bottomAnchor, constant: 10),
            resultLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            closeButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),

            resetButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
            resetButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),

            doneButton.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),
            doneButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    private func styleLabel(_ label: UILabel, fontSize: CGFloat, weight: UIFont.Weight) {
        label.textColor = .white
        label.textAlignment = .center
        label.font = .systemFont(ofSize: fontSize, weight: weight)
        label.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        label.layer.cornerRadius = 10
        label.clipsToBounds = true
        label.numberOfLines = 0
        label.translatesAutoresizingMaskIntoConstraints = false
    }

    private func styleButton(_ button: UIButton, title: String, action: Selector) {
        button.setTitle(title, for: .normal)
        button.setTitleColor(.white, for: .normal)
        button.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        button.layer.cornerRadius = 18
        button.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        button.addTarget(self, action: action, for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let config = ARWorldTrackingConfiguration()
        config.sceneReconstruction = .mesh
        sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sceneView.session.pause()
    }

    // MARK: - ARSCNViewDelegate

    func renderer(_ renderer: SCNSceneRenderer, didAdd node: SCNNode, for anchor: ARAnchor) {
        guard let meshAnchor = anchor as? ARMeshAnchor else { return }
        applyMeshGeometry(meshAnchor, to: node)
    }

    func renderer(_ renderer: SCNSceneRenderer, didUpdate node: SCNNode, for anchor: ARAnchor) {
        guard let meshAnchor = anchor as? ARMeshAnchor else { return }
        applyMeshGeometry(meshAnchor, to: node)
    }

    private func applyMeshGeometry(_ meshAnchor: ARMeshAnchor, to node: SCNNode) {
        node.geometry = scnGeometry(from: meshAnchor.geometry)
        // Present in the scene graph (so hitTest below can find it) without
        // actually drawing over the camera passthrough -- the reconstructed
        // mesh itself is only a means to hit-test taps against real-world
        // surfaces, never something the coach needs to see rendered.
        node.geometry?.firstMaterial?.colorBufferWriteMask = []
    }

    private func scnGeometry(from mesh: ARMeshGeometry) -> SCNGeometry {
        let vertices = mesh.vertices
        let vertexSource = SCNGeometrySource(
            buffer: vertices.buffer,
            vertexFormat: vertices.format,
            semantic: .vertex,
            vertexCount: vertices.count,
            dataOffset: vertices.offset,
            dataStride: vertices.stride
        )
        let faces = mesh.faces
        let faceData = Data(
            bytesNoCopy: faces.buffer.contents(),
            count: faces.buffer.length,
            deallocator: .none
        )
        let element = SCNGeometryElement(
            data: faceData,
            primitiveType: .triangles,
            primitiveCount: faces.count,
            bytesPerIndex: faces.bytesPerIndex
        )
        return SCNGeometry(sources: [vertexSource], elements: [element])
    }

    // MARK: - Tap handling

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        let point = gesture.location(in: sceneView)
        let hits = sceneView.hitTest(point, options: [SCNHitTestOption.searchMode: SCNHitTestSearchMode.closest.rawValue])
        guard let hit = hits.first else { return }
        let world = hit.worldCoordinates

        if pointA == nil {
            pointA = world
            addMarker(at: world, color: .systemBlue)
            instructionLabel.text = "Tap the second point"
        } else if pointB == nil {
            pointB = world
            addMarker(at: world, color: .systemGreen)
            drawLine()
            reportMeasurement()
        } else {
            clearPoints()
            pointA = world
            addMarker(at: world, color: .systemBlue)
            instructionLabel.text = "Tap the second point"
        }
    }

    private func addMarker(at position: SCNVector3, color: UIColor) {
        let sphere = SCNSphere(radius: 0.012)
        sphere.firstMaterial?.diffuse.contents = color
        sphere.firstMaterial?.lightingModel = .constant
        let node = SCNNode(geometry: sphere)
        node.position = position
        sceneView.scene.rootNode.addChildNode(node)
        markerNodes.append(node)
    }

    private func drawLine() {
        guard let a = pointA, let b = pointB else { return }
        lineNode?.removeFromParentNode()
        let source = SCNGeometrySource(vertices: [a, b])
        let element = SCNGeometryElement(indices: [Int32(0), Int32(1)], primitiveType: .line)
        let geometry = SCNGeometry(sources: [source], elements: [element])
        geometry.firstMaterial?.diffuse.contents = UIColor.systemYellow
        geometry.firstMaterial?.lightingModel = .constant
        let node = SCNNode(geometry: geometry)
        sceneView.scene.rootNode.addChildNode(node)
        lineNode = node
    }

    private func reportMeasurement() {
        guard let a = pointA, let b = pointB else { return }
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z
        let meters = Double(sqrt(dx * dx + dy * dy + dz * dz))
        lastMeasurementMeters = meters
        let totalInches = meters * 39.3701
        let feet = Int(totalInches / 12)
        let inches = totalInches.truncatingRemainder(dividingBy: 12)
        resultLabel.text = String(format: "%d' %.1f\"  (%.2f m)", feet, inches, meters)
        resultLabel.isHidden = false
        instructionLabel.text = "Tap to remeasure, or use this measurement"
        resetButton.isHidden = false
        doneButton.isHidden = false
    }

    private func clearPoints() {
        pointA = nil
        pointB = nil
        markerNodes.forEach { $0.removeFromParentNode() }
        markerNodes.removeAll()
        lineNode?.removeFromParentNode()
        lineNode = nil
        lastMeasurementMeters = nil
        resultLabel.isHidden = true
        resetButton.isHidden = true
        doneButton.isHidden = true
        instructionLabel.text = "Tap the first point"
    }

    @objc private func resetTapped() {
        clearPoints()
    }

    @objc private func cancelTapped() {
        dismiss(animated: true) { [weak self] in self?.onDone(nil) }
    }

    @objc private func doneTapped() {
        let result = lastMeasurementMeters
        dismiss(animated: true) { [weak self] in self?.onDone(result) }
    }
}

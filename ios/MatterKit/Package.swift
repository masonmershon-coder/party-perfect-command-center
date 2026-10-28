// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MatterKit",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "MatterKit", targets: ["MatterKit"]),
    ],
    targets: [
        .target(name: "MatterKit"),
        .testTarget(name: "MatterKitTests", dependencies: ["MatterKit"]),
    ]
)

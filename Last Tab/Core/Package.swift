// swift-tools-version: 6.0
// Pure logic shared by the Last Tab app and its extension handler. Xcode compiles these
// sources straight into both targets; this package exists so `swift test` can run them.
import PackageDescription

let package = Package(
    name: "LastTabCore",
    platforms: [.macOS(.v14)],
    products: [.library(name: "LastTabCore", targets: ["LastTabCore"])],
    targets: [
        .target(name: "LastTabCore"),
        .testTarget(name: "LastTabCoreTests", dependencies: ["LastTabCore"]),
    ]
)

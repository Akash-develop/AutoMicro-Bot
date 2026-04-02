// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AutomationHelper",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "AutomationHelper", targets: ["AutomationHelper"])
    ],
    targets: [
        .executableTarget(
            name: "AutomationHelper",
            path: "Sources/AutomationHelper"
        )
    ]
)

import ApplicationServices
import AppKit
import Foundation
import CoreGraphics

/// Stdio JSON-lines IPC. Requires Accessibility permission (System Settings → Privacy).
/// Build: `swift build -c release` from native/AutomationHelper

let schemaVersion = "1.0"

func reply(id: String, result: Any?, error: String?) {
    var payload: [String: Any] = [
        "schema_version": schemaVersion,
        "id": id,
        "kind": "response" as String,
    ]
    if let error {
        payload["error"] = error
    } else {
        payload["result"] = result ?? NSNull()
    }
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8)
    else { return }
    print(line)
    fflush(stdout)
}

func layerResult(
    success: Bool, confidence: Double, method: String, layer: String, error: String?, evidence: [String: Any] = [:]
) -> [String: Any] {
    [
        "schema_version": schemaVersion,
        "success": success,
        "confidence": confidence,
        "method": method,
        "layer": layer,
        "error": error as Any? ?? NSNull(),
        "evidence": evidence,
    ]
}

func axCheck() -> String? {
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    if !AXIsProcessTrustedWithOptions(opts) {
        return "Accessibility not granted — approve in System Settings → Privacy & Security → Accessibility"
    }
    return nil
}

func boundsForAX(_ el: AXUIElement) -> [String: Double] {
    var pos: CFTypeRef?
    var size: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &pos)
    AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &size)
    var p = CGPoint.zero
    var s = CGSize.zero
    if let pos, CFGetTypeID(pos) == AXValueGetTypeID() {
        AXValueGetValue(pos as! AXValue, .cgPoint, &p)
    }
    if let size, CFGetTypeID(size) == AXValueGetTypeID() {
        AXValueGetValue(size as! AXValue, .cgSize, &s)
    }
    return ["x": Double(p.x), "y": Double(p.y), "w": Double(s.width), "h": Double(s.height)]
}

func axToNode(_ el: AXUIElement, id: String, depth: Int, maxDepth: Int) -> [String: Any] {
    var role: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &role)
    var title: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXTitleAttribute as CFString, &title)
    var value: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXValueAttribute as CFString, &value)
    let roleStr = role as? String ?? "unknown"
    let typeStr: String
    if roleStr.contains("Button") { typeStr = "button" }
    else if roleStr.contains("Link") { typeStr = "link" }
    else if roleStr.contains("TextField") { typeStr = "textField" }
    else { typeStr = "group" }
    let nameStr = (title as? String) ?? ""
    let valStr = value as? String
    let b = boundsForAX(el)
    var children: [[String: Any]] = []
    if depth < maxDepth {
        var kids: CFTypeRef?
        if AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &kids) == .success,
           let arr = kids as? [AXUIElement]
        {
            for (i, c) in arr.enumerated() {
                children.append(axToNode(c, id: "\(id)_\(i)", depth: depth + 1, maxDepth: maxDepth))
            }
        }
    }
    return [
        "schema_version": schemaVersion,
        "id": id,
        "type": typeStr,
        "name": nameStr,
        "value": valStr as Any? ?? NSNull(),
        "bounds": b,
        "children": children,
    ]
}

func frontAppAX() -> AXUIElement? {
    guard let app = NSWorkspace.shared.frontmostApplication else { return nil }
    return AXUIElementCreateApplication(app.processIdentifier)
}

func axTree(maxDepth: Int) -> [String: Any] {
    if let err = axCheck() { return ["error": err] }
    guard let appEl = frontAppAX() else { return ["error": "no front app"] }
    var focused: CFTypeRef?
    AXUIElementCopyAttributeValue(appEl, kAXFocusedWindowAttribute as CFString, &focused)
    let rootEl: AXUIElement = (focused as! AXUIElement?) ?? appEl
    let root = axToNode(rootEl, id: "ax_root", depth: 0, maxDepth: maxDepth)
    return ["root": root]
}

func findByLabel(_ el: AXUIElement, label: String, roleHint: String, depth: Int) -> AXUIElement? {
    if depth > 80 { return nil }
    var title: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXTitleAttribute as CFString, &title)
    var desc: CFTypeRef?
    AXUIElementCopyAttributeValue(el, kAXDescriptionAttribute as CFString, &desc)
    let t = ((title as? String) ?? "").lowercased()
    let d = ((desc as? String) ?? "").lowercased()
    let q = label.lowercased()
    if !q.isEmpty, t.contains(q) || d.contains(q) {
        var role: CFTypeRef?
        AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &role)
        let rs = (role as? String) ?? ""
        if roleHint.isEmpty { return el }
        let hint = roleHint.replacingOccurrences(of: "AX", with: "")
        if rs.contains(hint) || rs == roleHint { return el }
    }
    var kids: CFTypeRef?
    guard AXUIElementCopyAttributeValue(el, kAXChildrenAttribute as CFString, &kids) == .success,
          let arr = kids as? [AXUIElement]
    else { return nil }
    for c in arr {
        if let hit = findByLabel(c, label: label, roleHint: roleHint, depth: depth + 1) { return hit }
    }
    return nil
}

func axPerformAction(_ params: [String: Any]) -> [String: Any] {
    if let err = axCheck() { return layerResult(success: false, confidence: 0, method: "AX", layer: "ax", error: err) }
    guard let appEl = frontAppAX() else {
        return layerResult(success: false, confidence: 0, method: "AX", layer: "ax", error: "no front app")
    }
    var focused: CFTypeRef?
    AXUIElementCopyAttributeValue(appEl, kAXFocusedWindowAttribute as CFString, &focused)
    let rootEl: AXUIElement = (focused as! AXUIElement?) ?? appEl
    let resolved = params["resolved"] as? [String: Any] ?? [:]
    let label = (resolved["label"] as? String) ?? ""
    let roleHint = (resolved["ax_role"] as? String) ?? ""
    guard let target = findByLabel(rootEl, label: label, roleHint: roleHint, depth: 0) else {
        return layerResult(
            success: false, confidence: 0.25, method: "AX", layer: "ax", error: "element not found")
    }
    let press = AXUIElementPerformAction(target, kAXPressAction as CFString)
    if press == .success {
        return layerResult(success: true, confidence: 0.88, method: "AX", layer: "ax", error: nil, evidence: ["label": label])
    }
    return layerResult(success: false, confidence: 0.4, method: "AX", layer: "ax", error: "press failed")
}

func cgClick(x: Int, y: Int) -> [String: Any] {
    let pt = CGPoint(x: x, y: y)
    if let move = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: pt, mouseButton: .left) {
        move.post(tap: .cghidEventTap)
    }
    guard let down = CGEvent(
        mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: pt, mouseButton: .left),
        let up = CGEvent(
            mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: pt, mouseButton: .left)
    else {
        return layerResult(success: false, confidence: 0, method: "CG", layer: "input", error: "event")
    }
    down.post(tap: .cghidEventTap)
    up.post(tap: .cghidEventTap)
    return layerResult(success: true, confidence: 0.75, method: "CG", layer: "input", error: nil, evidence: ["x": x, "y": y])
}

func cgPerform(_ params: [String: Any]) -> [String: Any] {
    let action = (params["action"] as? [String: Any]) ?? [:]
    let target = (action["target"] as? [String: Any]) ?? [:]
    if (target["type"] as? String) == "coords", let v = target["value"] as? String {
        let parts = v.split(separator: ",")
        if parts.count == 2, let x = Int(parts[0]), let y = Int(parts[1]) {
            return cgClick(x: x, y: y)
        }
    }
    return layerResult(success: false, confidence: 0, method: "CG", layer: "input", error: "need coords x,y")
}

while let line = readLine(strippingNewline: true) {
    guard let data = line.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let id = obj["id"] as? String
    else { continue }
    let method = obj["method"] as? String ?? ""
    let params = obj["params"] as? [String: Any] ?? [:]
    switch method {
    case "health":
        reply(id: id, result: ["ok": true, "service": "AutomationHelper"], error: nil)
    case "axTree":
        let depth = (params["maxDepth"] as? Int) ?? 10
        reply(id: id, result: axTree(maxDepth: depth), error: nil)
    case "axPerform":
        reply(id: id, result: axPerformAction(params), error: nil)
    case "cgClick":
        let x = params["x"] as? Int ?? Int((params["x"] as? Double) ?? 0)
        let y = params["y"] as? Int ?? Int((params["y"] as? Double) ?? 0)
        reply(id: id, result: cgClick(x: x, y: y), error: nil)
    case "cgPerform":
        reply(id: id, result: cgPerform(params), error: nil)
    default:
        reply(id: id, result: nil, error: "unknown method \(method)")
    }
}

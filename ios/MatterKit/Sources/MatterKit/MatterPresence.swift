import SwiftUI

/// Visual state of the Wick. The host sets this from real events.
/// The view never decides that Matter is thinking, speaking, or working on its own.
public enum MatterPresenceState: String, CaseIterable, Equatable, Sendable {
    case idle
    case listening
    case thinking
    case speaking
    case working
    case waitingForApproval
    case offline

    public var plainLabel: String {
        switch self {
        case .idle: "Here"
        case .listening: "Listening"
        case .thinking: "Thinking"
        case .speaking: "Speaking"
        case .working: "Working"
        case .waitingForApproval: "Waiting for you"
        case .offline: "Offline"
        }
    }

    public var spokenLabel: String {
        switch self {
        case .idle: "here"
        case .listening: "listening"
        case .thinking: "thinking"
        case .speaking: "speaking"
        case .working: "working"
        case .waitingForApproval: "waiting for you"
        case .offline: "offline"
        }
    }
}

/// Signals the phone already knows. Background refresh is not a signal.
/// `requestInFlight` means a person's message is waiting on intake, not that the screen is reloading.
/// `speechPlaying` means this device is playing a Matter reply, not that text has arrived.
/// `taskState` is a ledger state such as `RUNNING` or `WAITING_APPROVAL`.
public struct MatterPresenceInput: Equatable, Sendable {
    public var connected: Bool
    public var microphoneOpen: Bool
    public var requestInFlight: Bool
    public var speechPlaying: Bool
    public var taskState: String?

    public init(connected: Bool, microphoneOpen: Bool, requestInFlight: Bool, speechPlaying: Bool, taskState: String?) {
        self.connected = connected
        self.microphoneOpen = microphoneOpen
        self.requestInFlight = requestInFlight
        self.speechPlaying = speechPlaying
        self.taskState = taskState
    }
}

/// Stronger confirmed events win. A queued or finished task stays quiet.
public func matterPresence(_ input: MatterPresenceInput) -> MatterPresenceState {
    if !input.connected { return .offline }
    if input.microphoneOpen { return .listening }
    if input.speechPlaying { return .speaking }
    switch input.taskState?.trimmingCharacters(in: .whitespacesAndNewlines) {
    case "RUNNING", "LEASED":
        return .working
    case "WAITING_APPROVAL":
        return .waitingForApproval
    default:
        break
    }
    if input.requestInFlight { return .thinking }
    return .idle
}

struct WickShape: Shape {
    func path(in rect: CGRect) -> Path {
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + rect.width * x, y: rect.minY + rect.height * y)
        }
        var path = Path()
        path.move(to: point(0.52, 0.05))
        path.addCurve(to: point(0.70, 0.62), control1: point(0.78, 0.20), control2: point(0.92, 0.42))
        path.addCurve(to: point(0.50, 0.96), control1: point(0.58, 0.78), control2: point(0.56, 0.92))
        path.addCurve(to: point(0.30, 0.58), control1: point(0.40, 0.90), control2: point(0.18, 0.74))
        path.addCurve(to: point(0.52, 0.05), control1: point(0.40, 0.40), control2: point(0.36, 0.16))
        path.closeSubpath()
        return path
    }
}

/// The Wick: a banked flame and the light it casts. One slow breath. No particles.
public struct MatterPresenceMark: View {
    var state: MatterPresenceState
    var progress: Double?

    @Environment(\.matterPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.scenePhase) private var scenePhase
    @State private var alive = false

    public init(state: MatterPresenceState, progress: Double? = nil) {
        self.state = state
        self.progress = progress
    }

    private var animates: Bool {
        !reduceMotion && scenePhase == .active && state != .offline && state != .waitingForApproval
    }

    private var flame: Color {
        switch state {
        case .offline: palette.ash
        case .waitingForApproval: palette.approval
        default: palette.hearth
        }
    }

    private var flameCore: Color {
        state == .offline ? palette.ash.opacity(0.8) : palette.core
    }

    public var body: some View {
        ZStack {
            Ellipse()
                .fill(flame.opacity(state == .offline ? 0.06 : 0.18))
                .frame(width: state == .speaking ? 132 : 112, height: 16)
                .offset(y: 58)
            Circle()
                .fill(RadialGradient(colors: [flame.opacity(state == .offline ? 0.08 : 0.34), flame.opacity(0)], center: .center, startRadius: 2, endRadius: 58))
                .frame(width: 116, height: 116)
                .offset(y: 6)
            if state == .listening {
                Circle()
                    .stroke(flame.opacity(0.85), lineWidth: contrast == .increased ? 2 : 1)
                    .frame(width: 108, height: 108)
            }
            if state == .working, let progress {
                Circle()
                    .trim(from: 0, to: min(1, max(0, progress)))
                    .stroke(flame, style: StrokeStyle(lineWidth: contrast == .increased ? 2.5 : 1.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 108, height: 108)
            }
            WickShape()
                .fill(LinearGradient(colors: [flameCore, flame], startPoint: .top, endPoint: .bottom))
                .frame(width: 34, height: 76)
                .overlay {
                    if contrast == .increased {
                        WickShape()
                            .stroke(palette.ink, lineWidth: 1)
                            .frame(width: 34, height: 76)
                    }
                }
            Circle()
                .fill(flameCore)
                .frame(width: 7, height: 7)
                .offset(y: -22)
                .opacity(state == .offline ? 0.4 : 0.95)
        }
        .frame(width: 160, height: 132)
        .scaleEffect(animates && alive ? 1.035 : 1)
        .opacity(state == .offline ? 0.72 : 1)
        .onAppear(perform: startBreath)
        .onChange(of: animates) { _, _ in
            alive = false
            startBreath()
        }
        .accessibilityHidden(true)
    }

    private func startBreath() {
        guard animates else { return }
        withAnimation(.easeInOut(duration: 4.2).repeatForever(autoreverses: true)) {
            alive = true
        }
    }
}

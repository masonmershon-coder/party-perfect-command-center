import SwiftUI

/// Warm charcoal and warm paper. The accent is a banked flame, not a neon signal.
public struct MatterPalette {
    public var background: Color
    public var elevated: Color
    public var ink: Color
    public var muted: Color
    public var hearth: Color
    public var core: Color
    public var approval: Color
    public var ash: Color
    public var hairline: Color

    public static let dark = MatterPalette(
        background: Color(red: 0.063, green: 0.055, blue: 0.047),
        elevated: Color(red: 0.110, green: 0.098, blue: 0.086),
        ink: Color(red: 0.953, green: 0.929, blue: 0.894),
        muted: Color(red: 0.718, green: 0.663, blue: 0.604),
        hearth: Color(red: 0.906, green: 0.690, blue: 0.537),
        core: Color(red: 0.984, green: 0.886, blue: 0.780),
        approval: Color(red: 0.839, green: 0.706, blue: 0.514),
        ash: Color(red: 0.541, green: 0.506, blue: 0.471),
        hairline: Color.white.opacity(0.08)
    )

    public static let light = MatterPalette(
        background: Color(red: 0.965, green: 0.945, blue: 0.918),
        elevated: Color(red: 1.0, green: 0.988, blue: 0.973),
        ink: Color(red: 0.118, green: 0.102, blue: 0.090),
        muted: Color(red: 0.435, green: 0.396, blue: 0.361),
        hearth: Color(red: 0.769, green: 0.396, blue: 0.227),
        core: Color(red: 0.855, green: 0.478, blue: 0.290),
        approval: Color(red: 0.541, green: 0.384, blue: 0.196),
        ash: Color(red: 0.431, green: 0.404, blue: 0.373),
        hairline: Color.black.opacity(0.08)
    )

    public static func resolve(_ scheme: ColorScheme) -> MatterPalette {
        scheme == .light ? light : dark
    }
}

public enum MatterColorChoice: String, CaseIterable, Identifiable, Sendable {
    case dark
    case light
    case system

    public static let recommendedDefault = MatterColorChoice.dark

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .dark: "Dark"
        case .light: "Light"
        case .system: "Follow System"
        }
    }

    public var preferred: ColorScheme? {
        switch self {
        case .dark: .dark
        case .light: .light
        case .system: nil
        }
    }
}

private struct MatterPaletteKey: EnvironmentKey {
    static let defaultValue = MatterPalette.dark
}

public extension EnvironmentValues {
    var matterPalette: MatterPalette {
        get { self[MatterPaletteKey.self] }
        set { self[MatterPaletteKey.self] = newValue }
    }
}

struct MatterChrome<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    @ViewBuilder var content: () -> Content

    var body: some View {
        let palette = MatterPalette.resolve(scheme)
        content()
            .environment(\.matterPalette, palette)
            .foregroundStyle(palette.ink)
            .tint(palette.hearth)
            .buttonStyle(.plain)
            .background(palette.background.ignoresSafeArea())
    }
}

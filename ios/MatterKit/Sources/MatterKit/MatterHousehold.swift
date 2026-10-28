import SwiftUI

/// A room the backend has already separated. Home is the family chat. Work is not.
public enum MatterScope: String, CaseIterable, Equatable, Hashable, Sendable {
    case home
    case work

    public var title: String {
        switch self {
        case .home: "Home"
        case .work: "Work"
        }
    }
}

/// A person the backend already knows. This view does not create accounts.
public struct MatterPlace: Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var role: String?
    public var agentTitle: String?
    public var scopes: Set<MatterScope>

    public init(id: String, name: String, role: String? = nil, agentTitle: String? = nil, scopes: Set<MatterScope>) {
        self.id = id
        self.name = name
        self.role = role
        self.agentTitle = agentTitle
        self.scopes = scopes
    }

    public var mark: String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = trimmed.first else { return "·" }
        return String(first).uppercased()
    }
}

/// A kept item the host already fetched. There is no picture, path, or server address here.
public struct MatterKeptItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var scope: MatterScope
    public var isPrivate: Bool

    public init(id: String, title: String, scope: MatterScope, isPrivate: Bool) {
        self.id = id
        self.title = title
        self.scope = scope
        self.isPrivate = isPrivate
    }
}

/// Visual guard only. The backend must already have removed records this person cannot see.
public func visiblePlaces(_ places: [MatterPlace], surface: MatterScope) -> [MatterPlace] {
    places.filter { $0.scopes.contains(surface) }
}

public func visibleKept(_ items: [MatterKeptItem], surface: MatterScope) -> [MatterKeptItem] {
    items.filter { $0.scope == surface }
}

/// Seats at the table. A letter, a name, and an agent title only when the host supplied one.
public struct MatterPlaceStrip: View {
    var places: [MatterPlace]
    var surface: MatterScope
    var activeID: String?
    var onSelect: (String) -> Void

    @Environment(\.matterPalette) private var palette

    public init(places: [MatterPlace], surface: MatterScope, activeID: String? = nil, onSelect: @escaping (String) -> Void = { _ in }) {
        self.places = places
        self.surface = surface
        self.activeID = activeID
        self.onSelect = onSelect
    }

    public var body: some View {
        let shown = visiblePlaces(places, surface: surface)
        if !shown.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(shown) { place in
                        Button {
                            onSelect(place.id)
                        } label: {
                            placeChip(place, active: place.id == activeID)
                        }
                        .buttonStyle(.plain)
                        .frame(minHeight: 44)
                    }
                }
                .padding(.horizontal, 20)
            }
            .accessibilityLabel(surface == .home ? "Family" : "Work")
        }
    }

    private func placeChip(_ place: MatterPlace, active: Bool) -> some View {
        HStack(spacing: 8) {
            Text(place.mark)
                .font(.system(.subheadline, design: .serif))
                .frame(width: 32, height: 32)
                .background(Circle().fill(palette.elevated))
                .overlay(Circle().stroke(active ? palette.hearth : palette.hairline, lineWidth: active ? 1.5 : 1))
            VStack(alignment: .leading, spacing: 1) {
                Text(place.name)
                    .font(.subheadline)
                    .foregroundStyle(palette.ink)
                if let agent = place.agentTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !agent.isEmpty {
                    Text(agent)
                        .font(.caption)
                        .foregroundStyle(palette.muted)
                }
            }
        }
        .padding(.trailing, 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(spoken(place))
        .accessibilityAddTraits(active ? .isSelected : [])
    }

    private func spoken(_ place: MatterPlace) -> String {
        var parts = [place.name]
        if let role = place.role?.trimmingCharacters(in: .whitespacesAndNewlines), !role.isEmpty {
            parts.append(role)
        }
        if let agent = place.agentTitle?.trimmingCharacters(in: .whitespacesAndNewlines), !agent.isEmpty {
            parts.append(agent)
        }
        return parts.joined(separator: ", ")
    }
}

/// Titles the host already has. Private means no picture. Nothing is loaded from a disk or the network.
public struct MatterKeptShelf: View {
    var items: [MatterKeptItem]
    var surface: MatterScope

    @Environment(\.matterPalette) private var palette

    public init(items: [MatterKeptItem], surface: MatterScope) {
        self.items = items
        self.surface = surface
    }

    public var body: some View {
        let shown = visibleKept(items, surface: surface)
        VStack(alignment: .leading, spacing: 8) {
            Text(surface == .home ? "Kept at home" : "Kept for work")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(palette.muted)
                .textCase(.uppercase)
                .tracking(0.6)
            if shown.isEmpty {
                Text("Nothing is loaded from the family's storage.")
                    .font(.body)
                    .foregroundStyle(palette.muted)
            } else {
                ForEach(shown) { item in
                    HStack {
                        Text(item.title)
                            .font(.body)
                        Spacer(minLength: 12)
                        if item.isPrivate {
                            Text("Private")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(palette.muted)
                        }
                    }
                    .padding(.vertical, 6)
                    .accessibilityElement(children: .combine)
                }
            }
        }
    }
}

/// Work records, already separated by the host. This room does not grant permission.
public struct MatterWorkRoom: View {
    var places: [MatterPlace]
    var kept: [MatterKeptItem]
    var onClose: () -> Void

    public init(places: [MatterPlace], kept: [MatterKeptItem], onClose: @escaping () -> Void) {
        self.places = places
        self.kept = kept
        self.onClose = onClose
    }

    public var body: some View {
        NavigationStack {
            MatterChrome {
                WorkBody(places: places, kept: kept)
            }
            .navigationTitle("Work")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close", action: onClose)
                }
            }
        }
    }
}

private struct WorkBody: View {
    var places: [MatterPlace]
    var kept: [MatterKeptItem]

    @Environment(\.matterPalette) private var palette

    var body: some View {
        let people = visiblePlaces(places, surface: .work)
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Work stays out of the family chat. This list is only what the Mac already separated.")
                    .font(.footnote)
                    .foregroundStyle(palette.muted)
                if people.isEmpty {
                    Text("No work profiles are loaded.")
                        .font(.body)
                        .foregroundStyle(palette.muted)
                } else {
                    MatterPlaceStrip(places: places, surface: .work)
                }
                MatterKeptShelf(items: kept, surface: .work)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 20)
        }
    }
}

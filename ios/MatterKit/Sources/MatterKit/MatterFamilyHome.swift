import SwiftUI

public enum MatterSpeaker: String, Equatable, Sendable {
    case household
    case matter
}

public struct MatterTurn: Identifiable, Equatable, Sendable {
    public var id: String
    public var speaker: MatterSpeaker
    public var text: String

    public init(id: String, speaker: MatterSpeaker, text: String) {
        self.id = id
        self.speaker = speaker
        self.text = text
    }
}

/// A household routine the backend has already recorded. `result` stays nil until Matter reports one.
public struct MatterRoutine: Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var result: String?

    public init(id: String, title: String, result: String? = nil) {
        self.id = id
        self.title = title
        self.result = result
    }
}

/// Conversation-first home. It displays the presence, the turns, and the controls it is given.
public struct MatterFamilyHome: View {
    var presence: MatterPresenceState
    var progress: Double?
    var statusLine: String?
    var turns: [MatterTurn]
    var routines: [MatterRoutine]
    var places: [MatterPlace]
    var activePlaceID: String?
    var draft: Binding<String>
    var canSend: Bool
    var onSend: () -> Void
    var onListen: () -> Void
    var onOpenOwner: () -> Void
    var onSelectPlace: (String) -> Void

    public init(
        presence: MatterPresenceState,
        progress: Double? = nil,
        statusLine: String? = nil,
        turns: [MatterTurn],
        routines: [MatterRoutine],
        places: [MatterPlace] = [],
        activePlaceID: String? = nil,
        draft: Binding<String>,
        canSend: Bool,
        onSend: @escaping () -> Void,
        onListen: @escaping () -> Void,
        onOpenOwner: @escaping () -> Void,
        onSelectPlace: @escaping (String) -> Void = { _ in }
    ) {
        self.presence = presence
        self.progress = progress
        self.statusLine = statusLine
        self.turns = turns
        self.routines = routines
        self.places = places
        self.activePlaceID = activePlaceID
        self.draft = draft
        self.canSend = canSend
        self.onSend = onSend
        self.onListen = onListen
        self.onOpenOwner = onOpenOwner
        self.onSelectPlace = onSelectPlace
    }

    public var body: some View {
        MatterChrome {
            FamilyBody(
                presence: presence,
                progress: progress,
                statusLine: statusLine,
                turns: turns,
                routines: routines,
                places: places,
                activePlaceID: activePlaceID,
                draft: draft,
                canSend: canSend,
                onSend: onSend,
                onListen: onListen,
                onOpenOwner: onOpenOwner,
                onSelectPlace: onSelectPlace
            )
        }
    }
}

private struct FamilyBody: View {
    var presence: MatterPresenceState
    var progress: Double?
    var statusLine: String?
    var turns: [MatterTurn]
    var routines: [MatterRoutine]
    var places: [MatterPlace]
    var activePlaceID: String?
    var draft: Binding<String>
    var canSend: Bool
    var onSend: () -> Void
    var onListen: () -> Void
    var onOpenOwner: () -> Void
    var onSelectPlace: (String) -> Void

    @Environment(\.matterPalette) private var palette
    @FocusState private var composing: Bool

    var body: some View {
        VStack(spacing: 0) {
            header
            MatterPresenceMark(state: presence, progress: progress)
                .scaleEffect(composing ? 0.72 : 1, anchor: .top)
                .frame(height: composing ? 88 : 132)
            Text(presence.plainLabel)
                .font(.system(.subheadline, design: .serif))
                .accessibilityLabel("Matter is \(presence.spokenLabel)")
            if let statusLine, !statusLine.isEmpty {
                Text(statusLine)
                    .font(.footnote)
                    .foregroundStyle(palette.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 28)
                    .padding(.top, 4)
            }
            MatterPlaceStrip(places: places, surface: .home, activeID: activePlaceID, onSelect: onSelectPlace)
                .padding(.top, visiblePlaces(places, surface: .home).isEmpty ? 0 : 12)
            conversation
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(alignment: .leading, spacing: 12) {
                if !routines.isEmpty {
                    routinesRow
                }
                composer
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 6)
            .background(palette.background)
        }
        .animation(.easeInOut(duration: 0.35), value: composing)
        .animation(.easeInOut(duration: 0.45), value: presence)
    }

    private var header: some View {
        HStack {
            Text("Matter")
                .font(.system(.title3, design: .serif))
            Spacer()
            Button("Owner", action: onOpenOwner)
                .font(.subheadline)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityHint("Opens owner tools after this device and the Mac both allow it.")
        }
        .padding(.horizontal, 20)
        .padding(.top, 4)
    }

    private var conversation: some View {
        ScrollView {
            if turns.isEmpty {
                Text("When you are ready, tell Matter what the house needs.")
                    .font(.body)
                    .foregroundStyle(palette.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)
                    .padding(.top, 28)
                    .frame(maxWidth: .infinity)
            } else {
                LazyVStack(alignment: .leading, spacing: 18) {
                    ForEach(turns) { turn in
                        turnView(turn)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 18)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func turnView(_ turn: MatterTurn) -> some View {
        let mine = turn.speaker == .household
        return VStack(alignment: mine ? .trailing : .leading, spacing: 4) {
            Text(mine ? "You" : "Matter")
                .font(.caption)
                .foregroundStyle(palette.muted)
            Text(turn.text)
                .font(.body)
                .foregroundStyle(palette.ink)
                .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
                .padding(.vertical, mine ? 10 : 0)
                .padding(.horizontal, mine ? 14 : 0)
                .background {
                    if mine {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .fill(palette.elevated)
                    }
                }
                .overlay(alignment: .leading) {
                    if !mine {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(palette.hearth)
                            .frame(width: 2)
                            .padding(.vertical, 2)
                            .offset(x: -10)
                    }
                }
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
        .padding(.leading, mine ? 48 : 12)
        .padding(.trailing, mine ? 0 : 36)
        .accessibilityElement(children: .combine)
    }

    private var routinesRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("House")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(palette.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(routines) { routine in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(routine.title)
                                .font(.subheadline)
                            if let result = routine.result, !result.isEmpty {
                                Text(result)
                                    .font(.caption)
                                    .foregroundStyle(palette.muted)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(palette.elevated, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            Button(action: onListen) {
                Image(systemName: presence == .listening ? "mic.fill" : "mic")
                    .font(.body)
                    .frame(width: 44, height: 44)
            }
            .disabled(presence == .offline)
            .accessibilityLabel(presence == .listening ? "Stop listening" : "Listen")

            TextField("Message Matter", text: draft, axis: .vertical)
                .lineLimit(1...5)
                .focused($composing)
                .font(.body)
                .padding(.vertical, 10)

            Button(action: onSend) {
                Image(systemName: "arrow.up")
                    .font(.body.weight(.semibold))
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(canSend && !trimmedDraft.isEmpty ? palette.hearth : palette.hairline))
                    .foregroundStyle(canSend && !trimmedDraft.isEmpty ? palette.background : palette.muted)
                    .frame(width: 44, height: 44)
            }
            .disabled(!canSend || trimmedDraft.isEmpty)
            .accessibilityLabel("Send")
        }
        .padding(.leading, 6)
        .padding(.trailing, 4)
        .background(palette.elevated, in: Capsule())
        .overlay(Capsule().stroke(palette.hairline, lineWidth: 1))
    }

    private var trimmedDraft: String {
        draft.wrappedValue.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

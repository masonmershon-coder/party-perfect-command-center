import SwiftUI

private struct FamilyPreviewHost: View {
    var scheme: ColorScheme
    var presence: MatterPresenceState
    var turns: [MatterTurn]
    var routines: [MatterRoutine]
    var places: [MatterPlace] = []
    @State private var draft = ""

    var body: some View {
        MatterFamilyHome(
            presence: presence,
            progress: presence == .working ? 0.45 : nil,
            statusLine: "Layout fixture. Not a live session.",
            turns: turns,
            routines: routines,
            places: places,
            activePlaceID: places.first?.id,
            draft: $draft,
            canSend: presence != .offline,
            onSend: {},
            onListen: {},
            onOpenOwner: {}
        )
        .preferredColorScheme(scheme)
    }
}

private let fixturePlaces = [
    MatterPlace(id: "home-adult", name: "Adult", role: "Adult", agentTitle: "Fixture guide", scopes: [.home]),
    MatterPlace(id: "home-child", name: "Child", role: "Child", scopes: [.home]),
    MatterPlace(id: "work-only", name: "Work", role: "Work", scopes: [.work]),
]

#Preview("Family dark") {
    FamilyPreviewHost(scheme: .dark, presence: .idle, turns: [], routines: [], places: fixturePlaces)
}

#Preview("Family light") {
    FamilyPreviewHost(
        scheme: .light,
        presence: .idle,
        turns: [
            MatterTurn(id: "1", speaker: .household, text: "Leave a note that the porch light is still on."),
        ],
        routines: [
            MatterRoutine(id: "r1", title: "Porch light", result: "Recorded"),
        ]
    )
}

#Preview("Waiting") {
    FamilyPreviewHost(scheme: .dark, presence: .waitingForApproval, turns: [], routines: [])
}

#Preview("Offline") {
    FamilyPreviewHost(scheme: .dark, presence: .offline, turns: [], routines: [])
}

#Preview("Kept shelf") {
    MatterChrome {
        MatterKeptShelf(items: [
            MatterKeptItem(id: "p1", title: "Fixture note", scope: .home, isPrivate: true),
            MatterKeptItem(id: "w1", title: "Fixture ledger", scope: .work, isPrivate: true),
        ], surface: .home)
        .padding(20)
    }
    .preferredColorScheme(.dark)
}

#Preview("Work room") {
    MatterWorkRoom(places: fixturePlaces, kept: [
        MatterKeptItem(id: "w1", title: "Fixture ledger", scope: .work, isPrivate: true),
    ], onClose: {})
    .preferredColorScheme(.dark)
}

#Preview("Owner dark") {
    OwnerPreviewHost(scheme: .dark)
}

#Preview("Owner light") {
    OwnerPreviewHost(scheme: .light)
}

private struct OwnerPreviewHost: View {
    var scheme: ColorScheme
    @State private var appearance = MatterColorChoice.dark

    var body: some View {
        MatterOwnerHome(
            snapshot: MatterOwnerSnapshot(
                mission: "Fixture. Supervisor is not live in this preview.",
                localIntelligence: "Not observed",
                approvals: [MatterApprovalItem(id: "a1", title: "Fixture approval")],
                tasks: [MatterOwnerTask(id: "t1", title: "Fixture task", status: "WAITING_APPROVAL")],
                agents: [MatterOwnerAgent(id: "g1", name: "codex-local", availability: "Not observed")],
                activity: ["Fixture activity line"]
            ),
            appearance: $appearance,
            onDecide: { _, _ in },
            onClose: {}
        )
        .preferredColorScheme(scheme)
    }
}

struct MatterPresenceGallery: View {
    var body: some View {
        MatterChrome {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Presence fixtures")
                        .font(.system(.title3, design: .serif))
                    Text("These states are samples for layout. They are not a live supervisor.")
                        .font(.footnote)
                        .foregroundStyle(MatterPalette.dark.muted)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 18) {
                        ForEach(MatterPresenceState.allCases, id: \.self) { state in
                            VStack(spacing: 0) {
                                MatterPresenceMark(state: state, progress: state == .working ? 0.4 : nil)
                                Text(state.plainLabel)
                                    .font(.system(.subheadline, design: .serif))
                            }
                        }
                    }
                }
                .padding(20)
            }
        }
    }
}

#Preview("Presence states") {
    MatterPresenceGallery()
        .preferredColorScheme(.dark)
}

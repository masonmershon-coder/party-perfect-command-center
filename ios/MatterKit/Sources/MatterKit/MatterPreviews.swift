import SwiftUI

private struct FamilyPreviewHost: View {
    var scheme: ColorScheme
    var presence: MatterPresenceState
    var turns: [MatterTurn]
    var routines: [MatterRoutine]
    @State private var draft = ""

    var body: some View {
        MatterFamilyHome(
            presence: presence,
            progress: presence == .working ? 0.45 : nil,
            statusLine: "Layout fixture. Not a live session.",
            turns: turns,
            routines: routines,
            draft: $draft,
            canSend: presence != .offline,
            onSend: {},
            onListen: {},
            onOpenOwner: {}
        )
        .preferredColorScheme(scheme)
    }
}

#Preview("Family dark") {
    FamilyPreviewHost(scheme: .dark, presence: .idle, turns: [], routines: [])
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

import SwiftUI

public struct MatterOwnerTask: Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String
    public var status: String

    public init(id: String, title: String, status: String) {
        self.id = id
        self.title = title
        self.status = status
    }
}

public struct MatterOwnerAgent: Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var availability: String

    public init(id: String, name: String, availability: String) {
        self.id = id
        self.name = name
        self.availability = availability
    }
}

public struct MatterApprovalItem: Identifiable, Equatable, Sendable {
    public var id: String
    public var title: String

    public init(id: String, title: String) {
        self.id = id
        self.title = title
    }
}

/// Owner details already observed by the host. Nil means they are not loaded.
public struct MatterOwnerSnapshot: Equatable, Sendable {
    public var mission: String
    public var localIntelligence: String
    public var approvals: [MatterApprovalItem]
    public var tasks: [MatterOwnerTask]
    public var agents: [MatterOwnerAgent]
    public var activity: [String]

    public init(
        mission: String,
        localIntelligence: String,
        approvals: [MatterApprovalItem],
        tasks: [MatterOwnerTask],
        agents: [MatterOwnerAgent],
        activity: [String]
    ) {
        self.mission = mission
        self.localIntelligence = localIntelligence
        self.approvals = approvals
        self.tasks = tasks
        self.agents = agents
        self.activity = activity
    }
}

public struct MatterOwnerHome: View {
    var snapshot: MatterOwnerSnapshot?
    var appearance: Binding<MatterColorChoice>
    var onDecide: (String, String) -> Void
    var onClose: () -> Void

    public init(
        snapshot: MatterOwnerSnapshot?,
        appearance: Binding<MatterColorChoice>,
        onDecide: @escaping (String, String) -> Void,
        onClose: @escaping () -> Void
    ) {
        self.snapshot = snapshot
        self.appearance = appearance
        self.onDecide = onDecide
        self.onClose = onClose
    }

    public var body: some View {
        NavigationStack {
            MatterChrome {
                OwnerBody(snapshot: snapshot, appearance: appearance, onDecide: onDecide)
            }
            .navigationTitle("Owner")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close", action: onClose)
                }
            }
        }
    }
}

private struct OwnerBody: View {
    var snapshot: MatterOwnerSnapshot?
    var appearance: Binding<MatterColorChoice>
    var onDecide: (String, String) -> Void

    @Environment(\.matterPalette) private var palette

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                Text("Protected actions stay on the Mac. This screen does not grant permission.")
                    .font(.footnote)
                    .foregroundStyle(palette.muted)
                appearancePicker
                if let snapshot {
                    loaded(snapshot)
                } else {
                    Text("Owner details are not loaded.")
                        .font(.body)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .toolbarBackground(palette.background, for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
    }

    private var appearancePicker: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("Appearance")
            Picker("Appearance", selection: appearance) {
                ForEach(MatterColorChoice.allCases) { choice in
                    Text(choice.title).tag(choice)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("Appearance")
        }
    }

    private func loaded(_ snapshot: MatterOwnerSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 28) {
            section("Mission") {
                Text(snapshot.mission).font(.body)
            }
            section("Local intelligence") {
                Text(snapshot.localIntelligence).font(.body)
            }
            section("Approvals") {
                if snapshot.approvals.isEmpty {
                    Text("No approvals waiting.").font(.body).foregroundStyle(palette.muted)
                } else {
                    Text("Face ID confirms this device. The Mac still has to authorize the decision.")
                        .font(.footnote)
                        .foregroundStyle(palette.muted)
                    ForEach(snapshot.approvals) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(item.title).font(.body)
                            HStack(spacing: 16) {
                                Button("Approve") { onDecide(item.id, "approve") }
                                    .frame(minHeight: 44)
                                Button("Reject", role: .destructive) { onDecide(item.id, "reject") }
                                    .frame(minHeight: 44)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            section("Tasks") {
                if snapshot.tasks.isEmpty {
                    Text("No tasks in this snapshot.").font(.body).foregroundStyle(palette.muted)
                } else {
                    ForEach(snapshot.tasks) { task in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(task.title).font(.body)
                            Text(task.status).font(.caption).foregroundStyle(palette.muted)
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            section("Agents") {
                if snapshot.agents.isEmpty {
                    Text("No workers in this snapshot.").font(.body).foregroundStyle(palette.muted)
                } else {
                    ForEach(snapshot.agents) { agent in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(agent.name).font(.body)
                            Text(agent.availability).font(.caption).foregroundStyle(palette.muted)
                        }
                        .padding(.vertical, 4)
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            section("Activity") {
                if snapshot.activity.isEmpty {
                    Text("No activity in this snapshot.").font(.body).foregroundStyle(palette.muted)
                } else {
                    ForEach(Array(snapshot.activity.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.caption)
                            .foregroundStyle(palette.muted)
                    }
                }
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(palette.muted)
            .textCase(.uppercase)
            .tracking(0.6)
    }

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle(title)
            content()
        }
    }
}

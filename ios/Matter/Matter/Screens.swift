import SwiftUI

struct StatusBanner: View {
    @Environment(MatterModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(connectionTitle)
                .font(.footnote.weight(.semibold))
            if let banner = model.banner {
                Text(banner)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            if model.usingCache, let saved = model.cacheSavedAt {
                Text("Last snapshot \(saved)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.04))
    }

    private var connectionTitle: String {
        switch model.connection {
        case .unknown: return "Not checked"
        case .checking: return "Checking the Mac mini"
        case .online: return model.health?.supervisorHealthy == true ? "Supervisor health is live" : "Phone API connected"
        case .offline: return "Offline"
        case .unauthorized: return "Not authorized"
        case .sessionExpired: return "Session expired"
        }
    }
}

struct ChatView: View {
    @Environment(MatterModel.self) private var model
    @State private var draft = ""
    @State private var pendingClientId: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StatusBanner()
                ScrollView {
                    if messages.isEmpty {
                        ContentUnavailableView("No conversation yet", systemImage: "bubble.left", description: Text("A message is recorded on the Mac mini. Matter does not invent a reply."))
                            .padding(.top, 40)
                    } else {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(messages) { message in
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(message.role == "owner" ? "You" : "Matter")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    Text(message.text)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .padding(12)
                                .background(Color.white.opacity(message.role == "owner" ? 0.08 : 0.03))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                        .padding()
                    }
                }
                HStack {
                    TextField("Ask Matter to record a task", text: $draft, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                    Button("Send") { Task { await send() } }
                        .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.loading)
                }
                .padding()
            }
            .navigationTitle("Chat")
            .toolbar { RefreshButton() }
        }
    }

    private var messages: [MessageRecord] {
        model.conversations.sorted { $0.updatedAt > $1.updatedAt }.flatMap(\.messages)
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let clientId = pendingClientId ?? UUID().uuidString
        pendingClientId = clientId
        if await model.send(text, clientMessageId: clientId) != nil {
            draft = ""
            pendingClientId = nil
        }
    }
}

struct TasksView: View {
    @Environment(MatterModel.self) private var model

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StatusBanner()
                if model.tasks.isEmpty {
                    ContentUnavailableView("No tasks", systemImage: "checklist", description: Text("Tasks appear after the Mac mini records them."))
                } else {
                    List(model.tasks) { task in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(task.title).font(.body.weight(.semibold))
                            Text(task.status)
                                .font(.caption.weight(.bold))
                            Text(task.routingBasis)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(task.executed ? "Executed" : "Not executed")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Tasks")
            .toolbar { RefreshButton() }
        }
    }
}

struct ApprovalsView: View {
    @Environment(MatterModel.self) private var model

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StatusBanner()
                if model.approvals.isEmpty {
                    ContentUnavailableView("No pending approvals", systemImage: "checkmark.seal", description: Text("Approval-required tasks stay here until you authorize or reject them."))
                } else {
                    List(model.approvals) { approval in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(taskTitle(approval)).font(.body.weight(.semibold))
                            Text(approval.status).font(.caption.weight(.bold))
                            if !approval.protectedActions.isEmpty {
                                Text(approval.protectedActions.joined(separator: ", "))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            HStack {
                                Button("Approve") { Task { await decide(approval, "approve") } }
                                Button("Reject", role: .destructive) { Task { await decide(approval, "reject") } }
                            }
                            .disabled(model.loading)
                        }
                        .padding(.vertical, 4)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Approvals")
            .toolbar { RefreshButton() }
        }
    }

    private func taskTitle(_ approval: ApprovalRecord) -> String {
        model.tasks.first { $0.taskId == approval.taskId }?.title ?? approval.taskId
    }

    private func decide(_ approval: ApprovalRecord, _ decision: String) async {
        guard await model.authenticateOwner() else { return }
        await model.decide(approval, decision: decision)
    }
}

struct MissionControlView: View {
    @Environment(MatterModel.self) private var model

    private var live: Bool { model.connection == .online && !model.usingCache }

    var body: some View {
        NavigationStack {
            List {
                Section("Connection") {
                    LabeledContent("Phone API") { Text(live ? "Live" : "Not live") }
                    LabeledContent("Snapshot") { Text(model.usingCache ? "Showing saved data" : "Current response") }
                    if model.loading { ProgressView() }
                }
                Section("Supervisor") {
                    LabeledContent("Healthy") { Text(live && model.mission?.supervisorHealthy == true ? "Yes" : "No") }
                    LabeledContent("Process") { Text(live && model.mission?.supervisor.running == true ? "Running" : "Not running") }
                    if live, let pid = model.mission?.supervisor.pid {
                        LabeledContent("PID") { Text(String(pid)) }
                    }
                    if live, let pass = model.mission?.supervisor.lastPassAt {
                        Text(pass).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("Local intelligence") {
                    let intel = model.mission?.localIntelligence
                    LabeledContent("Observed") { Text(intel?.observed == true ? "Yes" : "No") }
                    LabeledContent("Available") { Text(availability(intel?.available)) }
                    Text(intel?.reason ?? "No mission snapshot yet.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section("Task queue") {
                    if let queue = model.mission?.queue {
                        LabeledContent("Total") { Text(String(queue.total)) }
                        ForEach(queue.byState.keys.sorted(), id: \.self) { key in
                            LabeledContent(key) { Text(String(queue.byState[key] ?? 0)) }
                        }
                    } else {
                        Text("No queue snapshot.")
                    }
                    LabeledContent("Approvals pending") { Text(String(model.mission?.approvalsPending ?? model.approvals.count)) }
                }
                Section("Workers") {
                    if model.agents.isEmpty {
                        Text("No workers in the registry snapshot.")
                    } else {
                        ForEach(model.agents) { agent in
                            LabeledContent(agent.workerId) { Text(availability(agent.available)) }
                        }
                    }
                }
            }
            .navigationTitle("Mission")
            .toolbar { RefreshButton() }
        }
    }

    private func availability(_ value: Bool?) -> String {
        switch value {
        case true: return "Available"
        case false: return "Unavailable"
        case nil: return "Not observed"
        }
    }
}

struct AgentsView: View {
    @Environment(MatterModel.self) private var model

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StatusBanner()
                if model.agents.isEmpty {
                    ContentUnavailableView("No agents observed", systemImage: "person.2", description: Text(model.agentSource == "none" ? "The registry snapshot has no workers." : "No workers were returned."))
                } else {
                    List(model.agents) { agent in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(agent.workerId).font(.body.weight(.semibold))
                            Text(availability(agent.available))
                                .font(.caption.weight(.bold))
                            Text(agent.availabilitySource)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            if let provider = agent.provider {
                                Text(provider).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Agents")
            .toolbar { RefreshButton() }
        }
    }

    private func availability(_ value: Bool?) -> String {
        switch value {
        case true: return "Available"
        case false: return "Unavailable"
        case nil: return "Not observed"
        }
    }
}

struct SettingsView: View {
    @Environment(MatterModel.self) private var model
    @State private var tokenDraft = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Connection") {
                    TextField("Mac mini base URL", text: Bindable(model).baseURLString)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Phone token", text: $tokenDraft)
                    Button("Save token to Keychain") {
                        model.saveBaseURL()
                        model.saveToken(tokenDraft)
                        tokenDraft = ""
                    }
                    .disabled(tokenDraft.trimmingCharacters(in: .whitespacesAndNewlines).count < 16)
                    Button("Remove token", role: .destructive) { model.clearToken() }
                        .disabled(!model.tokenStored)
                    LabeledContent("Keychain") { Text(model.tokenStored ? "Token stored" : "No token") }
                }
                Section("Supervisor") {
                    LabeledContent("API") { Text(model.health?.service ?? "Not loaded") }
                    LabeledContent("Supervisor healthy") { Text(model.health?.supervisorHealthy == true ? "Yes" : "No") }
                    LabeledContent("Process") {
                        Text(model.health?.supervisor?.running == true ? "Running" : "Not running")
                    }
                    if let pid = model.health?.supervisor?.pid {
                        LabeledContent("PID") { Text(String(pid)) }
                    }
                    if let pass = model.health?.supervisor?.lastPassAt {
                        LabeledContent("Last pass") { Text(pass).lineLimit(2) }
                    }
                }
                Section("Activity") {
                    if model.activity.isEmpty {
                        Text("No activity in the current snapshot.")
                    } else {
                        ForEach(model.activity.prefix(20)) { event in
                            VStack(alignment: .leading) {
                                Text(event.kind).font(.caption.weight(.semibold))
                                Text(event.at).font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Settings")
            .toolbar { RefreshButton() }
        }
    }
}

private struct RefreshButton: View {
    @Environment(MatterModel.self) private var model

    var body: some View {
        Button {
            Task { await model.refresh() }
        } label: {
            if model.loading { ProgressView() } else { Image(systemName: "arrow.clockwise") }
        }
        .disabled(model.loading)
    }
}

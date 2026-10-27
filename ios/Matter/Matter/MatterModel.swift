import Foundation
import LocalAuthentication
import Observation

enum ConnectionState: Equatable {
    case unknown
    case checking
    case online
    case offline(String)
    case unauthorized
    case sessionExpired
}

@MainActor
@Observable
final class MatterModel {
    var baseURLString: String
    var connection: ConnectionState = .unknown
    var health: HealthResponse?
    var tasks: [TaskRecord] = []
    var conversations: [ConversationRecord] = []
    var approvals: [ApprovalRecord] = []
    var agents: [AgentRecord] = []
    var activity: [ActivityEvent] = []
    var agentSource: String = "none"
    var mission: MissionResponse?
    var loading = false
    var banner: String?
    var usingCache = false
    var cacheSavedAt: String?
    var tokenStored = KeychainStore.load() != nil

    init() {
        baseURLString = UserDefaults.standard.string(forKey: "matter.baseURL") ?? "http://127.0.0.1:4786"
        if let cache = SnapshotStore.load() {
            apply(cache)
            usingCache = true
            cacheSavedAt = cache.savedAt
        }
    }

    func saveBaseURL() {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        baseURLString = trimmed
        UserDefaults.standard.set(trimmed, forKey: "matter.baseURL")
    }

    func saveToken(_ token: String) {
        tokenStored = KeychainStore.save(token: token.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    func clearToken() {
        KeychainStore.clear()
        tokenStored = false
    }

    func refresh() async {
        guard let client = makeClient() else {
            connection = .unauthorized
            banner = "Add the Mac mini address and a Keychain token in Settings."
            return
        }
        loading = true
        connection = .checking
        defer { loading = false }
        do {
            let health = try await client.health()
            let mission = try await client.mission()
            let tasks = try await client.tasks()
            let conversations = try await client.conversations()
            let approvals = try await client.approvals()
            let agents = try await client.agents()
            let activity = try await client.activity()
            self.health = health
            self.mission = mission
            self.tasks = tasks
            self.conversations = conversations
            self.approvals = approvals
            self.agents = agents.agents
            self.agentSource = agents.source
            self.activity = activity.reversed()
            connection = .online
            usingCache = false
            banner = health.supervisorHealthy == true ? nil : "Phone API is connected. The supervisor snapshot is not a live healthy process."
            let snapshot = MatterSnapshot(
                savedAt: ISO8601DateFormatter().string(from: Date()),
                tasks: tasks,
                conversations: conversations,
                approvals: approvals,
                agents: agents.agents,
                activity: activity,
                health: health,
                mission: mission
            )
            SnapshotStore.save(snapshot)
            cacheSavedAt = snapshot.savedAt
        } catch MatterClientError.http(401, "session_expired", let message) {
            connection = .sessionExpired
            banner = message
            usingCache = cacheSavedAt != nil
        } catch MatterClientError.http(401, _, _) {
            connection = .unauthorized
            banner = "The Mac mini rejected the Keychain token."
            usingCache = cacheSavedAt != nil
        } catch MatterClientError.http(_, let code, let message) {
            connection = .offline(message)
            banner = "\(code): \(message)"
            usingCache = cacheSavedAt != nil
        } catch MatterClientError.offline(let message) {
            connection = .offline(message)
            banner = "Offline. Showing the last saved snapshot."
            usingCache = cacheSavedAt != nil
        } catch {
            connection = .offline(error.localizedDescription)
            banner = error.localizedDescription
            usingCache = cacheSavedAt != nil
        }
    }

    func send(_ text: String, clientMessageId: String) async -> String? {
        guard let client = makeClient() else {
            banner = "Add the Mac mini address and a Keychain token in Settings."
            return nil
        }
        loading = true
        defer { loading = false }
        do {
            let created = try await client.createTask(clientMessageId: clientMessageId, text: text)
            await refresh()
            return created.task.status
        } catch MatterClientError.offline(let message) {
            connection = .offline(message)
            banner = "Not sent. The Mac mini did not accept the task."
            return nil
        } catch MatterClientError.http(_, let code, let message) {
            banner = "\(code): \(message)"
            return nil
        } catch {
            banner = error.localizedDescription
            return nil
        }
    }

    func authenticateOwner() async -> Bool {
        let context = LAContext()
        var authError: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError) else {
            banner = "This iPhone could not start device authentication. The approval was not sent."
            return false
        }
        let ok = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Confirm this Matter approval") { success, _ in
                continuation.resume(returning: success)
            }
        }
        if !ok {
            banner = "Device authentication failed. The approval was not sent."
        }
        return ok
    }

    func decide(_ approval: ApprovalRecord, decision: String) async {
        guard let client = makeClient() else { return }
        loading = true
        defer { loading = false }
        do {
            _ = try await client.decide(taskId: approval.taskId, decision: decision)
            await refresh()
        } catch MatterClientError.offline(let message) {
            connection = .offline(message)
            banner = "The decision was not recorded."
        } catch MatterClientError.http(_, let code, let message) {
            banner = "\(code): \(message)"
        } catch {
            banner = error.localizedDescription
        }
    }

    private func makeClient() -> MatterClient? {
        guard let url = URL(string: baseURLString), let token = KeychainStore.load(), !token.isEmpty else { return nil }
        return MatterClient(baseURL: url, token: token)
    }

    private func apply(_ snapshot: MatterSnapshot) {
        tasks = snapshot.tasks
        conversations = snapshot.conversations
        approvals = snapshot.approvals
        agents = snapshot.agents
        activity = snapshot.activity.reversed()
        health = snapshot.health
        mission = snapshot.mission
    }
}

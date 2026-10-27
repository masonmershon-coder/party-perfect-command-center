import Foundation
import Security

struct HealthResponse: Codable {
    var ok: Bool
    var service: String
    var authenticated: Bool?
    var supervisorHealthy: Bool?
    var supervisor: SupervisorSnapshot?
}

struct SupervisorSnapshot: Codable {
    var healthFile: Bool
    var pid: Int?
    var running: Bool
    var lastPassAt: String?
    var stale: Bool
    var nodeId: String?
}

struct TaskRecord: Codable, Identifiable {
    var taskId: String
    var clientMessageId: String
    var conversationId: String
    var text: String
    var title: String
    var status: String
    var classification: String
    var approvalState: String
    var executed: Bool
    var route: String
    var routingBasis: String
    var protectedActions: [String]
    var createdAt: String
    var id: String { taskId }
}

struct TaskListResponse: Codable { var tasks: [TaskRecord] }
struct TaskCreateResponse: Codable { var task: TaskRecord; var conversationId: String; var duplicate: Bool }
struct ConversationResponse: Codable { var conversations: [ConversationRecord] }

struct ConversationRecord: Codable, Identifiable {
    var conversationId: String
    var createdAt: String
    var updatedAt: String
    var messages: [MessageRecord]
    var id: String { conversationId }
}

struct MessageRecord: Codable, Identifiable {
    var messageId: String
    var conversationId: String
    var taskId: String
    var role: String
    var text: String
    var createdAt: String
    var id: String { messageId }
}

struct ApprovalRecord: Codable, Identifiable {
    var approvalId: String
    var taskId: String
    var status: String
    var protectedActions: [String]
    var decision: String?
    var note: String?
    var id: String { approvalId }
}

struct ApprovalListResponse: Codable { var approvals: [ApprovalRecord] }
struct ApprovalDecisionResponse: Codable { var task: TaskRecord; var approval: ApprovalRecord }

struct AgentRecord: Codable, Identifiable {
    var workerId: String
    var provider: String?
    var product: String?
    var model: String?
    var available: Bool?
    var availabilitySource: String
    var lastHeartbeat: String?
    var id: String { workerId }
}

struct AgentListResponse: Codable {
    var source: String
    var healthObservedAt: String?
    var agents: [AgentRecord]
}

struct QueueStatus: Codable {
    var total: Int
    var byState: [String: Int]
}

struct LocalIntelligence: Codable {
    var observed: Bool
    var available: Bool?
    var workers: [String]
    var reason: String
}

struct MissionResponse: Codable {
    var supervisorHealthy: Bool
    var supervisor: SupervisorSnapshot
    var queue: QueueStatus
    var approvalsPending: Int
    var agents: [AgentRecord]
    var localIntelligence: LocalIntelligence
}

struct ActivityEvent: Codable, Identifiable {
    var at: String
    var kind: String
    var taskId: String?
    var status: String?
    var route: String?
    var executed: Bool?
    var id: String { "\(at)-\(kind)-\(taskId ?? "")" }
}

struct ActivityResponse: Codable { var events: [ActivityEvent] }

struct APIFailure: Codable { var error: APIErrorBody }
struct APIErrorBody: Codable { var code: String; var message: String }

enum MatterClientError: Error, Equatable {
    case notConfigured
    case offline(String)
    case http(Int, String, String)
}

struct MatterSnapshot: Codable {
    var savedAt: String
    var tasks: [TaskRecord]
    var conversations: [ConversationRecord]
    var approvals: [ApprovalRecord]
    var agents: [AgentRecord]
    var activity: [ActivityEvent]
    var health: HealthResponse?
    var mission: MissionResponse?
}

enum KeychainStore {
    private static let service = "app.kituwa.matter"
    private static let account = "phone-token"

    static func save(token: String) -> Bool {
        let data = Data(token.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
        var insert = query
        insert[kSecValueData as String] = data
        insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(insert as CFDictionary, nil) == errSecSuccess
    }

    static func load() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum SnapshotStore {
    private static var file: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Matter", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("last-snapshot.json")
    }

    static func save(_ snapshot: MatterSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: file, options: .atomic)
    }

    static func load() -> MatterSnapshot? {
        guard let data = try? Data(contentsOf: file) else { return nil }
        return try? decoder().decode(MatterSnapshot.self, from: data)
    }

    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }
}

struct MatterClient {
    var baseURL: URL
    var token: String

    func health() async throws -> HealthResponse { try await send("/v1/health") }
    func mission() async throws -> MissionResponse { try await send("/v1/mission") }
    func tasks() async throws -> [TaskRecord] { try await send("/v1/tasks", as: TaskListResponse.self).tasks }
    func conversations() async throws -> [ConversationRecord] {
        try await send("/v1/conversations", as: ConversationResponse.self).conversations
    }
    func approvals() async throws -> [ApprovalRecord] {
        try await send("/v1/approvals?status=PENDING", as: ApprovalListResponse.self).approvals
    }
    func agents() async throws -> AgentListResponse { try await send("/v1/agents") }
    func activity() async throws -> [ActivityEvent] { try await send("/v1/activity", as: ActivityResponse.self).events }

    func createTask(clientMessageId: String, text: String) async throws -> TaskCreateResponse {
        try await send("/v1/tasks", method: "POST", body: [
            "client_message_id": clientMessageId,
            "text": text,
            "source": "text",
        ])
        // Classification is intentionally absent. The ledger decides it.
    }

    func decide(taskId: String, decision: String) async throws -> ApprovalDecisionResponse {
        try await send("/v1/approvals/\(taskId)", method: "POST", body: ["decision": decision])
    }

    private func send<T: Decodable>(_ path: String, method: String = "GET", body: [String: String]? = nil) async throws -> T {
        try await send(path, method: method, body: body, as: T.self)
    }

    private func send<T: Decodable>(_ path: String, method: String = "GET", body: [String: String]? = nil, as type: T.Type) async throws -> T {
        guard !token.isEmpty, let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw MatterClientError.notConfigured
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 15
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw MatterClientError.offline(error.localizedDescription)
        }
        guard let http = response as? HTTPURLResponse else {
            throw MatterClientError.offline("No HTTP response")
        }
        if http.statusCode >= 400 {
            let failure = try? SnapshotStore.decoder().decode(APIFailure.self, from: data)
            throw MatterClientError.http(http.statusCode, failure?.error.code ?? "http", failure?.error.message ?? "Request failed")
        }
        return try SnapshotStore.decoder().decode(T.self, from: data)
    }
}

import XCTest
@testable import Matter

final class ContractTests: XCTestCase {
    func testMissionDecodesLedgerContract() throws {
        let json = """
        {"supervisor_healthy":false,"supervisor":{"health_file":true,"pid":42,"running":false,"last_pass_at":"2026-10-27T00:00:00Z","stale":true,"node_id":"fixture"},"queue":{"total":2,"by_state":{"QUEUED":1,"BLOCKED":1}},"approvals_pending":0,"agents":[{"worker_id":"codex-local","provider":"openai","product":"codex","model":null,"available":false,"availability_source":"CORE_HEALTH.json","last_heartbeat":null}],"local_intelligence":{"observed":false,"available":null,"workers":[],"reason":"no local intelligence worker in the registry snapshot"}}
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        let mission = try decoder.decode(MissionResponse.self, from: json)
        XCTAssertFalse(mission.supervisorHealthy)
        XCTAssertEqual(mission.supervisor.pid, 42)
        XCTAssertEqual(mission.queue.byState["QUEUED"], 1)
        XCTAssertEqual(mission.queue.byState["BLOCKED"], 1)
        XCTAssertNil(mission.localIntelligence.available)
        XCTAssertEqual(mission.agents.first?.available, false)
    }

    func testTaskCreateFieldsExcludeClassification() {
        let body = ["client_message_id": "msg-1", "text": "Remind me to review the Matter notes", "source": "text"]
        XCTAssertNil(body["classification"])
        XCTAssertEqual(body["source"], "text")
    }
}

import XCTest
@testable import MatterKit

final class MatterPresenceTests: XCTestCase {
    func testOfflineWinsOverEveryOtherSignal() {
        let state = matterPresence(MatterPresenceInput(
            connected: false,
            microphoneOpen: true,
            requestInFlight: true,
            speechPlaying: true,
            taskState: "RUNNING"
        ))
        XCTAssertEqual(state, .offline)
    }

    func testListeningBeatsSpeechAndWork() {
        let state = matterPresence(MatterPresenceInput(
            connected: true,
            microphoneOpen: true,
            requestInFlight: true,
            speechPlaying: true,
            taskState: "RUNNING"
        ))
        XCTAssertEqual(state, .listening)
    }

    func testSpeechRequiresTheDeviceToBePlaying() {
        let state = matterPresence(MatterPresenceInput(
            connected: true,
            microphoneOpen: false,
            requestInFlight: false,
            speechPlaying: true,
            taskState: "QUEUED"
        ))
        XCTAssertEqual(state, .speaking)
    }

    func testOnlyRunningOrLeasedLooksLikeWork() {
        XCTAssertEqual(presence(task: "RUNNING"), .working)
        XCTAssertEqual(presence(task: " RUNNING "), .working)
        XCTAssertEqual(presence(task: "LEASED"), .working)
        XCTAssertEqual(presence(task: "QUEUED"), .idle)
        XCTAssertEqual(presence(task: "SUCCEEDED"), .idle)
        XCTAssertEqual(presence(task: "BLOCKED"), .idle)
        XCTAssertEqual(presence(task: "FAILED_PERMANENT"), .idle)
    }

    func testWaitingForApprovalIsNotWork() {
        XCTAssertEqual(presence(task: "WAITING_APPROVAL"), .waitingForApproval)
    }

    func testInFlightRequestIsThinkingOnlyWhenNothingStrongerIsKnown() {
        let thinking = matterPresence(MatterPresenceInput(
            connected: true,
            microphoneOpen: false,
            requestInFlight: true,
            speechPlaying: false,
            taskState: nil
        ))
        XCTAssertEqual(thinking, .thinking)
        XCTAssertEqual(presence(task: "RUNNING", inFlight: true), .working)
    }

    func testAQuietConnectionIsIdle() {
        XCTAssertEqual(presence(task: nil), .idle)
        XCTAssertEqual(presence(task: "  "), .idle)
    }

    private func presence(task: String?, inFlight: Bool = false) -> MatterPresenceState {
        matterPresence(MatterPresenceInput(
            connected: true,
            microphoneOpen: false,
            requestInFlight: inFlight,
            speechPlaying: false,
            taskState: task
        ))
    }
}

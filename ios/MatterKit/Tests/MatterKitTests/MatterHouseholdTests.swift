import XCTest
@testable import MatterKit

final class MatterHouseholdTests: XCTestCase {
    func testHomeSurfaceHidesWorkOnlyPeople() {
        let shown = visiblePlaces(sample, surface: .home).map(\.id)
        XCTAssertEqual(shown, ["home-adult", "both"])
    }

    func testWorkSurfaceHidesHomeOnlyPeople() {
        let shown = visiblePlaces(sample, surface: .work).map(\.id)
        XCTAssertEqual(shown, ["work-only", "both"])
    }

    func testKeptItemsStayInTheirRoom() {
        let items = [
            MatterKeptItem(id: "note", title: "Note", scope: .home, isPrivate: true),
            MatterKeptItem(id: "ledger", title: "Ledger", scope: .work, isPrivate: true),
        ]
        XCTAssertEqual(visibleKept(items, surface: .home).map(\.id), ["note"])
        XCTAssertEqual(visibleKept(items, surface: .work).map(\.id), ["ledger"])
        XCTAssertTrue(visibleKept(items, surface: .home)[0].isPrivate)
    }

    func testEmptyStorageStaysEmpty() {
        XCTAssertTrue(visibleKept([], surface: .home).isEmpty)
        XCTAssertTrue(visiblePlaces([], surface: .work).isEmpty)
    }

    func testBlankNameDoesNotInventALetter() {
        let place = MatterPlace(id: "x", name: "  ", scopes: [.home])
        XCTAssertEqual(place.mark, "·")
    }

    private var sample: [MatterPlace] {
        [
            MatterPlace(id: "home-adult", name: "Fixture adult", scopes: [.home]),
            MatterPlace(id: "work-only", name: "Fixture work", scopes: [.work]),
            MatterPlace(id: "both", name: "Fixture both", scopes: [.home, .work]),
        ]
    }
}

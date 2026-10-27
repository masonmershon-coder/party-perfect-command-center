import SwiftUI

@main
struct MatterApp: App {
    @State private var model = MatterModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
        }
    }
}

struct RootView: View {
    @Environment(MatterModel.self) private var model

    var body: some View {
        TabView {
            ChatView()
                .tabItem { Label("Chat", systemImage: "bubble.left") }
            TasksView()
                .tabItem { Label("Tasks", systemImage: "checklist") }
            ApprovalsView()
                .tabItem { Label("Approvals", systemImage: "checkmark.seal") }
            AgentsView()
                .tabItem { Label("Agents", systemImage: "person.2") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(Color(red: 0.62, green: 0.78, blue: 0.71))
    }
}

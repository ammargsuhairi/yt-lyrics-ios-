import SwiftUI
import AVFoundation

@main
struct YTLyricsApp: App {
    init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                Color.black.ignoresSafeArea()
                WebView().ignoresSafeArea(edges: .bottom)
            }
        }
    }
}

import WebKit

final class LyricsBridge: NSObject, WKScriptMessageHandlerWithReply {
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage,
                               replyHandler: @escaping (Any?, String?) -> Void) {
        guard let d = message.body as? [String: Any],
              (d["type"] as? String) == "findLyrics" else {
            replyHandler(nil, "pesan tidak dikenal")
            return
        }
        let title = d["title"] as? String ?? ""
        let artist = d["artist"] as? String ?? ""
        let duration = (d["duration"] as? NSNumber)?.doubleValue ?? 0

        Task {
            async let b = LyricsService.better(title: title, artist: artist)
            async let l = LyricsService.lrclib(title: title, artist: artist, duration: duration)
            let bb = await b
            let ll = await l
            var result: [String: Any] = [:]
            if let bb = bb { result["better"] = bb } else { result["better"] = NSNull() }
            if let ll = ll { result["lrclib"] = ll } else { result["lrclib"] = NSNull() }
            await MainActor.run { replyHandler(result, nil) }
        }
    }
}

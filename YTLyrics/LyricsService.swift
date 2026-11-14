import Foundation

enum LyricsService {
    private static func fetch(_ url: URL) async -> Data? {
        guard let (data, resp) = try? await URLSession.shared.data(for: URLRequest(url: url, timeoutInterval: 8)),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        return data
    }

    private static func json(_ url: URL) async -> Any? {
        guard let data = await fetch(url) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    private static func str(_ x: [String: Any], _ k: String) -> String {
        (x[k] as? String) ?? ""
    }

    private static func hasText(_ x: [String: Any]) -> Bool {
        !str(x, "syncedLyrics").isEmpty || !str(x, "plainLyrics").isEmpty
    }

    private static func pick(_ x: [String: Any]) -> [String: Any] {
        ["synced": str(x, "syncedLyrics"),
         "plain": str(x, "plainLyrics"),
         "title": str(x, "trackName"),
         "artist": str(x, "artistName"),
         "source": "LRCLIB"]
    }

    /// BetterLyrics: TTML dengan timing per kata/suku kata
    static func better(title: String, artist: String) async -> [String: Any]? {
        var c = URLComponents(string: "https://lyrics-api.boidu.dev/getLyrics")!
        c.queryItems = [URLQueryItem(name: "a", value: artist),
                        URLQueryItem(name: "s", value: title)]
        guard let url = c.url, let data = await fetch(url) else { return nil }
        var ttml = String(data: data, encoding: .utf8) ?? ""
        if let j = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] {
            ttml = (j["ttml"] as? String) ?? (j["lyrics"] as? String) ?? ""
        }
        guard ttml.contains("<tt") else { return nil }
        return ["ttml": ttml, "title": title, "artist": artist, "source": "BetterLyrics"]
    }

    /// LRCLIB: LRC per baris (fallback)
    static func lrclib(title: String, artist: String, duration: Double) async -> [String: Any]? {
        var c = URLComponents(string: "https://lrclib.net/api/get")!
        var items = [URLQueryItem(name: "track_name", value: title),
                     URLQueryItem(name: "artist_name", value: artist)]
        if duration > 0 { items.append(URLQueryItem(name: "duration", value: String(Int(duration.rounded())))) }
        c.queryItems = items
        if let url = c.url, let x = await json(url) as? [String: Any], hasText(x) {
            return pick(x)
        }

        let terms = ["\(artist) \(title)".trimmingCharacters(in: .whitespaces), title]
        for term in terms {
            var s = URLComponents(string: "https://lrclib.net/api/search")!
            s.queryItems = [URLQueryItem(name: "q", value: term)]
            guard let url = s.url,
                  let list = await json(url) as? [[String: Any]], !list.isEmpty else { continue }
            var pool = list
            if duration > 0 {
                pool = pool.filter { abs((($0["duration"] as? Double) ?? 0) - duration) <= 6 }
            }
            pool = pool.filter { hasText($0) }
            if pool.isEmpty { continue }
            pool.sort { a, b in
                let sa = str(a, "syncedLyrics").isEmpty ? 0 : 1
                let sb = str(b, "syncedLyrics").isEmpty ? 0 : 1
                return sa > sb
            }
            return pick(pool[0])
        }
        return nil
    }
}

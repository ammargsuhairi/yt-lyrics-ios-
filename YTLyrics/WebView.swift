import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    func makeCoordinator() -> LyricsBridge { LyricsBridge() }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.allowsPictureInPictureMediaPlayback = true

        let uc = cfg.userContentController
        uc.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "yal")
        uc.addUserScript(WKUserScript(source: Self.injectedSource(),
                                      injectionTime: .atDocumentEnd,
                                      forMainFrameOnly: true))

        let wv = WKWebView(frame: .zero, configuration: cfg)
        wv.allowsBackForwardNavigationGestures = true
        wv.isOpaque = false
        wv.backgroundColor = .black
        wv.load(URLRequest(url: URL(string: "https://m.youtube.com")!))
        return wv
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    /// Gabungan: CSS + shim pengganti chrome.runtime + script lirik (yal.js)
    static func injectedSource() -> String {
        func load(_ name: String, _ ext: String) -> String {
            guard let url = Bundle.main.url(forResource: name, withExtension: ext),
                  let s = try? String(contentsOf: url, encoding: .utf8) else { return "" }
            return s
        }
        let css = load("yal", "css")
        let js = load("yal", "js")
        let arr = (try? JSONSerialization.data(withJSONObject: [css], options: []))
            .flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"

        return """
        (function() {
          var css = \(arr)[0];
          var st = document.createElement('style');
          st.textContent = css;
          document.head.appendChild(st);

          var chromeShim = {
            runtime: {
              lastError: null,
              sendMessage: function(msg, cb) {
                window.webkit.messageHandlers.yal.postMessage(msg)
                  .then(function(r) { cb({ ok: true, result: r }); })
                  .catch(function() { cb({ ok: false }); });
              }
            }
          };

          (function(chrome) {
          \(js)
          })(chromeShim);
        })();
        """
    }
}

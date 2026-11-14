# YT Lyrics (iOS)

App iOS berisi WebView m.youtube.com + lirik otomatis (BetterLyrics per kata, fallback LRCLIB).

## Build .ipa tanpa Mac
1. Push folder ini ke repo GitHub (branch `main`).
2. Buka tab **Actions** > **Build IPA** > Run workflow (atau otomatis saat push).
3. Setelah selesai, download artifact **YTLyrics-ipa** (isinya `YTLyrics.ipa`, unsigned).
4. Install lewat AltStore atau Sideloadly dengan Apple ID (akan ditandatangani saat install).

## Build di Mac
brew install xcodegen && xcodegen generate, lalu buka YTLyrics.xcodeproj di Xcode.

Ganti `com.example.ytlyrics` di project.yml jika bundle ID bentrok saat sideload.

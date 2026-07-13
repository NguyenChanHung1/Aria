# Aria mobile

Flutter client for creating Aria projects, uploading optional audio/video input, and viewing whether the input is ready for analysis.

```bash
flutter pub get
flutter run --dart-define=ARIA_API_URL=http://localhost:8010
```

Use `http://10.0.2.2:8010` for an Android emulator. Physical devices require the API host's reachable LAN address.

The current client stops at project ingestion. Acoustic analysis and correctable input interpretation arrive in Phase 2; lyrics, composition, mixing, and playback are not currently exposed.

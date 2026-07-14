# Aria mobile

Flutter client for creating Aria projects, uploading optional audio/video input, and confirming or correcting the analyzed input interpretation.

Start the backend from the repository root, then install the app dependencies and list available devices:

```bash
flutter pub get
flutter devices
```

For an Android emulator:

```bash
flutter run -d <android-device-id> \
  --dart-define=ARIA_API_URL=http://10.0.2.2:8010
```

For an iOS Simulator:

```bash
flutter run -d <ios-simulator-id> \
  --dart-define=ARIA_API_URL=http://localhost:8010
```

Physical devices require the API host's reachable LAN address:

```bash
flutter run -d <device-id> \
  --dart-define=ARIA_API_URL=http://<development-machine-lan-ip>:8010
```

The current client supports project ingestion, Phase 2 acoustic analysis, and versioned interpretation review. Lyrics, composition, mixing, and playback are not currently exposed.

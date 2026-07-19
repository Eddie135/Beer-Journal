# Beer Journal

Beer Journal 1.0 is a local-first Android beer journal. Beer records, tastings, tags, countries, ratings, compressed photos, statistics, trash recovery, and JSON backups stay on the device.

## 1.0.0

- Package: `com.mybeerjournal.app`
- Version: `1.0.0` (versionCode 31)
- SQLite schema: 4
- Offline storage: SQLite plus the private Android app filesystem
- No account, cloud sync, analytics, advertising, or dependency on `mybeerjournal.com`

Uninstalling the app or clearing its data removes local records and photos. Export a JSON backup regularly. The separate internal package `com.mybeerjournal.app.v1test` does not share data automatically; export from the test package before importing into the formal package.

## Features

- Beer and Tasting create, edit, detail, soft delete, and restore
- Custom countries, categories, styles, tags, and five-option sensory ratings
- Multiple local photos, compression, cover selection, deletion, and recovery
- Search, filters, stable sorting, and personal statistics
- Android-style overlays and back-button handling
- JSON backup and restore

## Build locally

```powershell
cd mobile
pnpm install
pnpm test
pnpm build
```

Android builds use Capacitor 8 and a local Android SDK. APKs, build outputs, local databases, photos, and signing files are intentionally ignored by Git.

## Privacy and security

All 1.0 records remain on the device. See [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md). No license is declared yet.

## Roadmap

Candidate work for later versions is documented in [docs/ROADMAP.md](docs/ROADMAP.md). Development is frozen after 1.0 until a future planning decision.

## Project page and releases

The static project page is [docs/index.html](docs/index.html). Once the repository is published, the page's download and source links should point to the repository's `v1.0.0` release.

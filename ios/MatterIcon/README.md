# Matter app icon

Drop-in for Claude’s authoritative Matter target. The mark is the approved Wick: charcoal `#100E0C`, flame `#E7B089`, core `#FBE2C7`. No text. The square master is not pre-rounded. iOS applies the Home Screen mask.

Copy this catalog into the authoritative app:

`ios/Matter/Matter/Assets.xcassets`

On that target, set `ASSETCATALOG_COMPILER_APPICON_NAME` to `AppIcon`. Leave the bundle identifier, signing, and existing application data alone.

Files:

- `AppIcon.png` — 1024×1024, opaque RGB, any appearance
- `AppIcon-Dark.png` — the same artwork, so Dark Mode does not invert it
- `AppIcon-Tinted.png` — grayscale silhouette for the iOS tinted appearance

The same catalog is already referenced by the comparison project `ios/Matter`, whose app-icon setting was blank. That project is not the app to ship. Claude’s unpublished app is the one that belongs on the iPhone.

This environment has no Xcode, no Apple signing certificate, and no connected iPhone. The Home Screen was not checked here. Do not treat the file’s existence as a device verification.

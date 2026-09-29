# App Store simulator screenshots

This helper runs the existing iOS release sources in genuine iPhone/iPad simulators on GitHub-hosted macOS. It adds an ephemeral UI-test target, signs into the isolated synthetic Apple review organization and captures native screenshots. It does not modify application sources, mock API responses, upload a new release or submit App Review.

Run only with explicit authorization to use the review credentials in GitHub Actions. Store the JSON `{ "email": "…", "password": "…" }` as the protected `store-release` environment secret `APPLE_REVIEW_SCREENSHOT_ACCESS`. Never commit that JSON, runner binaries, derived data or test result bundles. Only PNGs and non-sensitive provenance are uploaded.

The prepared workflow addition must retain the existing protected environment, branch restrictions and manual approval. It must use the same source tree and public build settings as build 1.0.1 (6). Review screenshots visually before uploading to App Store Connect.

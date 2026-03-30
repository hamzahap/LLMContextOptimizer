# Changelog

All notable changes to this project are documented in this file.

## [1.0.2] - 2026-03-30

### Added
- Regression tests for proxy passthrough safety and endpoint-specific handling.
- CLI validation tests for numeric options.
- Message optimizer tests for system-order preservation and per-block text handling.
- Integration regression test to verify audit logs do not accumulate across pipeline runs.
- ESLint flat config and lint dependency setup.

### Changed
- Hardened proxy behavior to avoid destructive request sanitization on passthrough.
- Added endpoint-aware optimization for OpenAI `/v1/chat/completions` and `/v1/responses`.
- Added strict numeric validation for `optimize`, `send`, and `proxy` CLI options.
- Improved packaging with `prepack` build and explicit publish file whitelist.
- Updated dependency lockfile and cleared production `npm audit` findings.

### Fixed
- Fixed audit state leakage across repeated `OptimizePipeline.run()` calls.
- Fixed message optimizer system message reordering in compressed conversations.
- Fixed unsafe text-block replacement that could corrupt block-based message content.
- Fixed zero-budget audit summary formatting (`Infinity%` -> `N/A`).

## [1.0.1] - 2026-03-29
- Proxy fixes for passthrough behavior and non-chat endpoints.

## [1.0.0] - 2026-03-29
- Initial public release.

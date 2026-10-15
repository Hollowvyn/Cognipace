# Phase H Official Optimizer Package Audit

Read-only package inspection on 2026-10-11. This records the published inputs to the packaged feasibility test; it does not claim that the optimizer starts, trains, or matches CogniPace's scheduler in Chrome.

## Baseline and source

- Verified source branch: `codex/fsrs-phase-h-personalization` from `origin/main` at Phase G merge `ef14c1a5`. The older Phase E worktree was not used.
- `rtk npm ci` restored lockfile dependencies. `rtk npm ls wxt ts-fsrs --depth=0` reported WXT 0.21.3 and `ts-fsrs` 5.4.0. `rtk npm run check` passed 3,844 tests with 10 existing skips across 251 files before the probe.
- Context7 resolved the official `ts-fsrs` and FSRS browser documentation. The [official binding 0.5.0 release](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/@open-spaced-repetition%2Fbinding@0.5.0) is a separate package; it upgrades its Rust training engine to fsrs-rs 6.5.0. CogniPace's saved scheduler profiles identify FSRS-6.0. The shared 21-weight shape does not establish prediction or state parity.
- The [published binding README](https://github.com/open-spaced-repetition/ts-fsrs/tree/eccc5fc/packages/binding#dynamic-wasi-initialization) uses a separately installed WASI package and `initOptimizer({ wasm, worker })`. Its browser guidance recommends COOP `same-origin` and COEP `require-corp`. The current `wxt.config.ts` has `wasm-unsafe-eval` but no isolation manifest keys. [Chrome's extension isolation documentation](https://developer.chrome.com/docs/extensions/develop/concepts/cross-origin-isolation) distinguishes extension pages from service workers; the packaged dashboard path must be measured directly.

## Published 0.5.0 artifacts

| Artifact                                      | npm unpacked bytes | SHA-256 of downloaded tarball                                      |
| --------------------------------------------- | -----------------: | ------------------------------------------------------------------ |
| `@open-spaced-repetition/binding`             |            111,657 | `c6ffab13ccb66594a3d82c49e89350bf41cde245d902ba541120336bc6a925fc` |
| `@open-spaced-repetition/binding-wasm32-wasi` |            610,708 | `befba7a4782d0fb0dc80b83828efacd2346839ca8f6c493fb8547d388680eef2` |

Both packages declare MIT licensing. The extracted WASM binary is 598,176 bytes, SHA-256 `c1c843e8cbda3069c6933565087e8984b882ca7cd38652b2155af5a0c47d879f`. These are npm/extracted sizes, not Chrome bundle transfer, loaded memory, or peak heap measurements. The published type declaration says `FSRSBindingReview(rating, deltaT)` accepts ratings 1–4 and integer day gaps, with zero for an item's initial review. Each `FSRSBindingItem` corresponds to one observation and includes that card's preceding reviews. `computeParameters` accepts `enableShortTerm`, progress callback, and an optional training configuration; CogniPace daily mode must explicitly pass `enableShortTerm: false`. The binding returns f32-derived JavaScript weights. Its `logLoss` and `rmseBins` metrics do not replace a paired, equivalent-input comparison through the installed scheduler.

Commands: `rtk npm view @open-spaced-repetition/binding version dist.unpackedSize license`; the matching WASI package query; `rtk npm pack` for both exact 0.5.0 versions into `/private/tmp`; `rtk proxy tar` inspection; `rtk proxy shasum -a 256` on both tarballs and extracted WASM; `rtk proxy stat -f '%z %N'` on extracted WASM; `rtk npm ls wxt ts-fsrs --depth=0`; and `rtk npm run check`. No real user data was read or trained.

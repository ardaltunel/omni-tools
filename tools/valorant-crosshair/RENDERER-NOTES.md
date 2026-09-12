# Crosshair renderer trial

The reference selector and image rendering mode have been removed at user request. Original PNG files and image metadata remain only as comparison fixtures. Backups from before the trial are in .codex-backups/valorant-before-renderer. Never restore entire shared root files over unrelated changes.

## Research and behavior
Source: https://op.gg/valorant/crosshairs?category=all and its public 5052-009d3df8f946cde5.js preview bundle, inspected 2026-09-12.
Corrections: odd-width negative-arm pixel alignment; right/left/down/up paint order; inner/dot/outer layer order; outer length and inner offset limits; fire-error preview offset (+4 when enabled without override). This is a static primary profile preview, not a simulation of every Riot engine state. No per-example geometry exceptions.

## Verification
Run node --test tools/valorant-crosshair/renderer.test.cjs (9 passing tests).
Run node tools/valorant-crosshair/export-comparison.cjs then python tools/valorant-crosshair/compare.py.
15 of 18 references now match the comparison tolerance, up from 5. Artı Cross and the final two 600x420 references still differ. Comparison excludes reference artifacts with alpha <=16/255 and allows 2/255 premultiplied RGBA error. This does not claim byte-identical PNGs or identical CSS scaling. Details are in comparison-results.json.

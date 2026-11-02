---
name: craft-launcher
description: Reference for ArtCraft Launcher (github.com/storytold/craft-launcher), the app that lists, installs, updates and opens every tool of the Craft App Suite - its catalog, install locations per system, updates and self-update, build, checks and logs, verified against its repository before answering. Use when a request is about the launcher itself or about installing, updating, finding or opening Craft apps, including QA work on it. Not for using a Craft tool (each tool has its own skill).
license: MIT
metadata:
  version: "0.1.0"
  status: draft
  category: artcraft
---

# ArtCraft Launcher

## Purpose

Give whoever works on ArtCraft Launcher (questions, requirements review, test design, failure analysis) an accurate starting point on the app and its repository, checked against the source instead of recalled.

## Responsibilities

- Answer questions about the launcher: which tools it knows, how it installs and updates them, where they go, how it updates itself.
- Give the project facts below as orientation and confirm them in the repository before relying on them.
- Hand QA activities to the QA skills with the launcher as the project.
- Does **not** answer how to use a Craft tool (that tool's skill), change the launcher repository, or replace reading its code and docs.

## When to use

- The request names ArtCraft Launcher, `craft-launcher` or `artcraft-launcher`.
- The request is about installing, updating, detecting or opening Craft apps, the suite catalog, or the launcher's packaging.
- A QA activity on the launcher needs product knowledge: load this skill, then the QA skill.

Not for using a Craft tool: each has its own skill.

## Project facts

From the launcher README and `crates/core/src/catalog.rs` on 2026-10-27. They drift: the repository wins.

- **Repository:** https://github.com/storytold/craft-launcher (branch `main`, Rust, dual MIT or Apache-2.0); app id `artcraft-launcher`, bundle id `ai.storyteller.artcraft-launcher`.
- **What:** lists every app of the suite, shows which are installed and their version, installs the right build for the operating system and processor (DMG, MSI, AppImage, .deb, .rpm and more) after checking it against the release's SHA-256, checks each app's GitHub releases for updates with a notification, opens any app from one window or the tray and menu-bar icon. Native egui. The web version shows the same catalog with the latest download per app.
- **Catalog:** `SUITE` in `crates/core/src/catalog.rs`, the apps in display order (13 on 2026-10-27; 15 apps with a release on 2026-11-02 in GitHub, adding texturecraft and craft-anything; re-verify the list in `catalog.rs`): photocraft, vectorcraft, filmcraft, lightcraft, pdfcraft, effectcraft, designcraft, figcraft, wordcraft, soundcraft, deckcraft, cadcraft, gridcraft. The id is the repository, binary, package and asset stem; bundle id `ai.storyteller.<id>`; only the `storytold` GitHub account is installed from. PdfCraft shipped as PrintCraft until 0.2.1 (`former_ids`).
- **Install locations:** macOS `/Applications/<App>.app` from the signed, notarized DMG; Windows from the MSI (not confirmed: an earlier reading says `C:\Program Files\<App>`, the launcher code says `Program Files\ArtCraft\<App>` per machine or `%LOCALAPPDATA%\Programs\ArtCraft\<App>` per user; check the launcher code before answering); Linux `/usr/bin` and `/usr/share/applications` from the .deb or .rpm, otherwise a Flatpak or an AppImage in `~/Applications`; inside the launcher's own Flatpak with no host Flatpak, the release tarball in the launcher's data folder; FreeBSD `/usr/local` (polkit), or `~/.local` without polkit. It also finds apps installed by hand.
- **Updates:** same format the app was installed with; SHA-256 checked before installing; a running app is never replaced. Self-update: **Update and restart**.
- **Interface languages:** 11, Brazilian Portuguese among them; **Auto** follows the system; catalogs in `crates/ui-egui/src/i18n/`.
- **Layout:** crates `core` (catalog, release feed, platform, versions), `native` (detection, install, portable, processes, self-update), `ui-egui`; apps `artcraft-launcher` (desktop) and `artcraft-launcher-web`.
- **Run:** Rust 1.90 or newer; `cargo run --release -p artcraft-launcher`; web: `cd apps/artcraft-launcher-web && trunk serve`. Local builds of the apps: `cargo xtask local sync` and `cargo xtask local serve` (see the README).
- **Checks:** `cargo xtask ci` (fmt, clippy, tests, wasm check).
- **Logs:** `logs/artcraft-launcher.log` in its data folder (Linux `~/.local/share/artcraft-launcher`), the previous two runs kept as `.1.log` and `.2.log`; `RUST_LOG` changes what it records.
- **Contributor and agent rules:** `AGENTS.md` at the repository root.

## Inputs

- **Required:** the request about the launcher.
- **Optional:** the path of a local clone, the operating system and version, the launcher version, its log, a story or a test to analyze.

## Tools

- Read files from a local clone, or fetch them from `https://raw.githubusercontent.com/storytold/craft-launcher/main/<path>`.
- Shell, optional, read-only in a clone: `git log`, `git show`, `cargo run -p artcraft-launcher -- --help`.
- Without file or web access: answer from the project facts, labeled unverified, and ask for the files the answer needs.

## Procedure

1. **`scope`** — Confirm the request is about the launcher. Using a Craft tool: that tool's skill (the `artcraft-router` agent decides).
2. **`load`** — Start from the project facts.
3. **`verify`** — Before stating behavior, paths, formats or counts, read the repository's `README.md`, `AGENTS.md` and the source the topic needs (`crates/core/src/catalog.rs` for the suite, `crates/native/src/install.rs` for installation, `crates/native/src/self_update.rs` for self-update). When they disagree with the facts, the repository wins: say which fact is stale.
4. **`answer`** — In the user's language: the direct answer, then the source (link or path). For a QA activity, continue with `project-context` using the project id `craft-launcher` (created if missing) and the QA skill; offer verified facts as context proposals, never as confirmed context without the user's OK.

## Rules and constraints

- Source over memory: every claim about the launcher is checked in its repository or labeled unverified.
- Never change the launcher repository, nor open issues or pull requests on it, from this skill.
- Never invent behavior, paths or commands; missing information is a pending item ([execution principles](references/core/execution-principles.md)).
- Project data stays in its project folder ([isolation](references/core/isolation-policy.md)).

## Validation criteria

- The answer names the repository and, when relevant, the file it was checked in.
- Verified and unverified statements are distinguishable.
- Stale project facts are reported.

## Output format

An answer in the conversation: direct answer, source, open points. When a QA skill takes over, its own output format applies inside `workspace/projects/<project-id>/`.

## Human approval points

None in this skill; the QA skills that follow keep their own gates.

## Error handling

- Repository or file unreachable: answer from the project facts, labeled unverified, and say what could not be read.
- The answer depends on the operating system and it was not given: ask for it.
- Same fetch failing 3 times: stop and report what was tried.

## Completion criteria

The request is answered with verified sources, or handed to a QA skill with the launcher identified as the project.

## Persistence

None. This skill writes nothing; QA skills that follow persist under `workspace/projects/<project-id>/`.

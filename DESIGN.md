# Popcorn - TMDB catalog

## Progressive playback extension contract (October 15, 2026)

This narrow extension supersedes older paper/ink and no-playback restrictions. The current `apps/desktop/src/styles.css` is the visual authority: preserve the dark cinema canvas (`--canvas: #17191d`, `--canvas-deep: #101216`), charcoal surfaces, red action accent, sans-serif UI, existing spacing, radii, and responsive catalog. No redesign, dependencies, or Lighthouse expansion.

- Before Assistir, a labelled native quality select offers Auto (até 1080p), 1080p, and 720p; Auto is the initial choice. Quality applies to a newly started playback, not a running session.
- Retain the full-screen cinema overlay, download statistics, close action, and native video controls for seeking, volume, pause/play, and fullscreen. A wrapping toolbar and independently scrollable status area must remain usable on narrow or short windows. Overlay focus is contained and returns to the invoking control on close; Escape closes outside native fullscreen.
- Preparing has immediate Portuguese status and does not load an empty URL. Only READY or PAUSED sessions with a URL mount media. Conversion status distinguishes direct playback, remux, audio conversion, and video conversion without promising a completed download.
- Preparation, transport, decoder, and control failures appear inside the overlay using the existing negative tokens and `role="alert"`. Backend diagnostics are safe fixed copy. Failed sessions retain close and explicit retry actions; retry starts the same file with the selected quality.
- Direct playback uses the original HTTP Range URL and browser controls. MSE uses the supplied codec declaration, segment mode, and backend `timestampOffsetSeconds` to map the stream onto the source timeline. Preserve preceding keyframe preroll: never offset by the seek position or set an append window there. Set the full duration and restore the seek position only once that time is buffered. Maintain approximately 30 seconds of lookahead and retained history; unbuffered seeks create a fresh cancellable MediaSource with `start` and a monotonically increasing positive `generation` query. Statistics updates do not recreate media.
- New quality/status primitives reuse `--muted`, `--ink`, `--surface`, `--line`, `--negative-bg`, `--negative`, `--space-2/3/4/6`, existing 12/13px secondary type, and 44px native field targets. Status is textual, not color-only; no new animation.
- Validation scope: strict desktop typecheck here; the parent owns production build and real browser/native playback, including codec support, progressive MKV conversion, seek races, and source disposal. No mocks or UI test harness are shipped.

## TMDB extension contract (October 14, 2026)

This extension supersedes the I1-only restrictions below. Preserve the warm paper/ink palette, editorial serif, restrained native controls, and document-owned scrolling. The catalog now supplies real artwork; no placeholder posters or fabricated titles are shipped.

- Official references read: https://developer.themoviedb.org/docs/faq, https://developer.themoviedb.org/docs/authentication-application, https://developer.themoviedb.org/docs/image-basics and https://www.themoviedb.org/about/logos-attribution. The approved, unmodified short blue logo is vendored from that last page into `apps/desktop/src/assets/tmdb.svg`. Its colors are brand-owned and exempt from UI palette tokens.
- Default: online Films / Popular. A successful status RPC with `configured:false` displays setup, never an empty catalog. Offline/local is a separate, always available source tab and uses the installed snapshot RPCs.
- Setup is a reading panel with numbered instructions, a fixed external settings opener, native masked API Read Access Token input, and checked-by-default "Salvar neste dispositivo". Token text is cleared as submission begins and is never rendered, logged, or stored by the frontend. Saving is optional and backend-owned; do not claim encryption. Browser links use a new isolated tab; the native app invokes only `open_tmdb_settings`.
- Reusable primitives: source/media/category button clusters; labelled native search/genre/select controls; setup/state panels; poster card; artwork frame; detail panel; season selector; ordered episode list; attribution footer. Buttons keep 44px minimum targets, visible focus, pressed and disabled feedback. Form fields use the same radius, borders, padding, and focus token as buttons.
- Layout: content max 1200px, catalog/detail approximately 2:1 above 1000px and stacked below. Poster grid uses intrinsic tracks with a 148px floor, 16px gap, 2:3 artwork ratio, and two tracks on compact screens. Empty art is a typographic "Sem imagem" frame on the soft surface. Selected cards use a wash and textual checkmark. Detail backdrop is 16:9 with a reserved frame. Logo is 80px wide, always smaller than Popcorn branding.
- Search submits explicitly and exposes the current films/series scope. Popular, upcoming ("Próximos lançamentos" for movies; "Em exibição" for TV), and top-rated use real RPCs. Selecting a genre resets to Popular; selecting a category resets genre. Replacement requests abort and generation-guard catalog, genre, detail, season, and episode responses. Pagination is manual; failed pagination preserves the existing collection and its retry.
- Detail reads synopsis, genres, cast, year, rating, runtime; TV adds seasons and episodes with unavailable-data explanations. No player or download action. Mobile title selection moves focus to the detail heading; no focus move on background loads.
- Every request has immediate loading, completed empty, safe error and explicit manual retry states. Missing/invalid credentials, network unavailable, rate limited, missing title, malformed response, and configuration failure use distinct fixed Portuguese copy. Raw errors are never printed. Stale responses are visibly "Cache / offline", including genres, details, seasons and episodes independently.
- Status and native shutdown errors are separate from catalog errors, so a late RPC cannot erase a shutdown failure. Connection bootstrap remains native-only and its listener is cleaned up.
- Footer/About permanently credits TMDB with the approved logo and exact notice: "This product uses the TMDB API but is not endorsed or certified by TMDB."
- Typography extends the existing scale with compact-card title 16px/1.4 and mobile body 17px. Footer/secondary copy is 14px. Existing color, spacing and radius tokens remain authoritative.
- Personas: first-use viewer configuring their own token; returning viewer exploring movies/series; disconnected viewer reading cache/local metadata; keyboard and narrow-screen viewer reaching details. QA exercises the real built frontend with isolated IPC/protobuf fixtures only; real TMDB/native integration remains parent-owned. No Lighthouse dependency or expanded research is introduced.

## 0. Research Log

Research performed on October 14, 2026, before writing components.

- Embedded references: shortlisted Notion (warm editorial), Linear (dense operational), and Spotify (media-led). Selected `minimalist-skill.md` and `notion.md`, read in full. Adopt warm neutrals, compact squared controls, restrained dividers, typographic hierarchy, and whitespace. Do not copy brand assets or Notion's proprietary font.
- Lazyweb: two distinct queries, `film library desktop catalog` and `library empty state desktop`; viewed two returned screens. Paramount's screen uses a repeated collection with consistent item alignment. Its poster grid is inappropriate here because I1 has no poster contract. The CodeCrafters result was blank and supplied no usable empty-state evidence. Use a textual collection; do not invent imagery or claim blank content proves a shipped empty-state pattern.
- StyleGallery: fetched the catalog and the [list-detail contract](https://github.com/changeroa/StyleGallery/blob/main/patterns/split-sidebar/list-detail.md). Adopt list beside detail, source order matching reading order, `min-inline-size: 0`, and responsive stacking. The document owns scrolling; there are no nested scroll regions.
- Official documentation: Context7 retrieved Solid signals, `onMount`, and `Show` documentation; Tailwind's first-party Vite plugin and CSS import; Tauri's `invoke` API. Also checked the official Tauri core API and Solid Vite plugin repository. Sources: https://docs.solidjs.com/reference/basic-reactivity/create-signal, https://tailwindcss.com/docs/installation/using-vite, https://v2.tauri.app/reference/javascript/api/namespacecore/, https://github.com/solidjs/solid-vite-plugin.
- Tool limitations: no Imagen-specific tool is exposed, so no Imagen drafts were produced. No Chromium executable was found on PATH at research time. Browser QA availability will be probed and evidence recorded honestly. No React tooling applies to this Solid client.
- Scope: this is a minimal integration validation client, not a streaming MVP. No playback, downloads, poster placeholders, fabricated catalog data, accounts, or search that the service does not implement.

## 1. Atmosphere & Identity

A quiet film-library reading room: paper-toned canvas, ink typography, and a serif library title. The recognizable moment is the editorial title above a restrained catalog ledger, not an entertainment-service hero. The connection strip separates system truth from catalog content.

## 2. Color

The desktop uses only `@radix-ui/colors` for interface colors. `src/theme.css` imports the dark scales and maps semantic tokens into Tailwind v4 with `@theme inline`. The default Tailwind color palette is cleared. The `dark` class on the HTML root activates Radix variables in the app, portals, and dedicated player window.

| Tokens | Radix scale | Role |
| --- | --- | --- |
| `--canvas-deep`, `--canvas` | Slate 1–2 | Page and subtle panels |
| `--surface`, `--soft` | Slate 3–4 | Controls and hover |
| Selected controls | Slate 5 | Pressed state |
| Dividers / `--line` / hovered borders | Slate 6 / 7 / 8 | Separators and control borders |
| `--ink`, `--muted` | Slate 12 / 11 | Primary and secondary text |
| `--accent`, `--accent-hover`, `--accent-strong` | Tomato 9 / 10 / 11 | Solid fills, hover, accent text |
| `--accent-contrast` | Black A12 | Text on solid accent fills |
| `--positive`, `--positive-bg` | Green 11 / 3 | Success |
| `--negative`, `--negative-bg` | Tomato 11 / 3 | Errors |
| Cache warning | Amber 11 | Warning text |
| `--focus` | Blue 11 | Keyboard focus |
| Shadows and overlays | Black / White / Tomato alpha scales | Depth and translucent states |

Use Radix steps 11–12 for text rather than solid-fill steps 9–10. Solid Tomato controls use a dark foreground for readable small labels. Color never stands alone as the status indicator. Media artwork and the approved TMDB logo retain their source colors.

## 3. Typography

- UI, headings, and player controls use locally bundled Google Sans, with system sans-serif fallbacks. Tailwind's `font-sans` maps to the same `--font-ui` token.
- Variable normal and italic fonts support weights 400–700, with automatic optical sizing. Headings use regular weight; semibold and intermediate weights retain the existing hierarchy without synthetic bold.
- Font definitions live in `src/fonts.css`; assets and their OFL license live in `src/assets/fonts`, with a distribution copy of the license in `public/Google-Sans-OFL.txt`. The normal face is preloaded and both faces use `font-display: swap`.
- Technical paths retain the monospace stack. Existing font sizes and line heights remain authoritative.

## 4. Spacing & Layout

- Base unit 4px; tokens 4, 8, 12, 16, 24, 32, 48, 64px.
- Content maximum 1200px; page gutters fluid 20-64px.
- Header: wordmark and explicit validation-client label. Main content order: library introduction (explain), connection (prove), collection (navigate), selected title (explain).
- Catalog/detail split: roughly 1.1:1 with 32px gap; single column below 760px. The body owns vertical scrolling. No fixed-height content panels.
- Empty and browser-only states occupy the collection region with clear heading and explanatory text. Unknown count is an em dash, never zero.
- All controls have a minimum 44px target; wrapping clusters prevent mobile overflow.

## 5. Components

- **Button**: native button; primary ink fill or neutral outline; 6px radius, 12/16px padding; hover wash, pressed opacity, focus-visible ring, disabled opacity. Disabled while its operation is pending. No decorative animation.
- **Status badge**: text and small circular status mark; neutral/loading, connected, error, browser variants; 12px label, 4/8px spacing. Decorative mark is hidden from assistive technology.
- **State panel**: heading, short explanation, optional retry button. Loading uses plain text; empty means a completed zero-row RPC. Errors use safe fixed user-facing copy, never raw RPC errors.
- **Title row**: native button in a semantic list; title, supplied year/category, selection glyph; entire row is clickable. Neutral wash for hover and selection, visible focus ring. Missing content identity disables selection.
- **Detail panel**: labelled section; instruction, loading, safe error with retry, or returned title/overview/metadata. No invented synopsis. Small-screen selection brings the panel into view and focuses its heading.

These primitives are validated through the application's actual state harness rather than an additional shipped showcase route.

## 6. Motion & Interaction

No autonomous or entrance animations. Hover and pressed feedback are immediate. Loading starts in the same task; actions are disabled until it settles. Manual retries never overlap bootstrap or list requests. Detail requests use cancellation plus a request generation guard, so stale responses cannot replace the current selection. Reduced-motion scrolling is immediate; otherwise selection uses smooth scrolling.

## 7. Depth & Surface

Neutral borders plus tonal separation, no shadows or gradients. Surface panels have 8px radius; controls 6px; badges 4px. Canvas, surface, divider, and spacious type supply the hierarchy. Media artwork is only rendered if a future service contract actually supplies it; I1 supplies none.

## 8. Accessibility Constraints & Accepted Debt

Target WCAG 2.2 AA: 4.5:1 body contrast, visible focus, keyboard-native controls, Portuguese labels, live connection/loading/error updates, selected state via `aria-pressed`, and non-color status text. Respect OS light/dark preference and reduced motion. Reading order and visual order match.

Validation persona: a user checking whether the local service starts and exposes the installed snapshot. Primary tasks are understanding connection state, retrying failures, reading the real collection, and opening real title metadata.

Integration-owned validation: the parent owns real Tauri launch, sidecar lifecycle, CSP/origin configuration, and end-to-end RPC QA. Browser-only mode must explicitly say to open the desktop app and never claim a backend connection. No raw token, address, or error is logged or persisted.

The native `backend-shutdown-error` event supplies a safe user-facing string and appears in the existing connection error panel. The listener is desktop-only and cleaned up with the Solid owner.

### Validation evidence

- Strict typecheck and production build passed using Bun CLI 1.3.14 against the actual generated SDK. Tauri declarations require `ESNext.Disposable`; no checks were suppressed.
- A temporary Chrome for Testing executable was provisioned at `/tmp/popcorn-qa-browser/chrome-linux64/chrome`. Rendered the built app at 1440px and at 390px with mobile DPR 3 and touch emulation, in light and dark modes, including the bottom of the document. No horizontal overflow was observed.
- Browser-only mode showed the desktop explanation, no connection action, and an unknown catalog count rather than zero.
- Isolated in-memory IPC/protobuf fixtures exercised the actual SDK transport: authenticated list/detail, completed empty response, startup error, RPC error, detail error and retry, immediate loading, disabled overlapping retry, mobile detail-heading focus, and shutdown error arriving before a catalog response. The shutdown error remained visible after the response. These are fixture checks, not proof of real Tauri/backend integration.
- Fixture checks found no credential/address in the DOM and no local/session storage entries. Synthetic titles and IPC hooks exist only in the QA process; none are shipped.
- Real native launch, real backend RPC integration, and sidecar preparation remain parent-owned checks. GTK/WebKit are unavailable locally. No Lighthouse score or full dual-oracle visual audit is claimed. The parent explicitly requested no expanded research or QA scope.

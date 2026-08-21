**English** | [简体中文](./README.zh-CN.md)

# One Transfer: A Dual-Channel Data Transfer Scheme

> Transfer data with light.

<p>
  <img src="https://img.shields.io/badge/React-19-20232A?logo=react&logoColor=61DAFB" alt="React 19" />
  <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" alt="Vite 6" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwind-css&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/shadcn%2Fui-black?logo=shadcnui&logoColor=white" alt="shadcn/ui" />
  <img src="https://img.shields.io/badge/GSAP-3-0AE448?logo=greensock&logoColor=black" alt="GSAP 3" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" />
</p>

Repository: [github.com/zhihui-hu/one-transfer](https://github.com/zhihui-hu/one-transfer)

## ✨ Highlights

- **Optical transfer:** send files and text as LT fountain-coded animated QR frames without a connection between endpoints.
- **Files over text:** encode a file as a versioned `ONE_TRANSFER_V1` Base64 record and restore it on Windows.
- **Frame-loss tolerance:** recover from any sufficient set of distinct frames without per-frame retransmission.
- **Layered integrity:** validate container structure, lengths, FNV-1a, gzip bounds, and SHA-256.
- **Local processing:** business files never upload to the application server.
- **Offline operation:** PWA caching includes the SPA, worker, WASM decoder, and Windows restorer.
- **Modern UI:** React Router, Tailwind CSS, shadcn/ui, and reduced-motion-aware GSAP transitions.

## 🚀 Quick Start

```bash
git clone https://github.com/zhihui-hu/one-transfer.git
cd one-transfer
pnpm install
pnpm dev
```

Open `https://127.0.0.1:5173`. For a phone or another LAN device, run:

```bash
pnpm dev:lan
```

Production build and full project check:

```bash
pnpm build
pnpm check
```

### One-click Cloudflare Pages Deployment

[![Deploy with Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zhihui-hu/one-transfer)

If Cloudflare does not detect the project automatically, use:

| Setting | Value |
|---|---|
| Framework preset | `Vite` |
| Build command | `pnpm build` |
| Build output directory | `dist` |
| Node.js | `24` or newer |

---

## Abstract

One Transfer defines data representations for two asymmetric channel classes. A text-only channel
cannot carry file objects, so the system encodes file bytes, a UTF-8 filename, and type information as a
versioned Base64 record and restores it on Windows. A visible-screen channel has no reliable feedback
path, so the system packages files or text in an integrity-protected container, encodes it as an endless
LT fountain stream, renders animated QR codes, and recovers them through a camera or screen capture.

The implementation is a single-entry Vite SPA. File contents are processed locally in the browser and
are never uploaded to the application server. This document specifies the system model, protocols,
algorithms, security boundary, performance model, implementation, and validation strategy.

**Keywords:** text channel; Base64; animated QR; LT fountain code; optical channel; React; Vite

---

## 1. Channel Model and Design Goals

### 1.1 Channel Model

The scheme assumes two primitive channel classes:

1. A **text channel** can carry Unicode text but not a file object.
2. An **optical channel** lets one endpoint display pixels and another observe them, without reliable acknowledgements or retransmission.
3. The sender can read local files and the receiver can persist recovered bytes.

The central problem is independent of a specific business environment: define stable data framing,
loss recovery, integrity checks, and browser lifecycle for those channel capabilities.

### 1.2 Goals

- Convert a file into copyable text and restore its filename, type, and bytes.
- Convert a file or text snippet into an animated QR stream without a handshake.
- Keep all business data processing local to the participating browsers.
- Require no handshake or retransmission channel for optical transfer.
- Verify lengths, container structure, and content digests before exposing recovered data.
- Deploy as a static SPA on Cloudflare Pages, GitHub Pages, or another approved static host.

### 1.3 Example Applications

Any environment that exposes a text channel and a visible screen but makes direct file exchange
inconvenient can combine these transports. Examples include remote desktops, VDI sessions, temporary
isolated endpoints, cross-device offline transfer, and presentation systems. These are examples only;
they do not participate in the protocol definition.

### 1.4 Non-goals

- One Transfer does not provide encryption, sender authentication, authorization, or policy bypass.
- It cannot create a channel when both text clipboard and screen observation are disabled.
- It does not defeat clipboard capacity limits, endpoint auditing, or content inspection.
- It is not a replacement for an organization-approved high-bandwidth file exchange system.

---

## 2. System Model

### 2.1 Participants

| Participant | Location | Responsibility |
|---|---|---|
| Text sender | One endpoint | Select a file and copy its encoded text |
| Windows text receiver / optical sender | Intermediate endpoint | Restore the text payload; display a file or text as QR frames |
| Optical receiver | Another endpoint | Scan, decode, verify, and save or copy content |

The text sender and optical receiver may be the same device or separate devices.

### 2.2 Dual-channel Architecture

```mermaid
flowchart LR
  subgraph GROUP_A[Text sender]
    A[Source file]
  end

  subgraph GROUP_B[Windows receiver / optical sender]
    B[restore-base64.bat]
    F[File or text]
    S[One Transfer QR sender]
  end

  subgraph GROUP_C[Optical receiver]
    R[Browser receiver]
  end

  A -->|ONE_TRANSFER_V1 Base64 text| C[Plain-text clipboard]
  C --> B
  B -->|restore| F

  F --> S
  S -->|screen-to-camera light channel| R
  R -->|verify and save or copy| O[External file or text]
```

| Direction | Payload | Physical channel | Encoding | Receiver |
|---|---|---|---|---|
| Text sender → Windows receiver | File | Clipboard or another text channel | Base64 text protocol | Windows BAT + PowerShell |
| Optical sender → optical receiver | File | Screen → camera/capture | Container + LT code + QR | Browser + ZXing WASM |
| Optical sender → optical receiver | Text | Screen → camera/capture | UTF-8 container + LT code + QR | Browser display and copy |

Inbound ordinary text already fits the available clipboard and needs no additional encoding. The
clipboard file protocol exists specifically because the business object is binary while the permitted
channel is text-only.

---

## 3. SPA Design

### 3.1 Stack

- React 19, Vite 6, and TypeScript 5
- React Router 7 with a persistent `HashRouter` layout
- Tailwind CSS 4 and local shadcn/ui components
- GSAP 3 for loading, route, Tabs, and ambient breathing motion
- `qrcode` for QR generation
- `zxing-wasm` in Web Workers for QR decoding
- `vite-plugin-pwa` for offline precaching
- Web Crypto, Compression Streams, Media Capture, Canvas, and Clipboard APIs

### 3.2 Routes

The application has one HTML entry point:

| Route | Purpose |
|---|---|
| `#/` | Channel selection |
| `#/send` | Display an internal file or text snippet as animated QR frames |
| `#/receive` | Receive through screen capture or a camera |
| `#/clipboard` | Encode an inbound file as clipboard text and download the Windows restorer |

React Router's hash routing requires no server-side rewrite. The parent layout remains mounted while
each child route mounts exactly one page and its transfer controller. Leaving the send route stops QR
animation. Leaving the receive route closes camera or screen capture, terminates decoder workers, and
clears timers before the page unmounts.

The HTML entry contains only a critical inline boot screen. React keeps application content hidden until
the transfer controllers are mounted, then GSAP removes the loader and reveals the route. Route changes
use a GSAP timeline, the send-mode Tabs use a moving GSAP indicator, and a low-opacity ambient orb adds
breathing motion. All motion is disabled when `prefers-reduced-motion` is enabled.

### 3.3 Offline Operation

The production service worker precaches the SPA, JavaScript, CSS, ZXing WASM, decoder worker, and
`restore-base64.bat`. Once loaded, the application can continue operating without a network. A strictly
isolated deployment should be cached before entering the boundary or hosted on an approved internal
static service.

---

## 4. Inbound File Transfer over a Text Clipboard

### 4.1 Sender Processing

On `#/clipboard`, the external sender:

1. Validates that the selected filename can be created on Windows.
2. Reads bytes locally through `File.arrayBuffer()`.
3. Base64-encodes the UTF-8 filename and raw payload.
4. Constructs the `ONE_TRANSFER_V1` record and copies it without rendering the Base64 payload on page.
5. Uses a temporary text area with `execCommand` when the modern Clipboard API is unavailable.

For a file of `N` bytes, Base64 requires approximately:

```text
B = 4 × ceil(N / 3)
```

The resulting text is therefore about 1.33 times the original size before protocol and filename
overhead. The practical limit is determined by the browser and the capacity of the concrete text channel.

### 4.2 Clipboard Wire Format

The record is a single text line split into at most four fields:

```text
ONE_TRANSFER_V1|<itemType>|<base64(UTF-8 name)>|<base64(payload)>
```

| Field | Meaning |
|---|---|
| `ONE_TRANSFER_V1` | Protocol magic and version |
| `itemType` | `file` or `directory` |
| name | Base64-encoded UTF-8 basename |
| payload | Base64-encoded file bytes or directory ZIP |

The web UI handles one file per operation. On a Mac sender, a directory can be prepared with
`../deploy/add-transfer.sh <directory>`; the helper creates a ZIP and emits the same wire format.

### 4.3 Windows Restoration

The Windows receiver can download `restore-base64.bat` from `#/clipboard`, or copy the complete script
source displayed on the page and save it under that filename. Place it in the desired destination
directory. On each run, the script:

1. Checks for Windows PowerShell.
2. reads clipboard text using `Get-Clipboard -Raw`;
3. validates protocol magic, field count, item type, and filename;
4. decodes the Base64 filename and payload;
5. refuses to overwrite an existing target;
6. writes a file directly or expands a directory ZIP in randomized temporary paths;
7. prints an MD5 value, cleans temporary data, and pauses so the result remains visible.

Clipboard text is never evaluated as a command. The decoded filename is used only as a validated path
argument.

### 4.4 Inbound Sequence

```mermaid
sequenceDiagram
  participant E as External sender
  participant C as Text clipboard
  participant W as Windows receiver

  W->>W: Download restore-base64.bat once
  E->>E: Select and read a local file
  E->>E: Encode ONE_TRANSFER_V1 Base64 text
  E->>C: Copy plain text
  C->>W: Synchronize clipboard text
  W->>W: Run BAT, validate, and decode
  W->>W: Restore file and display MD5
```

---

## 5. Data-to-Light Optical Transfer

### 5.1 Unified File Container

Files and text snippets share one optical container. Text is UTF-8 encoded and identified with the
compatibility media type `application/vnd.decimen.snippet`; the receiver uses it to choose between a
download control and a copyable text result.

The fixed little-endian container header is 49 bytes:

| Offset | Length | Field | Description |
|---:|---:|---|---|
| 0 | 4 | Magic | ASCII `DCF2` |
| 4 | 1 | Compression | `0` none, `1` gzip |
| 5 | 2 | Name length | UTF-8 filename byte length |
| 7 | 2 | Type length | MIME type byte length |
| 9 | 4 | Original length | Original payload length |
| 13 | 4 | Transmitted length | Optical payload length |
| 17 | 32 | SHA-256 | Digest of original bytes |
| 49 | variable | Name + type + payload | Container body |

Files are limited to 64 MiB and text snippets to 4 MiB. Compressible data is tested with gzip, while
JPEG, video, ZIP, Office Open XML, and other precompressed types skip the extra allocation and CPU pass.
Gzip is selected only when it saves more than 64 bytes.

The receiver streams decompression and enforces the declared original length as a hard output ceiling;
it does not trust the gzip trailer as a safe allocation bound.

### 5.2 LT Fountain Coding

A screen-to-camera link has no practical retransmission channel. One Transfer uses an LT fountain code:

1. Split the container into `K` equal source blocks and zero-pad the final block.
2. Derive a degree `d` from each sequence number.
3. Select `d` distinct source blocks using a robust soliton distribution.
4. XOR those blocks into one encoded block.
5. Continue generating new sequence numbers indefinitely.
6. Recover source blocks with a peeling decoder after enough distinct frames arrive.

The robust-soliton parameters are `c = 0.1` and `δ = 0.5`. Sender and receiver must derive identical
block subsets for a given `sessionId + seq`. Because native `Math.log` may differ by one ULP across
JavaScript engines, the implementation uses a deterministic logarithm built from specified IEEE-754
operations and pins its output with golden-vector tests.

Dropped frames reduce throughput but do not invalidate the transfer. The receiver can join a stream
midway and does not need to tell the sender which frames were lost.

### 5.3 QR Frame Header

Each QR frame contains a 20-byte little-endian header followed by one encoded block:

| Offset | Type | Field | Description |
|---:|---|---|---|
| 0 | `u8` | Magic 0 | `0xD1` |
| 1 | `u8` | Magic 1 | `0x0C` |
| 2 | `u16` | Session ID | Random per sender start |
| 4 | `u32` | Sequence | Fountain subset input |
| 8 | `u16` | K | Source block count |
| 10 | `u16` | Block length | Encoded bytes per frame |
| 12 | `u32` | Total length | Full container size |
| 16 | `u32` | Payload FNV-1a | Fast recovered-container check |
| 20 | variable | Encoded block | Fountain XOR output |

The default high-throughput layout displays four independently decodable QR symbols per visual tick.
At 30 ticks per second and 1700 bytes per symbol, it emits 120 symbols per second; the 20-byte header
leaves a 1680-byte encoded block in every symbol. QR error-correction level L is used. A single shadcn/ui
speed slider combines the frame-size and tick-rate choices into Stable, Balanced, and Fast presets;
difficult displays or cameras should move it toward the minimum.

On the send page, One Transfer first inspects the capabilities the browser may expose: logical CPU
count, approximate device memory, measured animation refresh rate, and the shorter viewport edge. It
then applies the highest preset whose complete requirements are met:

| Preset | Local recommendation boundary | Raw model |
|---|---|---:|
| Stable | Constrained CPU, refresh rate, or viewport | about 135 KiB/s |
| Balanced | 4+ logical CPUs, about 45+ Hz, 540px+ short edge | about 197 KiB/s |
| Fast | 8+ logical CPUs, about 55+ Hz, 720px+ short edge | about 271 KiB/s |

Missing privacy-restricted values, such as `deviceMemory` in some browsers, do not automatically lower
the recommendation. The result and its evidence are shown under the slider. This inspection covers the
sending computer only; receiver camera quality, remote-desktop compression, and receiver CPU remain
unknown, so the user can always lower the preset manually.

### 5.4 Capture and Decode

The external receiver supports:

- `getDisplayMedia` for direct window or screen capture;
- `getUserMedia` for a phone or external camera;
- Canvas downsampling before decoding large desktop frames;
- a ZXing WASM worker pool that can return up to four symbols from one captured image;
- a fast ZXing path on ordinary frames, with expensive rotate, invert, downscale, denoise, and
  `tryHarder` searches enabled only as a sparse robust fallback after repeated misses;
- frame dropping when all workers are busy;
- generation counters that invalidate callbacks from stopped media streams.

After fountain recovery, the receiver checks FNV-1a, parses and bounds-checks the container, optionally
decompresses it, and verifies SHA-256. A download or copy control is shown only after all checks pass.

### 5.5 Outbound Sequence

```mermaid
sequenceDiagram
  participant W as Optical sender
  participant Q as Animated QR stream
  participant R as External receiver

  W->>W: Select an internal file or enter text
  W->>W: Pack, hash, optionally gzip, and LT-encode
  loop Continuous playback
    W->>Q: Render sessionId + seq + encoded block
    Q-->>R: Camera or screen capture
    R->>R: ZXing worker decoding and frame collection
  end
  R->>R: Peeling recovery
  R->>R: FNV, bounds, decompression, and SHA-256 checks
  R->>R: Save file or copy text
```

---

## 6. Text Transfer

Inbound ordinary text should use the existing plain-text clipboard directly. Outbound text is entered
on `#/send`, encoded as UTF-8 in the same container and fountain stream, and reconstructed by the same
receiver. The text limit is 4 MiB. Recovered text is held only in the page and is not persisted.

---

## 7. Integrity and Security Boundary

### 7.1 Integrity Layers

| Layer | Mechanism | Purpose |
|---|---|---|
| QR | QR error correction | Local visual damage within one frame |
| Optical stream | LT fountain code | Frame loss, duplication, and reordering |
| Recovered container | FNV-1a | Fast accidental-corruption check |
| Original content | SHA-256 | Final content verification |
| Clipboard restore | Base64 decode + displayed MD5 | Truncation detection and manual comparison |

FNV-1a and MD5 are error-detection aids, not authentication. SHA-256 confirms content equality, but the
digest and payload arrive through the same unauthenticated channel.

### 7.2 Defensive Measures

- Basename-only filenames with control-character and Windows reserved-name rejection.
- No overwrite of an existing Windows target.
- Random temporary paths and cleanup for directory restoration.
- Hard gzip decompression output ceiling.
- Completed optical sessions are ignored until a new stream identity appears.
- Camera, capture, workers, and timers stop when the SPA receive route is left.
- Loading text uses a reduced-motion-aware sweep-shine fallback.

### 7.3 Explicit Risks

- Base64 clipboard data and QR frames contain the original information and are not confidential.
- Anyone able to write the clipboard or place a QR stream in view can provide input.
- The runtime environment, endpoint software, or operating system may audit clipboard and screen activity.
- Any camera able to see the sender screen can potentially receive the optical stream.
- Clipboard size limits can truncate large Base64 records.

For sensitive material, encrypt the file with an organization-approved tool before transferring it.

---

## 8. Performance Model

### 8.1 Clipboard Channel

Base64 adds approximately 33% size overhead. Transfer time is dominated by the remote clipboard
implementation. Both endpoints must hold the original bytes, encoded text, and decoded result, so the
practical limit is lower than the browser's theoretical memory ceiling.

### 8.2 Optical Channel

The sender displays four QR symbols at every 30 Hz visual tick. One captured image may therefore yield
up to four independent fountain symbols:

```text
symbolsPerSecond = symbolsPerTick × ticksPerSecond
rawKiB/s = symbolsPerSecond × (frameBytes - headerBytes) / 1024
netKiB/s ≈ rawKiB/s × decodeSuccessRate / fountainOverhead
```

The default values are `4 × 30 = 120` symbols/s and `blockLength = 1700 - 20 = 1680` bytes, for a
raw payload ceiling of `196.875 KiB/s`. This is a model, not a benchmark. For example:

| Decoded unique symbols | Fountain overhead | Estimated net goodput |
|---:|---:|---:|
| 100% | 1.15× | 171.2 KiB/s |
| 75% | 1.20× | 123.0 KiB/s |
| 50% | 1.30× | 75.7 KiB/s |

Real throughput depends on display refresh, tearing, exposure, autofocus, distance, ambient light,
moiré patterns, video compression, decoder speed, and fountain redundancy. The fast ZXing path avoids
paying for difficult-image searches on every frame; a robust pass is attempted only after repeated fast
misses. A denser QR frame is not always faster, and reducing density or tick rate can raise end-to-end
goodput when recognition is unstable.

The optical link is intentionally one-way, so the sender cannot perform feedback-based FPS adaptation.
If a remote desktop or capture stream delivers fewer than 30 visual frames per second, the receiver sees
missing or repeated symbols: completion takes longer, but LT recovery and the final checksum prevent a
damaged file from being accepted. The receiver starts 2–4 decode workers from the available logical CPU
count and can grow the pool when workers remain saturated. For a persistently weak image, moving the
single speed slider to its minimum selects the 1465-byte / 24-tick Stable preset.

The current wire protocol still uses the existing LT fountain code. RaptorQ is a future option for
lower and more predictable recovery overhead, but adopting it requires a versioned protocol change and
is not part of the present four-QR throughput update.

The sender progress bar measures one recommended broadcast round: emitted symbols divided by the LT
target derived from `K` and the expected fountain overhead. It repeats because the one-way sender cannot
know when the receiver has finished. The receiver progress bar is the authoritative recovery progress;
it combines unique frame count, expected overhead, and solved blocks, and never reports 100% before
final verification.

---

## 9. Repository Structure

```text
one-transfer/
├── index.html                 # Minimal Vite entry and critical boot screen
├── src/
│   ├── main.tsx               # React root and HashRouter
│   ├── app.tsx                # Persistent routes, views, loading, and GSAP
│   ├── styles.css             # Tailwind entry and dynamic controller styles
│   ├── components/            # Build info, update checker, and local shadcn/ui
│   ├── lib/device-capabilities.ts # Browser capability inspection
│   └── lib/utils.ts           # shadcn/ui class merging helper
├── send/main.ts               # Container creation, LT encoding, QR playback
├── receive/
│   ├── main.ts                # Capture, progress, recovery, result UI
│   ├── worker.ts              # ZXing WASM decode worker
│   ├── worker-factory.ts      # Worker construction
│   └── wasm-url.ts            # Decoder WASM asset URL
├── clipboard/main.ts          # Browser file-to-text clipboard sender
├── shared/                    # Protocols, fountain code, validation, utilities
├── public/                    # Windows receiver and update-check Worker
├── .github/workflows/         # GitHub Pages and Cloudflare Pages deployment
├── tests/                     # Golden vectors and unit tests
├── vite.config.ts             # SPA, HTTPS development, and PWA configuration
└── wrangler.toml              # Cloudflare Pages configuration
```

`../deploy/add-transfer.sh` is a workspace-level Mac helper and is not part of the SPA build. It shares
the `ONE_TRANSFER_V1` protocol with the browser implementation.

---

## 10. Development and Deployment

### 10.1 Requirements

- Node.js 24+
- pnpm 10
- A modern browser with WebAssembly, Media Capture, and Web Worker support
- Windows PowerShell with `Get-Clipboard` on the inbound receiver

### 10.2 Commands

```bash
pnpm install
pnpm dev          # localhost only; prints one address
pnpm dev:lan      # all interfaces; use for phones and LAN receivers
pnpm test         # protocol, fountain, progress, and clipboard tests
pnpm build        # type-check and build SPA/PWA into dist/
pnpm preview      # localhost production preview
pnpm preview:lan  # LAN production preview
pnpm check        # tests followed by production build
```

`pnpm dev` binds to `127.0.0.1`. `pnpm dev:lan` intentionally lists every active Wi-Fi, VPN, virtual
machine, and tunnel address; they all point to the same Vite process. LAN camera use requires HTTPS.
The development certificate is self-signed and must be explicitly accepted on each test device.

### 10.3 Cloudflare Pages

The `deploy-wrangler.yml` GitHub workflow tests and builds every pull request. A push to `main` or a
manual dispatch deploys `dist/` with Wrangler. Configure these repository secrets:

- `CLOUDFLARE_API_TOKEN`, limited to Cloudflare Pages edit access;
- `CLOUDFLARE_ACCOUNT_ID`.

Local deployment remains available:

```bash
make deploy
```

The Makefile loads local Cloudflare credentials from `.env`, builds `dist/`, and deploys the Wrangler
project `one-transfer`.

### 10.4 GitHub Pages Automation

The independent `pages.yml` workflow tests, builds, uploads the Pages artifact, and deploys it through
GitHub Actions on a push to `main` or a manual dispatch. In repository **Settings → Pages**, keep
**Source** set to **GitHub Actions**.

### 10.5 Build Version and Update Checks

Vite embeds the package version, build time, and Git commit in the application and emits the same data
as `dist/version.json`. `BuildInfo` prints the values once in the developer console, while the footer
shows the version and short commit. A small same-origin Worker checks `version.json` on startup, when
the tab becomes visible, and every five minutes. A changed version or commit displays an explicit update
notice; the existing PWA service worker still owns cache replacement and controller activation.

---

## 11. Validation

Automated coverage includes:

- clipboard fields, Unicode names, empty files, and Windows filename rules;
- optical containers, gzip decisions, SHA-256, malformed data, and decompression bounds;
- golden vectors for the 20-byte QR header;
- deterministic log, robust soliton distribution, and block-index generation;
- LT recovery with out-of-order, duplicate, and 30% dropped frames;
- frame capacity, display sizing, progress estimates, no-signal behavior, and worker lifecycle;
- automatic device recommendations for constrained, balanced, and capable senders;
- four-symbol throughput calculations, batched worker results, and decoder performance counters;
- complete file and UTF-8 text round trips.

A production check must also confirm that `dist/` contains one `index.html`, `version.json` matches the
embedded build version, the service worker caches the Workers/WASM/Windows script, and the public BAT
matches the workspace deployment copy. A real Windows clipboard import and a real optical export remain
runtime checks that static builds cannot replace.

---

## 12. Limitations and Future Work

- Add clipboard chunking, sequence numbers, and per-segment checksums.
- Add an optional approved encryption and sender-authentication layer.
- Provide a signed PowerShell or executable Windows receiver.
- Add measured device presets and optional sender/receiver feedback when a return channel is available.
- Build a performance matrix across text channels, browsers, cameras, and displays.
- Add browser-side directory packaging.

---

## 13. Conclusion

One Transfer combines two permitted but asymmetric channels into a complete restricted-desktop data
flow. External files enter as Base64 text through a clipboard; internal files and text leave as animated
fountain-coded QR frames. The text channel solves the text-only inbound constraint, while fountain
coding makes a lossy, one-way optical channel practical.

The system provides local processing, frame-loss tolerance, and content-integrity checks. It does not
provide confidentiality or identity. It should be used only where the organization explicitly permits
the underlying text clipboard and visible-screen channels.

---

## References

1. M. Luby, “LT Codes,” *Proceedings of the 43rd Annual IEEE Symposium on Foundations of Computer Science*, 2002.
2. ISO/IEC 18004, *Information technology — Automatic identification and data capture techniques — QR Code bar code symbology specification*.
3. NIST FIPS PUB 180-4, *Secure Hash Standard (SHS)*.
4. P. Deutsch, RFC 1952, *GZIP File Format Specification version 4.3*, 1996.
5. W3C, *Media Capture and Streams* and *Screen Capture* specifications.
6. `zxing-wasm`, [Reader API and decoding options](https://github.com/Sec-ant/zxing-wasm#reader-api).
7. `zxing-cpp`, [WebAssembly performance notes](https://github.com/zxing-cpp/zxing-cpp/tree/master/wrappers/wasm).
8. `RaptorQR`, [multi-QR optical-transfer implementation and benchmarks](https://github.com/infrost/RaptorQR).

## License

This project is released under the [MIT License](./LICENSE). Issues and pull requests are welcome at
[github.com/zhihui-hu/one-transfer](https://github.com/zhihui-hu/one-transfer).

The optical protocol and fountain-code implementation evolved from BashAlarmist's Decimen Optical
Transfer. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE) for attribution and contributor notices.

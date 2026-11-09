# Personal report redesign — 2026-11-06

Published URL: https://120.27.208.216/report.html

The standalone report now follows seven sections: role and AI product practice; project management; department AI development workflow; bridge/drone image applications; agent delivery and knowledge engineering; Haoyi practice; certifications and collaboration resources. Both agent systems show the confirmed delivery-lead responsibility. No project-status labels, personal name in HTML text/metadata, or previous slogans remain. Names inside original evidence images are intentionally preserved as authorized.

Source: `scripts/build-report.mjs`, `scripts/report/`, and `docs/report-assets/2026-11-06/`. The asset `sources.json` records the real capture origins. Generate using `node scripts/build-report.mjs`; the generator requires Python/Pillow/fontTools and the configured OFL Noto Sans SC font. Original images are retained. PNGs embedded as WebP use lossless encoding.

## Validation

- JavaScript syntax and static HTML reviewed; seven sections, two delivery-lead labels, unique IDs, valid internal anchors, no unresolved placeholders or external image dependencies.
- Fourteen embedded images checked for format and intrinsic dimensions; five PNG-to-WebP conversions verified pixel-identical to originals.
- Browser layouts inspected at 390, 768, 1440 and default 1920 px widths; no whole-page horizontal overflow. Mobile navigation scrollbar removed without removing keyboard access.
- Lightbox opening, original-size zoom/panning, source link, close button, Escape and focus restoration exercised. Browser error log empty.
- Intrinsic image dimensions added to prevent lazy-loading layout shifts. Reduced-motion and forced-colors styles reviewed statically.
- Visual records: `.runtime/report-redesign-20261106/desktop.jpg` and `mobile.jpg`.

## Release

Only `/data/docker/nginx/html/haoyi/report.html` was replaced atomically through the existing pinned SSH connection. No service restart, business API, database or CRM deployment change.

- New SHA256: `706619a4f9769a0cc8608f06ade7083d1c03ff7a873f77b3f96d63854f15091d`
- Bytes: 8,936,318
- Live HTTP 200; downloaded response hash exactly matches the validated local report.
- Previous SHA256: `0814d9e512ec315ba84ee359818e99293ff2bb26fff2fc858e56b3f683d0ba93`
- Backup: `/opt/haoyi-workspace/shared/report-redesign-20261106-706619a4/report.before.html`
- Remote file mode and owner preserved: `0644`, `0:0`.

Rollback is a single-file atomic replacement from the backup after verifying its hash. Screenshot figures are interface content, not personal outcome metrics; drone regional examples are company cases; prototype evidence is simulator-based, with its validation limits retained in the page.

## Copyediting follow-up — 2026-11-06

Removed the Macau drone image from the media map, report body and lightbox. The Jiangsu Ninghu image now uses a centered single-image layout. Reviewed all prose and rewrote incomplete subjects, awkward collocations and generic phrasing, including the management introduction highlighted by the user. Project responsibilities and evidence boundaries remain unchanged.

Validation: JavaScript syntax, 13 embedded images, no Macau reference or prohibited name/status text, valid anchors and image dimensions. Checked mobile management text at 390 px and desktop drone layout at 1440 px; no page overflow; remaining drone image opens and closes correctly. Copy review completed independently. Screenshot evidence is in `.runtime/report-copyedit-20261106/`.

Published only the report file. Live HTTP 200 and response hash match the local artifact:

- Current SHA256: `9724dab9317a6806b543526b6b00d27c48d1678a2bffb8b868f8fed80f2c9241`
- Bytes: 8,411,285
- Backup of preceding version: `/opt/haoyi-workspace/shared/report-copyedit-20261106-9724dab9/report.before.html`

## Capability content and presentation mode — 2026-11-06

The report now opens with the confirmed short role summary and direct capabilities. Seven chapters cover personal capabilities, image AI, agent delivery and knowledge engineering, the edge-computing device, development management, government/client projects, and credentials/resources. Hardware duties and the three government-platform on-site assignments use the user's confirmed scope. Salt-city guidance includes business training, platform use, data quality and credit-evaluation remediation. The existing bilingual interface-writing rule in AGENTS.md was retained without duplication.

Real screenshots are grouped into two selectable galleries, with original-image zoom and provenance. All thirteen original assets remain; the Macau image is excluded. The hardware visual is explicitly a schematic. No personal name in webpage text/metadata, project-status tags, invented metrics, or new business APIs were added.

Reading mode has viewport-triggered reveals. The optional presentation mode uses seven scenes with three builds each, staggered items, image reveals, connector animations and page transitions. It supports reverse navigation, keyboard controls, optional fullscreen, scroll-position restoration and modal-first Escape handling. Reduced motion cancels Web Animations; no-JavaScript and print views retain complete content.

### Validation

- Generator and client syntax passed. Generated HTML has seven scenes, twenty-one builds, thirteen valid embedded originals, unique IDs, valid anchors/ARIA controls and resolved font placeholders.
- Browser plugin connection did not dispatch; used the existing Playwright installation with local Microsoft Edge headless. No browser dependency was installed.
- Reading and presentation layouts checked at 1440×900, 390×844, 768×1024, 1440×540 and 720×450 (equivalent layout area for 200% desktop zoom). No horizontal overflow or toolbar obstruction. All seven desktop scenes fit the 1440×900 presentation viewport without internal scrolling.
- All twenty-one steps, reverse navigation, final-step stopping, nine gallery selections, original-image zoom/source/focus, Escape ordering, fullscreen and reading-position restoration passed. Print expansion/restoration, reduced-motion changes, forced-colors and no-JavaScript reading passed. No application console/runtime errors.
- The scroll-position test uses a physical click on the visible sticky-header button: Playwright locator auto-scroll changes the starting position before pointerdown, which is a test-harness effect. Actual start/exit restored 555 px to 555 px.
- Public bridge-product and patent sources returned HTTP 200. The two Dongqu system roots and product catalog also returned HTTP 200; the local test context allowed their certificate chain because the command-line trust environment could not validate it. This is reachability verification, not certificate validation or a full system functional test.
- Browser QA scripts, screenshots and results are in `C:/Users/Administrator/.codex/visualizations/2026/11/06/01a1aed7-24f7-7290-986c-a62392ebda05/report-qa/`. No physical phone or Safari/Firefox validation was performed.

### Release

Only the report was replaced, using the same pinned SSH connection, old/new hash guards, verified backup, preserved ownership/mode and atomic replacement. No service restart or other application release.

- Current SHA256: `acebb789a66a57bb1f7228b0bb6426278abc559a521eff062010d24d539382fe`
- Bytes: 8,456,280
- Previous SHA256: `9724dab9317a6806b543526b6b00d27c48d1678a2bffb8b868f8fed80f2c9241`
- Backup: `/opt/haoyi-workspace/shared/report-motion-20261106-acebb789/report.before.html`
- Published response: HTTP 200, exact SHA256 match to the validated local artifact.
- Remote mode/owner: `0644`, `0:0`.
- Post-release browser smoke check passed at the public URL: desktop and mobile render, presentation entry/advance/exit, no runtime errors. Evidence: `live.json`, `live-desktop.png`, `live-mobile.png` in the QA folder above.

## Experience, evidence and future roles — 2026-11-06

Reorganized the narrative into eight scenes. The first six cover capabilities and actual work: overview, image AI, agents/knowledge engineering, hardware collaboration, development management, and government/client delivery. The seventh consolidates what these capabilities could contribute to Haoyi, alongside the existing vehicle prototype and CRM practice. The final scene presents the two approved macro directions: AI software/team management as the main entry point and gradual participation in regional management. It does not prescribe an initial product or implementation timetable.

Evidence is now adjacent to the relevant experience: both patents accompany knowledge engineering, certification information accompanies development management, and PMP plus the original thank-you letter accompany project/client work. The letter remains explicitly associated with Credit Yancheng. The separate closing resources chapter and repeated prospective Haoyi statements in experience sections were removed. Two user-provided certification listing screenshots were copied byte-for-byte into the asset collection; they are described as certification information, not original certificates. All fifteen originals are embedded once, with sources and prototype limitations retained.

Validation used the existing local Edge/Playwright fallback. Eight scenes and twenty-four builds, three galleries/nine selectors, inline evidence association, modal zoom/source/focus/Escape, forward/reverse navigation, reading-position restoration, print expansion/restoration, reduced motion, forced colors and no-JavaScript reading passed. All eight scenes fit 1440×900 without internal scrolling. Responsive checks at 390×844, 768×1024, 1440×540 and 720×450 found no horizontal overflow or toolbar overlap. Final motion selectors were checked against the final artifact hash; moved patents, qualifications and certifications settle fully visible. No application runtime errors.

Evidence and scripts: `C:/Users/Administrator/.codex/visualizations/2026/11/06/01a1aed7-24f7-7290-986c-a62392ebda05/report-narrative-qa/`. `results.json` contains the full layout/interaction checks; `final-motion.json` verifies the final artifact. Physical-device and non-Chromium browser checks were not performed.

Report-only release retained the pinned SSH connection, verified old-file backup, preserved ownership/mode and atomic replacement. No service restart or business API changes.

- Current SHA256: `ecfa8e5b7cd2349e8331280f4f995bd6a0203fa19b4d4076c4c36085417ecff2`
- Bytes: 8,471,317
- Previous SHA256: `acebb789a66a57bb1f7228b0bb6426278abc559a521eff062010d24d539382fe`
- Backup: `/opt/haoyi-workspace/shared/report-narrative-20261106-ecfa8e5b/report.before.html`
- Live HTTP 200 and response SHA256 exactly match the validated artifact; mode/owner remain `0644`, `0:0`.

## Consistent report wording — 2026-11-06

Revised the copy throughout the eight chapters to use natural, concise professional Chinese. Replaced awkward expressions such as “客户交付”, “组织识别结果”, “已有界面实践” and “主要切入点”; clarified system capabilities separately from personal responsibilities. Actual work uses precise participation/ownership language, while proposed Haoyi work and regional-management interests remain prospective. Partial embedded-development scope, government on-site/travel duties and simulator limitations are retained. Original document titles and images were not edited.

Independent editorial review passed. DOM comparison confirms identical tags and attributes before/after: only text changed. All eight 1440×900 presentation scenes still fit without internal scrolling; all chapters were checked at 390×844 without horizontal overflow. Twenty-four builds and fifteen images remain. No application runtime errors. The source client, CSS and behavior were not changed in this copyediting release.

Evidence: `C:/Users/Administrator/.codex/visualizations/2026/11/06/01a1aed7-24f7-7290-986c-a62392ebda05/report-voice-qa/`. The existing Edge/Playwright fallback was used for rendered checks. No physical-device or non-Chromium checks were added for this text-only change.

Only the report was published through the existing backup/hash/atomic replacement workflow:

- SHA256: `7b95fcd2892e032f3585fe64d034c269114abf826b17afe986ecd1e669e5d517`
- Bytes: 8,467,629
- Previous SHA256: `ecfa8e5b7cd2349e8331280f4f995bd6a0203fa19b4d4076c4c36085417ecff2`
- Backup: `/opt/haoyi-workspace/shared/report-voice-20261106-7b95fcd2/report.before.html`
- Live HTTP 200 and exact response hash match; mode/owner preserved as `0644`, `0:0`.

# ZAWANA — Beyond the Game

## Scope and integration

The landing route keeps the existing React, TypeScript, Vite, Three.js, React Three Fiber, Drei, and Motion stack. No dependencies were added. The backend, database schemas, authentication, payment flow, booking components, API client, and route definitions were not changed by this redesign. Earlier achievement/coaching work in the checkout is retained.

The original `public/logo.png` is displayed unchanged. Existing facility photographs remain in the real-world arena and service sections; the hero uses only the graphical court. The 3D environment is labeled **Arena visual concept**: it is one conceptual badminton court, not a model of ZAWANA's actual building, court count, or floor plan. The service section uses the existing badminton, gym, Revive, cafe, store, studio, and contact routes. Store equipment is an SVG illustration rather than a fabricated store photograph.

## Structure

- `src/components/cinematic/CinematicHero.tsx`: sticky story, chapter navigation, visibility, renderer status and retry controls.
- `choreography.ts`: typed chapter timings, camera positions/targets, field of view, and shuttle flight keyframes.
- `CameraRig.tsx`: reversible Catmull-Rom camera path, pointer damping, dedicated portrait framing, and overhead settling.
- `ArenaEnvironment.tsx`: conceptual structural instances, a regulation-proportioned court, net, floor material grain, and roof reveal.
- `SceneLighting.tsx`: fog, stadium fixtures, light reveal, emerald fill, and a single desktop shadow light.
- `ShuttlecockModel.tsx`: scroll-driven model, scale/orientation, short spatial speed trace, and disposal of owned GPU resources.
- `SceneCanvas.tsx`: lazy renderer, demand frames, frame-budget adaptation, context loss handling, and canvas lifecycle.
- `SceneTypography.tsx`: masked chapter headlines, service links, and the booking handoff.
- `ArenaStory.tsx` / `ServiceDestinations.tsx`: actual facility presentation, keyboard-accessible service tabs, existing route links.
- `src/hooks/useScrollProgress.ts`: one passive, frame-coalesced scroll subscription; no wheel interception or scroll smoothing package.
- `src/hooks/useDevicePerformance.ts`: WebGL2 capability, reduced motion, save-data, conservative hardware gating, and mobile preference updates.

Camera, shuttle, lighting, and architectural reveal all sample the same normalized scroll value. No elapsed-time object rotation or autonomous particle loop substitutes for the scroll choreography. Motion handles short DOM reveals. React state changes only at chapter crossings; the progress meter and renderer consume the continuous value directly.

## Assets and rendering budget

`public/models/shuttlecock.glb` is an original procedural, 16-feather model generated with `node scripts/build-shuttlecock.mjs`. It is approximately 233 KiB and merges geometry by material into four draw calls. There is no third-party model or model branding. The floor normal texture is generated deterministically in memory, without a photographic texture download.

The conceptual court uses 6.10 × 13.40 m doubles proportions, 5.18 m singles width, 40 mm painted lines, and a 1.55 m post height. Reference: [BWF Laws of Badminton, Section 4.1, court diagram and equipment](https://system.bwfbadminton.com/documents/folder_1_81/Statutes/CHAPTER-4---RULES-OF-THE-GAME/SECTION%204.1-%20Laws%20of%20Badminton.pdf). These dimensions describe the visual concept rather than a survey of the real facility.

The self-hosted Anton headline font comes from Google Fonts; the original SIL Open Font License and attribution are retained in `public/fonts/Anton-OFL.txt`. The font is separate from the original ZAWANA wordmark. Font source: [Google Fonts Anton](https://github.com/google/fonts/tree/main/ofl/anton).

Desktop DPR is capped at 1.5; mobile DPR at 1.1. Mobile disables shadow maps, antialiasing, the extra spotlight, and the shuttle trace, and uses a simpler net. Sustained slow consecutive demand frames lower DPR once. Frames stop at rest, outside the journey, and when the document is hidden. Model clones, generated buffers/textures, observers, listeners, scheduled scroll frames, and the R3F root are cleaned up on unmount. There is no post-processing chain or external environment-map dependency.

The desktop scroll track is 560svh; mobile is 430svh. Native scrolling and direct chapter navigation drive the same camera, shuttlecock, roof reveal, lighting and typography timeline. All supported devices render the cinematic experience, including reduced-motion, data-saving and short-window configurations, as explicitly requested. Device capability affects resolution, shadows and geometry quality, never the choice of presentation. The dark stage remains while assets load; no hero photograph or still-mode control is present. A failed renderer switches to the premium photographic hero, with working navigation and booking links plus an optional Explore in 3D retry.

Headlines and chapter spacing adapt to viewport width and height so CTAs clear both the fixed header and chapter controls. Landscape has a compact header with a visible booking link. The mobile menu keeps its close control visible while scrolling, and the service selector keeps the selected tab in view across resizing and orientation changes. The arena and service sections retain the original charcoal, cream, and yellow/gold theme.

Vite's existing custom Three/R3F chunk groups previously captured shared React dependencies recursively. `includeDependenciesRecursively: false` keeps shared UI outside the lazy renderer graph: the built HTML no longer preloads Three, and the renderer stays lazy-loaded behind the public UI. Mobile service tabs use a horizontal strip with a matching ARIA orientation so the selected image stays close to the controls.

## Booking and data

Every court CTA navigates to the existing `/book/court` workflow. The landing page does not display court inventory, floor selections, prices, or live availability. The booking calendar remains responsible for authenticated availability and reservations. Existing community and membership components retain their own API behavior.

## Validation

```sh
npm run lint:cinematic
npm run lint:gym
npm run build
npm run test:cinematic:browser
npm run test:responsive:browser
```

The browser script defaults to the built Vite preview and needs local Chrome or Playwright Chromium. Set `CINEMATIC_BROWSER_EXECUTABLE_PATH` to choose a browser; `CINEMATIC_QA_URL` can target an existing dev server; `CINEMATIC_QA_ARTIFACT_DIR` selects an artifacts directory.

It captures desktop (1440 × 1000), tablet (820 × 1180), mobile (390 × 844), and narrow mobile (320 × 640) views, including 0%, 20%, 30% shuttle close-up, 40%, 65%, 85%, 100%, and reverse scrolling. It checks exact chapter boundaries, original logo loading, GLB loading, layout width, idle/offscreen rendering, keyboard service tabs, the anonymous booking login guard, navigation to Achievements and back, no-WebGL/reduced-motion/save-data experiences, and deliberate context loss.

The responsive browser script checks 21 viewports from 320 × 568 to 1920 × 1080, including tablet and landscape sizes. It verifies every chapter clears the header and controls, headlines and links fit, service photos load, the selected tab remains visible, mobile menu controls stay accessible, and the gold theme is retained. It also rotates between portrait, landscape, tablet, and small-phone layouts. It uses a browser-only community story fixture to exercise long titles. Set `RESPONSIVE_QA_URL` for an existing server or `RESPONSIVE_BROWSER_EXECUTABLE_PATH` to choose Chrome; otherwise it starts an isolated built preview and prints its screenshot/report directory.

The cinematic suite uses empty public API fixtures; the responsive suite injects one browser-only community story. Neither script performs a backend write, database migration, reservation, authentication exchange, or payment write. Screenshots and `report.json` are written to the printed artifacts directory. Representative screenshots are in `docs/previews/cinematic/`.

Validation is desktop Chrome automation, including software WebGL; it is not a physical Android/iOS FPS or Core Web Vitals certification. The existing application entry chunk still triggers Vite's over-500-KB advisory. The scene and GLB are lazy; backend/payment behavior is outside this visual test's scope. Development builds also retain pre-existing LocalizedTree React key warnings and the R3F/Three Clock deprecation warning; production checks require no uncaught page errors.

The existing `npm run test:content:browser` regression also passed after the redesign, including achievement publishing, article reading, coach filtering, and mobile navigation back to the landing page. It uses its own isolated temporary SQLite database rather than the application's configured database.


## Premium fallback (current behavior)

The cinematic scene remains the default. When WebGL initialization fails, or context is lost, `PremiumFallback.tsx` replaces the tall pinned track with a lightweight editorial hero. It uses existing court photography, athletic type, gold booking CTA, service-section navigation and an optional Explore in 3D retry. It does not list technical errors in the hero. Low-power hardware alone does not select the fallback. Reduced-motion settings disable incidental motion; the photo hero itself uses no animation. This supersedes the earlier cinematic-only failure behavior described above.

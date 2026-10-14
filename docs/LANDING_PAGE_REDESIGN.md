# ZAWANA - The Art of Performance

Branch: `codex/new-landing-page-ui`. Scope: the public website, a Three.js hero, and the shared UI across all areas of this ZAWANA web app. The user explicitly expanded the original landing-page request to all web-app areas; the sibling mobile app is outside this implementation.

## 1. Codebase audit

- React 19, TypeScript, Vite, Tailwind, React Router, and Framer Motion are already installed. No runtime dependency added.
- The previous Home component combines public navigation, six facility cards, static membership prices, CMS updates, and a lazy React Three Fiber hero. It also imports unused dashboard data and charts. Replace its composition, keep shared operational components intact.
- `App.tsx` owns lazy routes, role checks, and all operational dashboards. `AuthContext` handles Firebase/database authentication, verification, MFA, profile completion, and role routing. `AppContext` and `OperationsContext` own business state. These files and their API contracts remain unchanged.
- `/book/court`, `/private-course`, `/classes`, `/training`, `/revive`, `/membership`, `/community`, and `/cafe-order` are existing guarded member routes. Links retain those destinations and existing login/role behavior. `/contact` is an existing public placeholder, not a working scheduling service.
- `/content` is the public CMS endpoint. The running backend (`server.ts`) filters publication state/date. The homepage keeps focus/visibility refresh, filters published items defensively, displays CMS copy/images/registration links, and handles empty/error states.
- Actual prices are in authenticated badminton packages, not the three static plans formerly displayed on Home. Read `/packages/badminton` only for member accounts. Gym packages in the running backend are staff-only; do not expose them or invent a public price list. Existing purchase/payment screens remain authoritative.
- Reuse `OptimizedImage`, approved partner logos/links, the official digital logo, and local photography for court, gym, studio, Revive, cafe, and Cut Lab.
- Original studio photography is 11,196 x 8,000 (almost 90 MP). Other photos are also larger than necessary. Add derived 640/1280/1920-wide WebP variants without changing originals. Never upscale the gym photo.
- At the user's follow-up request, retain Three.js in the hero and redesign the scene extensively: a sculpted feather shuttlecock, gold racket, and architectural court platform, on a charcoal stage. The scene loads through an isolated lazy import, using existing React Three Fiber/Three.js dependencies. Remove the unused Drei Float import. No hero photograph, even in its fallback. Existing photographic facility storytelling remains below the hero.
- Brand guideline discovered at `C:/Users/HP/Documents/zawana-mobile-app/assets/Brand Guideline Arena.pdf` (10 pages), visually reviewed pages 3-6. The user-suggested `zawana-web-app/assets` directory is absent in this checkout.
- The guide specifies the squared digital logo; use `/brand/zawana-logo-square.png` unchanged, including its wordmark, color treatment, and proportions. No CSS recoloring or synthetic replacement wordmark. Digital gold is **#C4AF49**, with purple **#161442** and white. This differs from the previous global gold token (#C6A34A); use the guideline gold in scoped public and workspace design tokens. The shared Logo now displays the original asset with a supporting performance tagline instead of a synthetic text wordmark.
- Gotham is specified as primary type. No licensed Gotham font files were found. Use a Gotham-first local stack with existing/system sans fallbacks. Do not download an unlicensed font. A supplied licensed webfont would allow exact typography. Do not use brown/red/clay typography.
- Contact information was absent from public source code, but further visual inspection of guideline pages 7-8 provides the company address, public email `zawana4994@gmail.com`, and phone `+95 9 447 974 995`. Reuse these in the footer. The address and phone are corroborated by [the arena's public directory listing](https://www.localgymsandfitness.com/MM/Thingangyun/103013559107437/The-Zawana---Badminton-School-And-Sport-Arena), which also identifies Facebook page `103013559107437`. Its Facebook URL is included; direct Facebook content was access-blocked during verification. Do not invent other social profiles. A full Baseline reference was not attached, so this follows the supplied interaction description with original ZAWANA composition.

## 2. Design-system specification

| Element | Specification |
| --- | --- |
| Scope | `.zawana-public`, `.zawana-workspace`, `.workspace-page`, `.zawana-auth`; no global root font-size scaling |
| Colors | Charcoal #161819, guideline gold #C4AF49, warm paper #F3F1EA; purple #161442 for selected supporting accents |
| Typography | Gotham-first local stack, system fallback; bold uppercase display, calm sentence-case body |
| Display | Fluid 42-120px, tight tracking, approximately 1.0 line height; natural text wrapping on mobile |
| Body | 13-15px with 1.8-1.9 line height; lead copy 23-35px |
| Container | Maximum 1600px, fluid 20-80px outer gutters |
| Rhythm | 72-160px section spacing; 28px grid gaps; restrained 1px borders |
| Images | Large architectural compositions, natural colors, subtle dark overlays, square corners |
| Controls | 44px minimum touch/focus targets; rectangular 52-54px primary links with directional icons |
| Navigation | Absolute transparent desktop header; native full-screen modal below 1100px |

## 3. Section-by-section implementation plan

1. **Intro:** render content immediately behind a short logo/progress curtain; show once per session, skip reduced motion.
2. **Hero:** lazy Three.js court/racket/shuttlecock composition with soft lighting, pointer tilt, slow floating motion, bounded device pixel ratio, and static architectural fallback. Keep the specified headline/supporting copy, ecosystem anchor, existing booking route, and service-linked information element. Mobile separates copy and the scene vertically.
3. **Philosophy:** warm paper, oversized editorial introduction, existing brand belief and Myanmar mission, wide architectural image reveal.
4. **Ecosystem:** six verified facilities in a staggered 7/5-column grid; each image and CTA links to an existing service destination. Cut Lab uses contact until a dedicated route exists.
5. **Badminton:** split photographic scene and court-line motif; booking, coaching, group training, and development information; direct booking/coaching links.
6. **Performance:** official gold surface, large gym composition, strength/development/assessment/membership focus; link to training.
7. **Recovery:** calmer paper surface with Revive image and care content; link to existing Revive service screen.
8. **Membership:** native radio comparison between court and gym focus; member-only actual badminton data; explicit login/team paths for prices and purchases. No invented plans or availability.
9. **Community/partners:** CMS articles and registration links, honest loading/empty/error states, original partner carousel with explicit pause/resume and original logos.
10. **Closing/footer:** requested final headline and signup CTA; real route navigation, guideline-sourced address/phone/email, Facebook destination, contact destination, member login, language switcher, back-to-top link.

## 4. Component architecture

`Home.tsx` composes sections within `MotionConfig reducedMotion="user"`. Dedicated CSS is imported with this lazy route.

- `PublicNavigation.tsx`: official brand asset, desktop links, native modal menu, focus/scroll restoration.
- `LandingSections.tsx`: independent presentational sections, local facility records, closing/footer.
- `MembershipExperience.tsx`: accessible comparison and authenticated package read.
- `CommunitySection.tsx`: typed CMS read/refresh/error handling; external URL validation.
- `Motion.tsx`: `RevealText`, `RevealLines`, `FadeUp`, `ParallaxImage`, `StaggerContainer`, `MagneticButton`, `HoverImage`, `SectionTransition`, `PageLoader`.
- `PartnersCarousel.tsx`: existing logos and interactions, plus persistent pause toggle and timer cleanup.
- `landing.css`: exclusively homepage-scoped tokens, compositions, responsive adjustments, and reduced-motion overrides.
- `HeroScene.tsx`, `HeroFallback.tsx`, `HeroSceneBoundary.tsx`: isolated procedural 3D hero, no-image fallback, and error containment. Shared feather geometry, viewport-aware scene scale/position, simplified mobile detail, and context-loss handling.
- `WorkspaceCover.tsx`, `ServiceIntro.tsx`, `useWorkspaceNavigation.ts`, and `styles/workspace.css`: shared role dashboards, service photography, keyboard/focus-safe product drawers, and operational visual foundations.
- `UI.tsx`, `AuthShell.tsx`, `RoleLayout.tsx`, `layouts/Layouts.tsx`: consistent product chrome, authentic logo, warm surfaces, dark navigation, tables, forms, and account screens. Existing API consumers/handlers and route guards remain in place.

## 5. Motion specification

- Text: 850ms cubic-bezier(.22,1,.36,1), 90ms word stagger, masked transform/opacity reveal. Scroll headings reveal once.
- Section entrances: 32px displacement, 850ms; facility child stagger 100ms. Intersection-based triggers, no repeated offscreen animation loops.
- Parallax: bounded -3% to +3% translation inside reserved image containers; Framer Motion scroll values, no React state updates per scroll frame.
- Magnetic buttons: desktop mouse only, 8%/12% pointer offset, spring stiffness 240/damping 28, reset on pointer leave.
- Image hover: 1.035 scale, 800ms; keyboard focus receives the same affordance.
- Image section reveal: 1.1-second clip reveal (one-time, no layout mutation). Court motif uses opacity/scale.
- Intro: 850ms deterministic dwell plus 650ms curtain exit, no image/network prerequisite, pointer-events disabled, hidden from assistive technology. Session storage failure does not prevent dismissal.
- Mobile navigation: opacity entrance, 80ms link stagger; native dialog provides modal focus and Escape support.
- Three.js: subtle sinusoidal float and rotation, damped mouse tilt, an explicit pause/resume control, no touch input hijacking; render on demand for reduced motion/offscreen/hidden tabs. Scene readiness crossfade, static initial pose, desktop DPR capped at 1.5 and mobile at 1.15, 12/16 feathers, no real-time shadow maps or postprocessing. No continuously animated React state.
- Reduced motion: loader skipped; masked/fade entrances start visible; no parallax, pointer movement, CSS motion, or smooth native scrolling. Partner duplicate hidden by existing reduced-motion CSS.
- Native scrolling is retained. Lenis is unnecessary and could complicate existing router scroll resets and touch behavior.

## 6. Responsive and accessibility strategy

- Target 360, 390, 768, 1024, 1440, 1920px. Below 768px: one-column editorial sections and facilities, stacked services, concise header, natural copy wrap. Below 1100px: fullscreen menu. Desktop: asymmetric compositions and broad negative space.
- Semantic main/sections/figures, one H1, descriptive image alternatives, decorative layers hidden, skip link, named navigation, visible focus indicators.
- Native dialog focus containment, close button, Escape, trigger focus return, body scroll locking/restoration, automatic close on desktop resize or route navigation.
- Radio fieldset/legend, keyboard arrow-key selection and live membership detail. Pause/resume for automatic partner motion; hover/focus/touch pauses remain supported.
- Original logo preserves aspect ratio; image compositions reserve dimensions. Paper surfaces use dark typography, gold buttons use charcoal text.
- Preserve the existing language switcher and `LocalizedTree`/`useLanguage` integration. Newly introduced copy falls back to English when no Burmese dictionary entry exists; complete approved translations are a separate content requirement.

## 7. Performance optimization strategy

- The user explicitly selected a 3D hero after the initial photography implementation. Render heading/CTA/fallback immediately and load its renderer lazily. Supply `srcSet` and realistic `sizes` for below-the-fold facility photography; keep those lazy/low priority. Existing original images remain available.
- Avoid global font downloads, new dependencies, video autoload, shadow/postprocessing passes, and synthetic metrics. Keep the hero scene's geometry simple, shared where possible, and pause its render loop outside the viewport or in a hidden tab. Three.js adds material bundle/download cost; actual Core Web Vitals need production profiling.
- Reserve media geometry with explicit container heights and image dimensions. Use transform/opacity-based interactions and motion values instead of frame-by-frame React rendering.
- Keep route-based lazy loading and existing API contracts. CMS refreshes are deduplicated within the component and listeners/timers are cleaned up.
- Production build and local browser evidence are required; excellent Core Web Vitals are a target, not a claimed measured result. Production network/device conditions still need profiling.

## 8. Regression-test checklist

- [ ] TypeScript project build and Vite production build succeed.
- [ ] Screenshots/layout overflow checks at all six target widths.
- [ ] Hero/section photos load without broken sources; responsive variants are selected.
- [ ] Hero uses Three.js with no photographic hero source; WebGL renders at all target widths, static reduced-motion pose works, and unsupported/context-lost renderer falls back without losing navigation or CTAs.
- [ ] Three.js pauses offscreen and in hidden tabs, resumes on return, and caps mobile detail/DPR.
- [ ] Desktop/mouse, keyboard links, skip link, and mobile menu close/Escape/focus containment behave correctly.
- [ ] Opening/closing the mobile menu restores scroll; anchor selection lands on the correct section; resize closes it.
- [ ] Reduced motion skips loader and shows content; hover/parallax/carousel motion stops.
- [ ] Explore CTA scrolls to facilities; court/coaching/recovery/training/checkout routes retain guards.
- [ ] Anonymous visitors see login on guarded CTAs; member/other roles retain existing routing behavior.
- [ ] Membership focus works via radio keyboard interaction; actual active packages only for member accounts; pending/error/empty states render honestly.
- [ ] CMS loading/published/empty/error states and registration links work; draft content excluded.
- [ ] Partner images preserve proportions; pause button and focus/touch behavior work.
- [ ] Account/authentication, payments, staff data consumers, and route guards retain their business behavior; styling changes do not affect API payloads or field values.
- [ ] Authenticated booking/purchase/payment smoke tests with test accounts and backend available (do not place real purchases during UI QA).

Execution results and remaining checks are recorded separately in `LANDING_PAGE_QA.md`. No production-readiness claim is made from compilation alone.

## 9. UI expansion across the web app

- All ten role workspaces share dark architectural navigation, warm paper surfaces, corrected brand gold, high-contrast controls, restrained rounded corners, and clear page hierarchy. Member, admin, owner, badminton/gym/clinic front office, store, cafe, coach, and doctor dashboards have role-specific covers and existing route shortcuts.
- Tables keep their existing data/pagination/actions, with clearer column headers, row focus/hover states, and consistent control sizes. Financial figures wrap rather than being clipped. Status colors remain semantically distinct.
- Mobile workspace drawers now support Escape, a focus loop, background inertness, scroll locking/restoration, route-close, and desktop-resize close. No role-switching or permission bypass introduced.
- Login, signup, recovery, and profile-completion screens share the court editorial panel, official logo, warm forms, and clearer input/action styling. Authentication functions and provider configuration are untouched.
- Booking selection has two photographic service choices and correctly rendered badge components. Classes, training, Revive, and customer cafe gain scoped service introductions. Cafe has an honest empty-menu state. Store uses a neutral product placeholder rather than a synthetic logo-like letter.
- Public facilities, memberships, coaches, and contact destinations replace their previous one-card placeholders with actual facility navigation, guarded coaching/package paths, and guideline-sourced contacts. Prices are still fetched only through existing authenticated flows.
- Fix the profile upload input's layout overflow and size native checkboxes/radios consistently. Repair corrupted punctuation in staff display labels while retaining legacy slot generation/parsing values and API formats.
- The shared stylesheet is loaded explicitly after `index.css` in `main.tsx`; no dependencies, backend migrations, API paths, or checkout algorithms were added or replaced.

# Transparent ZAWANA branding and landing-page lion

**Retired:** The decorative lion backdrop and scroll effects were removed at the user’s request. The public navbar, mobile navigation and footer now display the supplied `public/logo.png` in its original colors. The notes below record the previous implementation.

The header, workspace logo and introduction use `public/brand/zawana-logo-transparent.png`. This is an RGBA cutout; its alpha channel was verified. The previous artwork remains in `public/brand/`. Dark surfaces apply a gold CSS treatment to keep the silhouette and wordmark visible, while light product surfaces retain the navy/gold artwork. The previous sidebar frame and shadow were removed.

`src/components/home/LionJourney.tsx` adds one decorative, fixed lion backdrop scoped to the landing page. Framer Motion scroll values drive lateral drift, vertical parallax, gentle rotation, scale and an orbit detail. A cropped CSS alpha mask displays only the crowned lion in this backdrop, excluding the wordmark. Section intersection changes its presentation from muted gold over dark surfaces to a faint navy watermark over light sections. Content, links and controls remain above it. The layer ignores pointer events and is hidden from assistive technology.

The motion has no scroll hijacking, autoplay loop, or React state updates on every scroll frame. It unmounts when the landing route changes. Reduced motion keeps a static lion and hides the orbit/trace and scroll-progress strip; mobile uses a smaller treatment without the trace.

Desktop browser checks verified changing scroll transforms, light/dark section tone, transparent asset loading and inactive pointer events. Mobile layouts at 390px and 320px had no horizontal document overflow. Reduced-motion checks verified a static transform and hidden progress strip. No uncaught page errors occurred. TypeScript/Vite production build and `git diff --check` passed. Public API requests used fixtures during the browser checks; live business workflows were not modified or exercised.

Previews: [desktop](previews/lion-landing.png), [mobile](previews/lion-mobile.png).

## Asset provenance and final prompt

Created with the built-in imagegen tool from the existing official square logo. This is a generated cutout, so it is not a pixel-identical vector master. The original source files remain available.

Final prompt:

> Use case: background-extraction. Edit target: the supplied official ZAWANA brand logo. Create a clean transparent PNG cutout for website navigation and a scroll animation. Preserve the original crowned lion silhouette, its navy color, gold crown, exact wordmark THE ZAWANA, exact EST.2022 text, their proportions and positions. Remove the white background AND the orange/yellow rectangular backing behind THE ZAWANA lettering. All white negative space within the mane and crown must be fully transparent, not white. Keep the navy letters and make the small EST.2022 text navy too. Do not redraw, redesign, simplify, replace, or add any element. No new background, no framing, no shadow, no glow. Keep generous enough padding to preserve all edges without clipping; retain original square composition. Output truly transparent RGBA PNG.

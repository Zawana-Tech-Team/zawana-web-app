# Achievements journal and badminton coaches

The public pages are `/achievements`, `/achievements/:id`, and `/coaches`. They are available without signing in and share the landing page's navigation and footer. Achievements have category filters, search, a featured latest story, and individual article pages. Coaches are fetched from the database and can be searched by name or specialty.

The existing Motion for React library powers staggered hero entrances and one-time scroll reveals for stories, coach profiles, article content, and coaching invitations. `EditorialReveal` shares the short opacity/translate animation; card delays are capped at 140 ms. Search and filter results update immediately. Image hover and keyboard-focus effects respect reduced motion, and reduced-motion visitors receive all content immediately without entrance animations. The original gold, charcoal, and cream theme is retained.

## Publishing

Open **Admin → Content & Achievements** (`/admin/cms`), then **New achievement**. Enter a title, category, summary, and full article. Upload a cover image or provide an image URL / local asset path. Article text uses blank lines to separate paragraphs; it is rendered as plain text, without executing HTML.

Save as a draft, select Published, or use Publish now from the table. Published posts with future dates stay hidden until that date in the business timezone (Asia/Yangon by default). Changing a post back to Draft hides its public URL. Editing and deleting posts use the existing admin content permissions. Community updates remain separate and continue appearing on the homepage.

Manage coach names, specialties, departments, portraits, and status through the existing **Admin → Coaches** screen. The public directory includes only active Badminton profiles linked to an active, undeleted Coach account. It does not expose account email addresses, phone numbers, or internal user records. Missing portraits use a branded initials placeholder. Enquiries link to Contact; private coaching links to the existing member booking flow.

## Database and API

Migration `20261019100000_achievement_journal` adds `kind`, `category`, and `body` to ContentItem, with a publication lookup index. Existing records default to Community and are preserved. Migration files are provided for SQLite and PostgreSQL.

For SQLite, the backend dev startup applies migrations automatically. For PostgreSQL deployments, use the existing `npm --prefix backend run prisma:generate:postgres` and `npm --prefix backend run prisma:migrate:postgres` workflow before starting the backend.

- `GET /api/achievements`: up to 100 published, due achievement summaries, newest first.
- `GET /api/achievements/:id`: published, due full article; otherwise 404.
- `GET /api/public/coaches`: up to 200 active public badminton profiles, alphabetically.
- `GET /api/content`: published, due Community updates for the homepage.
- Existing `/api/content` write endpoints and `/api/admin/content` listing manage both post types. Writes are validated; only admins may create, edit, publish, and delete.

## Verification

Run `npm run build`, `npm --prefix backend run typecheck`, and `npm --prefix backend test`.

`npm run test:content:browser` uses the repository's existing Playwright tooling. It creates an isolated temporary SQLite database, starts its own API and frontend, verifies anonymous visibility and write permissions, creates and publishes a post through the admin UI with a real cover upload, and checks search, category filters, full article reloads, coach filtering, mobile navigation, unpublishing, deletion, empty states, and error recovery. It prints screenshot paths and cleans up its servers, database, and uploaded image. A local Chrome installation or Playwright Chromium is required; `CONTENT_BROWSER_EXECUTABLE_PATH` can select a browser, and `CONTENT_QA_ARTIFACT_DIR` can select the screenshots directory.

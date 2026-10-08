# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

An embeddable React chat widget (`SoliplexChat`) that talks to a Soliplex/PydanticAI backend over the AG-UI protocol, with optional OIDC login through a popup. It ships as a single IIFE bundle (`public/soliplex-chat.js`) that any page can load with a `<script>` tag. There is also a Next.js app (`app/`), but it is only a local dev harness. The widget bundle is the product.

## Layout

| Path | Role |
|------|------|
| `widget/index.tsx` | Bundle entry. Defines `window.SoliplexChat` (`init`/`destroy`/`open`/`close`), resolves string tool handlers from `window`, and **injects the widget's CSS** |
| `components/ChatWidget.tsx` | Floating bubble/panel, server URL prompt, login screen, room selection, persisted open/room state |
| `components/Chat.tsx` | Message list, input, markdown rendering, tool-call display |
| `hooks/useAGUIChat.ts` | Chat state, client-side tool execution, thread/message persistence |
| `hooks/useAuth.ts`, `lib/auth-service.ts` | OIDC popup flow and token storage (`/api/login`, `/api/user_info`) |
| `lib/agui-client.ts` | AG-UI client (`/api/v1/rooms/{room}/agui[/{thread}[/{run}]]`) |
| `public/` | GitHub Pages root: demo `index.html`, built bundle + sourcemap, `soliplex-auth-callback.html`, `plone_soliplex_tool.js` |
| `docs/` | User docs, example pages, and **copies** of `soliplex-chat.js(.map)` and `plone_soliplex_tool.js` |
| `esbuild.config.mjs` | Widget build. Resolves the `@/` alias, has a watch mode and a polling+SSE live-reload mode (`ESBUILD_POLL=1`) for Docker |
| `Dockerfile`, `nginx-widget.conf` | Dev container that runs the watch build, and the nginx config that serves the widget and proxies the backend |

## Commands

```bash
npm install
npm run build:widget        # -> public/soliplex-chat.js (+ .map)
npm run build:widget:watch  # rebuild on change (ESBUILD_POLL=1 for Docker bind mounts)
npm run dev                 # Next.js harness at :3000 (NEXT_PUBLIC_AGUI_BASE_URL in .env.local)
npx tsc --noEmit            # type-check
```

There is no test suite and no ESLint config (`npm run lint` prompts to set one up). To verify a change, type-check, rebuild the widget, and load `public/index.html` or a `docs/*-example.html` page against a running backend.

## Conventions and gotchas

- **The built bundle is committed.** After changing anything under `widget/`, `components/`, `hooks/` or `lib/`, run `npm run build:widget` and commit `public/soliplex-chat.js` and `.map`. Then copy both into `docs/` so the copies stay identical. If you edit `plone_soliplex_tool.js`, keep `public/` and `docs/` in sync the same way.
- **Tailwind does not reach the bundle.** The widget renders inside arbitrary host pages, and its styles come from the hand-written utility classes in `injectStyles()` in `widget/index.tsx`. If you use a class in a component that isn't defined there, add a rule for it, or the widget will be unstyled when embedded.
- **Adding a config option** means touching the `ChatWidgetConfig` interface in `components/ChatWidget.tsx`, copying the option explicitly into `widgetConfig` in `widget/index.tsx`, and adding it to the options table in `README.md` and `docs/usage.md`.
- **Persistence**: thread ID, messages, open state and selected room live in `localStorage`, keyed per server (and per room where relevant), and are gated by `config.persist` (default `true`). Auth tokens are stored separately in `lib/auth-service.ts`. Wrap storage access so a failure doesn't break the widget, and keep the existing key scheme so you don't strand users' saved conversations.
- **Security**: assistant markdown is rendered through `dangerouslySetInnerHTML` in `Chat.tsx` (`parseSimpleMarkdown`). Any rendering change must keep the HTML escaping (`escapeHtml`) and the URL scheme allow-list.
- **Client-side tools** are `{name, description, parameters, handler}`. `handler` can be a function or a dotted path string resolved on `window` (for example `"myApp.tools.getWeather"`).
- `@copilotkit/*` is listed in `package.json` but not imported anywhere.
- CI: `.github/workflows/deploy-widget.yml` runs `npm run build:widget` and publishes `public/` to GitHub Pages. Its `paths` filter still names `src/**` and `vite.config.ts`, so it only fires on changes under `public/**`, `package*.json` and `tsconfig.json`. Changes to `docs/**/*.md` or `README.md` trigger a rebuild of the soliplex.github.io docs site.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): short imperative subject` (for example "feat: persist conversation and widget state"), with a body that explains what changed and why. Release notes are generated from them by git-cliff (`cliff.toml`), so pick the type carefully: `feat`, `fix`, `perf`, `docs`, `refactor`, or `build`/`ci`/`chore`/`style`/`test`. Mark breaking changes with `!` (`feat!: …`) or a `BREAKING CHANGE:` footer. Don't use a type for "Compile" commits that only rebuild the bundle; those are left out of the notes.
- Releases: `npm version <x.y.z> --no-git-tag-version`, commit as `chore(release): v<x.y.z>`, then `git tag -a v<x.y.z> -m "<release title>" [-m "<intro paragraph>"]` and `git push origin main v<x.y.z>`. `.github/workflows/release.yml` fails if the tag and `package.json` disagree. Otherwise it builds the widget, generates notes since the previous tag, and publishes a GitHub release with the bundle files attached.

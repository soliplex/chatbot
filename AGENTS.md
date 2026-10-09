# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

An embeddable React chat widget (`SoliplexChat`) that talks to a Soliplex/PydanticAI backend over the AG-UI protocol, with optional OIDC login through a popup. It ships as a single IIFE bundle (`public/soliplex-chat.js`) that any page can load with a `<script>` tag. There is also a Next.js app (`app/`), but it is only a local dev harness. The widget bundle is the product.

## Layout

| Path | Role |
|------|------|
| `widget/index.tsx` | Bundle entry. Defines `window.SoliplexChat` (`init`/`destroy`/`open`/`close`), and resolves string tool handlers from `window` |
| `components/ChatWidget.tsx` | Floating bubble/panel, server URL prompt, login screen, room selection, persisted open/room state |
| `components/Chat.tsx` | Message list, input, markdown rendering, tool-call display |
| `hooks/useAGUIChat.ts` | Chat state, client-side tool execution, thread/message persistence |
| `hooks/useAuth.ts`, `lib/auth-service.ts` | OIDC popup flow and token storage (`/api/login`, `/api/user_info`) |
| `lib/theme.ts` | **All of the widget's CSS**: the Soliplex design tokens (`--sp-*`) and the component styles, injected once by `injectStyles()` |
| `lib/agui-client.ts` | AG-UI client (`/api/v1/rooms/{room}/agui[/{thread}[/{run}]]`) |
| `public/` | GitHub Pages root: demo `index.html`, `soliplex-auth-callback.html`, `plone_soliplex_tool.js`. The built bundle lands here but is git-ignored |
| `docs/` | User docs, example pages (they load the bundle from the GitHub Pages deploy), and a **copy** of `plone_soliplex_tool.js` |
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

- **The built bundle is not committed.** `public/soliplex-chat.js(.map)` and the old `docs/` copies are git-ignored. CI builds the bundle: the Pages deploy publishes it at `https://soliplex.github.io/chatbot/soliplex-chat.js` on every push to `main` that touches the sources, and the release workflow attaches it to the GitHub release. Example pages under `docs/` load it from that Pages URL. Run `npm run build:widget` locally to test, but never `git add` the output. If you edit `plone_soliplex_tool.js`, keep the `public/` and `docs/` copies in sync.
- **Tailwind does not reach the bundle.** The widget renders inside arbitrary host pages, and its styles come from the stylesheet in `lib/theme.ts`. If you use a class in a component that isn't defined there, add a rule for it, or the widget will be unstyled when embedded.
- **Styling uses the Soliplex design tokens.** Colors, spacing, radii and type sizes are the `--sp-*` custom properties, copied from `design_system/tokens.css` in `soliplex_frontend`; don't hard-code values the design system lacks. Every rule is scoped under `.soliplex-root` so nothing leaks into the host page, and element resets use `:where()` so host element rules can't restyle the widget while component classes still win over the resets.
- **Adding a config option** means touching the `ChatWidgetConfig` interface in `components/ChatWidget.tsx`, copying the option explicitly into `widgetConfig` in `widget/index.tsx`, and adding it to the options table in `README.md` and `docs/usage.md`.
- **Persistence**: thread ID, messages, open state and selected room live in `localStorage`, keyed per server (and per room where relevant), and are gated by `config.persist` (default `true`). Auth tokens are stored separately in `lib/auth-service.ts`. Wrap storage access so a failure doesn't break the widget, and keep the existing key scheme so you don't strand users' saved conversations.
- **Security**: assistant markdown is rendered through `dangerouslySetInnerHTML` in `Chat.tsx` (`parseSimpleMarkdown`). Any rendering change must keep the HTML escaping (`escapeHtml`) and the URL scheme allow-list.
- **Client-side tools** are `{name, description, parameters, handler}`. `handler` can be a function or a dotted path string resolved on `window` (for example `"myApp.tools.getWeather"`).
- `@copilotkit/*` is listed in `package.json` but not imported anywhere.
- CI: `.github/workflows/deploy-widget.yml` runs `npm run build:widget` and publishes `public/` to GitHub Pages on pushes to `main` that touch `widget/`, `components/`, `hooks/`, `lib/`, `public/`, the esbuild config or the package files. Changes to `docs/**/*.md` or `README.md` trigger a rebuild of the soliplex.github.io docs site, which copies the whole `docs/` tree.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): short imperative subject` (for example "feat: persist conversation and widget state"), with a body that explains what changed and why. Release notes are generated from them by git-cliff (`cliff.toml`), so pick the type carefully: `feat`, `fix`, `perf`, `docs`, `refactor`, or `build`/`ci`/`chore`/`style`/`test`. Mark breaking changes with `!` (`feat!: …`) or a `BREAKING CHANGE:` footer.
- Releases: `npm version <x.y.z> --no-git-tag-version`, commit as `chore(release): v<x.y.z>`, then `git tag -a v<x.y.z> -m "<release title>" [-m "<intro paragraph>"]` and `git push origin main v<x.y.z>`. `.github/workflows/release.yml` fails if the tag and `package.json` disagree. Otherwise it builds the widget, generates notes since the previous tag, and publishes a GitHub release with the bundle files attached.

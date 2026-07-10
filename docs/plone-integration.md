# Integrating the Plone tools

This guide explains how to add `plone_soliplex_tool.js` to a **Plone 6** site so
the Soliplex chat widget can search content, identify the logged-in user, and
answer questions such as *"What are the most recent changes in my folder?"*.

It covers both flavours of Plone 6:

- **Classic UI** — the server-rendered interface.
- **Volto** — the React frontend.

For the widget's general options and the list of tools/API it exposes, see the
[Widget Usage Guide](usage.md) (in particular the
[Plone Integration](usage.md#plone-integration) reference section).

## What you get

`plone_soliplex_tool.js` is a self-contained script (no build step, no
dependencies). Once loaded it exposes `window.PloneSoliplex` with:

- `PloneSoliplex.getToolDefinitions()` — the agent tools to pass to
  `SoliplexChat.init({ tools })`.
- `PloneSoliplex.configure(options)` — override defaults (site root, token key,
  member-folder base, etc.).
- Direct client helpers (`getCurrentUser`, `search`, `listFolderContents`, …).

The provided tools are: `plone_get_current_user`,
`plone_recent_changes_in_my_folder`, `plone_search`,
`plone_list_folder_contents`, and `plone_get_content`.

## Prerequisites

- **Plone 6** with [plone.restapi](https://plonerestapi.readthedocs.io/)
  installed and enabled (it ships with Plone 6). The tools call the standard
  `@search`, `@users`, and content endpoints.
- A reachable **Soliplex server** with at least one room.
- The two front-end files, served over HTTP(S):
  - `soliplex-chat.js` — the widget bundle
  - `plone_soliplex_tool.js` — the Plone tools
- *(Only if your Soliplex server itself requires sign-in)*
  `soliplex-auth-callback.html`, hosted next to the page that embeds the widget.
  See [Authentication](usage.md#authentication) for details.

## Step 1: Make the scripts available to your site

Both scripts must be reachable from the browser. For the smoothest
authentication story, serve them from the **same origin as your Plone site** so
the tools can reuse the browser's existing Plone session (see
[Authentication](#step-3-authentication) below).

Pick one:

- **Bundle them with a theme/add-on** (recommended — see the per-UI steps
  below). The files end up served from your Plone origin.
- **Serve from a CDN or the Soliplex server.** This works too, but if the
  scripts are on a different origin than Plone, authentication must go through a
  JWT or an explicit token rather than session cookies.

## Step 2: Load and initialize the widget

### Classic UI

The reliable way to inject scripts into every page in Classic UI is through a
**custom Diazo theme**.

1. Copy `soliplex-chat.js` and `plone_soliplex_tool.js` into your theme folder
   (the same place as the theme's `index.html`, e.g. a `js/` subfolder). They
   are then served at `++theme++<your-theme>/js/soliplex-chat.js`.

2. In the theme's `index.html`, add the scripts and an init block before
   `</body>`:

   ```html
   <script src="++theme++your-theme/js/soliplex-chat.js"></script>
   <script src="++theme++your-theme/js/plone_soliplex_tool.js"></script>
   <script>
     // The Plone site root is auto-detected; override it if needed.
     PloneSoliplex.configure({
       // baseUrl: "https://plone.example.com",
       // memberFolderBase: "/Members",
     });

     SoliplexChat.init({
       baseUrl: "https://soliplex.example.com",
       roomId: "assistant",
       title: "Plone Assistant",
       tools: PloneSoliplex.getToolDefinitions(),
     });
   </script>
   ```

   Diazo passes the theme's own `<script>` tags through to the rendered page, so
   the widget loads on every themed page.

> **Alternative (resource registry):** instead of a theme you can register the
> two files as a bundle in `plone.bundles` (via `plone.staticresources` or a
> `registry.xml` in an add-on) and add the init `<script>` through a viewlet.
> This is more work but keeps the assets out of the theme.

### Volto

Volto is a separate React app, so the scripts are added to its HTML shell rather
than to a Plone template. Use a small **Volto add-on** (or your project) and
either of these approaches.

**Option A — customize the HTML shell (`Html.jsx`).** Shadow
`src/components/theme/Html/Html.jsx` and add the tags. First place the files in
Volto's `public/` folder (served from the site root):

```
public/
├── soliplex-chat.js
└── plone_soliplex_tool.js
```

Then, in your shadowed `Html.jsx`, add to `<body>`:

```jsx
<script src="/soliplex-chat.js" />
<script src="/plone_soliplex_tool.js" />
<script
  dangerouslySetInnerHTML={{
    __html: `
      window.addEventListener('load', function () {
        SoliplexChat.init({
          baseUrl: 'https://soliplex.example.com',
          roomId: 'assistant',
          title: 'Plone Assistant',
          tools: PloneSoliplex.getToolDefinitions(),
        });
      });
    `,
  }}
/>
```

**Option B — inject via `appExtras`.** Register a component in
`config.settings.appExtras` that uses `<Helmet>` to add the two `<script>` tags
and the init snippet. This keeps everything inside your add-on without shadowing
`Html.jsx`.

> **Cross-origin note for Volto:** the Volto frontend and the plone.restapi
> backend are usually on different origins. Set `PloneSoliplex.configure({
> baseUrl: '<your-plone-backend-url>' })` and rely on the Volto JWT (stored in
> `localStorage` under `auth_token`, which the tools read by default). Make sure
> the backend's CORS policy allows requests from the Volto origin.

## Step 3: Authentication

The Plone tools authenticate the **same way the browser already does**, in this
order:

1. **Volto/Plone JWT** — if a token is present in `localStorage` (default key
   `auth_token`) it is sent as `Authorization: Bearer …`.
2. **Session cookies** — otherwise, same-origin requests include cookies
   (`credentials: "include"`), which covers Plone Classic logins.
3. **Soliplex OIDC token** — as a last resort the widget's own token is reused
   (handy when Plone and Soliplex share an identity provider).

For cookie-only Classic sessions the user id can't be read on the client (the
`__ac` cookie is `HttpOnly`). The client then asks the server via the
`@logged-in-user` endpoint; if it isn't installed you can supply the id yourself
with `PloneSoliplex.configure({ userId })`. See the
[Authentication reference](usage.md#authentication) in the usage guide, and the
`PloneSoliplex.configure` [options table](usage.md#configuration) for the full
list of knobs (`baseUrl`, `token`, `tokenKey`, `useSoliplexToken`, `userId`,
`getUserId`, `memberFolderBase`, `allowWrites`, `defaultLimit`,
`loggedInUserEndpoint`).

> This is separate from the **Soliplex** widget's own sign-in. If your Soliplex
> server requires login, also host `soliplex-auth-callback.html` next to the
> embedding page — see [Authentication](usage.md#authentication).

## Step 4: Verify

1. Log in to your Plone site as usual.
2. Open the chat widget and ask: **"Who am I?"** — the agent should call
   `plone_get_current_user` and return your id, name, and roles.
3. Ask: **"What are the most recent changes in my folder?"** — it should list
   recently modified content.

To debug the raw tool responses, initialize the widget with `debug: true` (see
[Configuration Options](usage.md#configuration-options)); the raw JSON returned
by each tool is then shown inline in the chat.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `PloneSoliplex is not defined` | `plone_soliplex_tool.js` didn't load, or loaded after `SoliplexChat.init`. Ensure both scripts load before the init snippet. |
| Agent reports the user as unknown | No JWT and `@logged-in-user` not installed. Set `PloneSoliplex.configure({ userId })` or install the endpoint. |
| `401`/`403` on tool calls | Requests aren't authenticated. On a different origin than Plone, ensure a JWT is present (`tokenKey`) and CORS allows the origin. |
| Requests hit the wrong host | Set `PloneSoliplex.configure({ baseUrl })` to your Plone site root. |
| Search/paths return nothing | Check `memberFolderBase` matches where per-user folders live, and that the user has permission to the content. |

## Related documentation

- [Widget Usage Guide](usage.md) — full configuration and tool reference.
- [Authentication](usage.md#authentication) — the Soliplex OIDC popup flow and
  the `soliplex-auth-callback.html` requirement.
- [plone.restapi](https://plonerestapi.readthedocs.io/) — the endpoints the
  tools use.

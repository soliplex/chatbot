# Soliplex Chat Widget

A React-based embeddable chat widget that connects to a Soliplex/PydanticAI backend using the AG-UI protocol. Supports OIDC authentication via popup flow.

**[Live Demo](https://soliplex.github.io/chatbot/)**

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run the tests
npm test

# Build embeddable widget
npm run build:widget
```

## Embedding the Widget

Add to any HTML page:

```html
<script src="https://soliplex.github.io/chatbot/soliplex-chat.js"></script>
<script>
  SoliplexChat.init({
    baseUrl: "https://my-server.example.com",
    title: "Chat with us",
    placeholder: "Ask me anything..."
  });
</script>
```

If `baseUrl` is omitted, the widget will prompt the user to enter a server URL:

```html
<script>
  SoliplexChat.init({
    title: "Connect to Chat"
  });
</script>
```

The widget will:
1. If no `baseUrl` is configured, show a server URL prompt
2. Check if authentication is required (fetches `/api/login`)
3. If auth is configured, show a login screen with available providers
4. After authentication (or if no auth required), fetch available rooms from `/api/v1/rooms`
5. Display a room selector if multiple rooms exist, or auto-select if only one

## Configuration Options

The widget takes options for room selection (`roomId`, `roomIds`,
`fallbackRoomIds`), appearance (`title`, `bubbleColor`, `theme`, `position`),
persistence, and client-side `tools`. See
[Configuration Options](docs/usage.md#configuration-options) in the usage
guide for the full reference.

## Authentication

The widget supports OIDC authentication through the Soliplex backend. When auth systems are configured on the backend:

1. The widget fetches available auth providers from `/api/login`
2. User clicks a provider button to start OAuth flow
3. A popup window opens for authentication (no page redirect)
4. On success, tokens are passed back to the widget via `postMessage`
5. All subsequent API calls include the Bearer token

### Auth Callback Page

For the popup flow to work, the widget bundle includes a callback page (`soliplex-auth-callback.html`) that must be served from the same origin as the widget. This page captures tokens from URL parameters and sends them to the parent window.

### Backend Configuration

Enable OIDC on the backend by creating a config file (e.g., `oidc/config.yaml`):

```yaml
oidc_client_pem_path: "./cacert.pem"

auth_systems:
  - id: "keycloak"
    title: "Sign in with Keycloak"
    server_url: "https://your-keycloak.example.com/realms/your-realm"
    client_id: "your-client-id"
    client_secret: "your-client-secret"
    scope: "openid email profile"
    token_validation_pem: |
        -----BEGIN PUBLIC KEY-----
        ...your public key...
        -----END PUBLIC KEY-----
```

## Running a Backend Locally

The widget needs a running Soliplex backend. The quickest way to get one is
the [soliplex-template](https://github.com/soliplex/soliplex-template) Docker
Compose stack: follow its "Try it" section, and see its
[documentation](https://soliplex.github.io/soliplex-template/) for ports,
authentication, and configuring rooms. The stack serves the API through nginx
at `http://localhost:9000`, which is the backend the demo page uses.

Then build the widget and serve the demo page:

```bash
npm run build:widget:watch

# In another terminal
cd public
python -m http.server 8080
# Open http://localhost:8080/
```

## Documentation

- [Development Guide](docs/readme.md) - Setup, architecture, and customization
- [Widget Usage Guide](docs/usage.md) - Embedding examples and tool definitions

## License

MIT

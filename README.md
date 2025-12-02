# Soliplex Chat Widget

A React-based embeddable chat widget that connects to a Soliplex/PydanticAI backend using the AG-UI protocol.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build embeddable widget
npm run build:widget
```

## Embedding the Widget

Add to any HTML page:

```html
<script src="https://your-domain.com/soliplex-chat.js"></script>
<script>
  SoliplexChat.init({
    baseUrl: "http://localhost:8000",
    roomId: "your-room-id",
    title: "Chat with us",
    placeholder: "Ask me anything..."
  });
</script>
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | *required* | Backend API URL |
| `roomId` | string | *required* | Room identifier |
| `title` | string | `"Chat with us"` | Chat header title |
| `placeholder` | string | `"Ask me anything..."` | Empty state message |
| `bubbleColor` | string | `"#2563eb"` | Chat bubble color |
| `position` | string | `"bottom-right"` | `"bottom-right"` or `"bottom-left"` |
| `autoHideSeconds` | number | `0` | Auto-hide delay (0 = never) |
| `tools` | array | `[]` | Custom client-side tools |

## Documentation

- [Development Guide](docs/readme.md) - Setup, architecture, and customization
- [Widget Usage Guide](docs/usage.md) - Embedding examples and tool definitions

## License

MIT

# Claude Code Sync

A real-time sync system for Claude Code data across multiple devices.

## 🚀 Features

- **Real-time Sync**: Automatically sync Claude Code data (sessions, MCP configs, slash commands, settings) across devices
- **Smart Conflict Resolution**: Keep both versions, auto-merge, or manually resolve conflicts
- **API Key Authentication**: Secure authentication with Google OAuth + API keys
- **Rate Limiting**: Abuse prevention with tiered rate limits
- **Storage Quotas**: 100MB free tier, 1GB pro tier
- **Beautiful CLI**: OpenTUI-powered terminal interface

## 📦 Project Structure

```
cc-sync/
├── packages/
│   ├── cli/                 # OpenTUI CLI application
│   ├── convex-backend/      # Convex real-time backend
│   ├── auth-web/            # Better Auth web UI
│   └── shared/              # Shared types & utilities
├── turbo.json              # TurboRepo configuration
└── package.json            # Root workspace
```

## 🛠️ Setup

### Prerequisites

- Bun >= 1.3.1
- Node.js >= 18 (for Convex CLI)
- Google OAuth credentials (for authentication)

### 1. Install Dependencies

```bash
bun install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Get Google OAuth credentials from [Google Cloud Console](https://console.cloud.google.com/):
1. Create a new project
2. Enable Google+ API
3. Create OAuth 2.0 credentials
4. Add authorized redirect URI: `http://localhost:3000/auth/callback/google`

### 3. Initialize & Start Convex Backend

First time setup:

```bash
cd packages/convex-backend
npx convex dev
```

This will:
- Prompt you to create/select a project
- Create your development deployment
- Generate the necessary files
- Open the Convex dashboard

After first-time setup, you can run from the root:

```bash
bun dev:convex
```

### 4. Start Auth Web UI

```bash
bun dev:web
```

Navigate to `http://localhost:3000` to test authentication.

### 5. Start CLI (Development)

```bash
bun dev:cli
```

## 🔧 Development

### Run All Services

```bash
bun dev
```

This starts all packages concurrently using TurboRepo.

### Type Checking

```bash
bun type-check
```

### Clean Build

```bash
bun clean
```

## 📚 Package Details

### CLI (`packages/cli`)

OpenTUI-powered CLI for syncing Claude Code data.

**Commands:**
- `cc-sync login` - Authenticate with API key
- `cc-sync sync` - Manual sync
- `cc-sync status` - Show sync status
- `cc-sync conflicts` - List/resolve conflicts
- `cc-sync watch` - Start background sync

### Convex Backend (`packages/convex-backend`)

Real-time backend with:
- **Schema**: Users, synced files, conflicts, rate limits, API keys
- **Auth Functions**: API key management, user creation
- **Sync Functions**: Push, pull, subscribe to changes
- **Conflict Resolution**: Smart merging for JSON/JSONL files
- **Rate Limiting**: Tiered limits (100/min free, 1000/min pro)

### Auth Web (`packages/auth-web`)

Simple web UI for Google OAuth and API key generation.

**Endpoints:**
- `GET /` - Login page
- `GET /auth/google` - OAuth initiation
- `GET /auth/callback/google` - OAuth callback
- `POST /api/keys/generate` - Generate API key

### Shared (`packages/shared`)

Shared TypeScript types, constants, and utilities:
- Types: `SyncedFile`, `SyncConflict`, `User`, etc.
- Constants: Claude data paths, storage tiers, rate limits
- Utils: Hash computation, path normalization, file size formatting

## 🔐 Security

- API keys are hashed with SHA-256 before storage
- Rate limiting prevents abuse
- Storage quotas enforce limits
- HTTPS required in production
- Session expires after 7 days

## 📊 Rate Limits & Quotas

### Free Tier
- Storage: 100MB
- Rate limit: 100 requests/minute
- Sessions: 5 most recent

### Pro Tier
- Storage: 1GB
- Rate limit: 1000 requests/minute
- Sessions: 5 most recent

## 🐛 Troubleshooting

### Convex Connection Issues

```bash
cd packages/convex-backend
npx convex dev
```

### Type Errors

```bash
bun install
bun type-check
```

### Auth Not Working

1. Check Google OAuth credentials in `.env`
2. Verify redirect URI matches: `http://localhost:3000/auth/callback/google`
3. Ensure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set

## 🚀 Deployment

### Deploy Convex

```bash
cd packages/convex-backend
npx convex deploy
```

### Deploy Auth Web (Vercel)

```bash
cd packages/auth-web
vercel deploy
```

### Build CLI

```bash
cd packages/cli
bun run build
```

## 📝 Next Steps

The foundation is complete! Here's what's next:

**Phase 4: CLI Implementation**
- [ ] Implement auth flow (login command)
- [ ] File watching for auto-sync
- [ ] Sync manager with push/pull
- [ ] Conflict resolution UI
- [ ] Status dashboard

**Phase 5: Smart Features**
- [ ] Session limiting (5 most recent)
- [ ] Progress indicators
- [ ] Desktop notifications
- [ ] Debounced sync
- [ ] Offline mode handling

**Phase 6: Polish & Deploy**
- [ ] Error handling
- [ ] Tests
- [ ] CI/CD
- [ ] Package CLI as binary
- [ ] Production deployment

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `bun type-check`
5. Submit a pull request

## 📄 License

MIT

## 🙏 Acknowledgments

- Built with [Convex](https://convex.dev)
- Auth powered by [Better Auth](https://better-auth.com)
- CLI powered by [OpenTUI](https://github.com/opentui/opentui)
- Monorepo managed by [TurboRepo](https://turbo.build)

# Quick Start Guide

## 🚀 Get Up and Running in 5 Minutes

### Step 1: Initialize Convex (First Time Only)

Open your terminal and run:

```bash
cd packages/convex-backend
npx convex dev
```

**What will happen:**
1. Convex will ask if you want to create a new project or use existing one
2. Choose "Create a new project"
3. Give it a name (e.g., "cc-sync-dev")
4. It will create a deployment and open the dashboard in your browser
5. Press `Ctrl+C` to stop after initialization

### Step 2: Start the Backend

After initialization, you can start Convex from the root directory:

```bash
cd ../..  # Back to root
bun dev:convex
```

**You should see:**
```
✔ Convex functions ready! (X.Xs)
```

Keep this terminal open - Convex will watch for file changes.

### Step 3: Test the CLI (Optional for Now)

In a new terminal:

```bash
bun dev:cli
```

You should see the OpenTUI demo interface.

### Step 4: Test the Auth Web UI (Optional)

In another terminal:

```bash
bun dev:web
```

Then visit: http://localhost:3000

You'll see the beautiful login page!

---

## 📝 Next Steps

### To Actually Use It:

1. **Set up Google OAuth** (for production):
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth credentials
   - Add them to `.env` file

2. **Start Building the CLI**:
   - Open `packages/cli/src/index.ts`
   - Implement the login flow
   - Build the sync manager

### Useful Commands:

```bash
# Type check everything
bun type-check

# Run all services at once (after first setup)
bun dev

# Clean everything
bun clean
```

---

## 🐛 Troubleshooting

### "Cannot prompt for input in non-interactive terminals"

This means you need to run the initial `npx convex dev` in an interactive terminal (not through Claude Code).

**Solution:**
1. Open a new terminal outside of Claude Code
2. `cd packages/convex-backend`
3. Run `npx convex dev`
4. Complete the setup wizard
5. Press Ctrl+C when done
6. Now you can use `bun dev:convex` from anywhere

### Port Already in Use

If you see "EADDRINUSE" errors:

```bash
# Find what's using the port
lsof -i :3000  # or :8080, etc.

# Kill the process
kill -9 <PID>
```

### Type Errors

```bash
# Reinstall dependencies
bun install

# Check what's wrong
bun type-check
```

---

## 🎯 What Works Right Now

✅ **Backend (Convex)**
- Schema defined (users, files, conflicts, etc.)
- Auth functions (API key management)
- Sync functions (push, pull, subscribe)
- Conflict resolution (smart merging)
- Rate limiting (100/min free, 1000/min pro)

✅ **Auth Web**
- Login page (beautiful UI)
- Google OAuth flow (configured)
- API key generation page

✅ **Shared Package**
- TypeScript types
- Constants & utilities
- Ready for use in CLI

⏳ **CLI (To Be Built)**
- Package structure ready
- Needs implementation:
  - Login flow
  - File watching
  - Sync manager
  - Conflict UI

---

## 💡 Pro Tips

1. **Keep Convex Running**: Once started, `bun dev:convex` will auto-reload when you change backend files

2. **Use Convex Dashboard**: Visit the dashboard URL from `npx convex dev` to:
   - See your data in real-time
   - Test functions manually
   - View logs

3. **Develop in Parallel**: Run multiple terminals:
   - Terminal 1: `bun dev:convex`
   - Terminal 2: `bun dev:cli` (when implementing)
   - Terminal 3: `bun dev:web` (for testing auth)

4. **Type Safety**: Always run `bun type-check` before committing

---

Happy coding! 🎉

Questions? Check the main [README.md](./README.md) for detailed documentation.

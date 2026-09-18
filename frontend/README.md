# Frontend — Valorant Shop Checker

React SPA with a Valorant-themed dark UI for viewing your daily shop.

## Running Locally

```bash
npm install
npm run dev
```

The dev server starts at `http://localhost:5173` with a proxy forwarding `/api` requests to `http://localhost:8000`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | Backend API base URL. Not needed in dev (Vite proxy handles it). Set to your backend URL in production (e.g. `https://your-backend.example.com`). |

## Building for Production

```bash
npm run build
```

Output goes to `dist/`. Deployed automatically via Vercel's git integration on push to `master`.

## Component Structure

```
src/
├── pages/
│   ├── LoginPage.tsx       # Two-stage paste-URL auth flow
│   └── ShopPage.tsx        # Daily store, bundles, wallet display
├── components/
│   ├── SkinCard.tsx        # Individual skin offer card with tier coloring
│   ├── BundleCard.tsx      # Bundle display with item grid and pricing
│   ├── CountdownTimer.tsx  # Store rotation countdown with auto-refresh
│   ├── WalletDisplay.tsx   # VP and Radianite balance in header
│   ├── ProtectedRoute.tsx  # Redirect to login if not authenticated
│   └── ErrorBoundary.tsx   # Top-level error boundary
├── api/
│   └── client.ts           # API client with localStorage token management
├── context/
│   └── AuthContext.tsx      # Auth state via useReducer + session restore
├── hooks/
│   └── useAuth.ts          # Convenience hook for AuthContext
└── types/
    └── index.ts            # Shared TypeScript interfaces
```

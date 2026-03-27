# HealthScan — PWA Deployment Guide

## Project structure

```
healthscan-pwa/
├── index.html          ← entry point, links manifest + registers SW
├── vite.config.js      ← Vite config (React plugin only)
├── package.json
├── public/
│   ├── manifest.json   ← PWA manifest (name, icons, display mode)
│   ├── sw.js           ← Service worker (offline caching)
│   ├── icon-192.svg    ← App icon (small)
│   └── icon-512.svg    ← App icon (large)
└── src/
    ├── main.jsx        ← React entry point
    └── App.jsx         ← HealthScan component (all app logic)
```

---

## 1. Run locally

```bash
npm install
npm run dev          # starts Vite dev server → http://localhost:5173
```

> **Camera access requires HTTPS.** Vite dev server uses HTTP by default.
> On your local machine the browser usually allows camera on `localhost`
> anyway. If it doesn't, see the HTTPS section below.

Open `http://localhost:5173` in a mobile browser (or use Chrome DevTools
device emulation) to test.

---

## 2. Build for production

```bash
npm run build        # outputs to ./dist/
npm run preview      # preview the production build locally
```

The `dist/` folder is everything you need to deploy. Upload it to any
static host.

---

## 3. Deploy — choose one

### A. Vercel (recommended — free, instant)

1. Push this repo to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import your repo.
3. Vercel auto-detects Vite. Click **Deploy**. Done.

Your app is live on `https://<your-project>.vercel.app` — HTTPS included.

### B. Netlify

1. Push to GitHub.
2. [netlify.com](https://netlify.com) → **New site** → connect your repo.
3. Build command: `npm run build` · Publish directory: `dist`.
4. Click **Deploy**. Done.

### C. GitHub Pages (free, but needs a small tweak)

1. Install the plugin: `npm install -D vite-plugin-gh-pages`  (or just
   manually copy `dist/` to a `gh-pages` branch).
2. If your repo URL is `https://user.github.io/healthscan/`, add a
   `base` to `vite.config.js`:
   ```js
   export default defineConfig({
     base: '/healthscan/',   // ← match your repo name
     plugins: [react()],
   });
   ```
3. `npm run build && npm run deploy`

### D. Any static file server (nginx, Apache, etc.)

Copy `dist/` contents to your server's web root. Make sure HTTPS is
enabled (required for camera + service worker). No server-side config
is needed — it's purely static files.

---

## 4. HTTPS for local testing on a real phone

The camera API is restricted to **secure contexts** (HTTPS or localhost).
If you need to test on a physical device over your LAN:

```bash
# Option A — Vite has a built-in HTTPS flag (uses a self-signed cert)
npm run dev -- --https

# Option B — use mkcert for a trusted local cert
mkcert -install
mkcert localhost 127.0.0.1 ::1
# Then update vite.config.js:
#   import fs from 'fs';
#   server: {
#     https: { key: fs.readFileSync('localhost-key.pem'),
#              cert: fs.readFileSync('localhost.pem') }
#   }
```

Then on your phone, open `https://<your-laptop-IP>:5173`.
You may need to accept the self-signed cert warning once.

---

## 5. Installing on a phone ("Add to Home Screen")

### Android (Chrome)
1. Open the app URL in Chrome.
2. Tap the **⋮ menu** → **Install app** (or a banner may appear
   automatically at the top).
3. Confirm → an icon appears on your home screen.

### iOS (Safari)
Safari does not show an install banner. The user must do it manually:

1. Open the app URL in **Safari** (not Chrome).
2. Tap the **Share** button (box-with-arrow icon) at the bottom.
3. Scroll down → tap **Add to Home Screen**.
4. Tap **Add** → icon appears on home screen.

> iOS note: Safari supports the camera API and most PWA features.
> The only thing it doesn't support is background sync and push
> notifications — neither of which this app needs.

---

## 6. What the service worker does

| Event    | Behaviour |
|----------|-----------|
| install  | Pre-caches the app shell (HTML, icons, manifest) |
| activate | Deletes any old versioned cache |
| fetch    | Tries network first; on failure serves from cache |
| offline  | Shows a simple "You are offline" page if nothing is cached |

To bust the cache on a new deploy, bump `CACHE_NAME` in `public/sw.js`
(e.g. `healthscan-v2`).

---

## 7. Detection notes (current logic)

- The scan only analyzes the **toilet bowl area** (elliptical mask) to reduce false positives from surrounding surfaces.
- Urine/stool presence is inferred with broad color profiles; results may show `Urine`, `Stool`, `Urine + Stool`, or `Unknown`.
- A minimum blood-pixel threshold and ratio is required before detections are shown.

---

## 8. Exporting results

- `Save Image` downloads the scan image with detection overlays.
- `Export Scan Results` generates a PDF with the same visual hierarchy as the Scan Results screen.
- A QR code on the results page links back to the app URL for quick access on another device.

---

## 9. Troubleshooting

| Problem | Solution |
|---------|----------|
| Camera permission denied | Make sure the site is served over HTTPS |
| "Add to Home Screen" missing on iOS | Must use Safari, not an in-app browser |
| App doesn't update after deploy | Bump `CACHE_NAME` in `sw.js`, or clear site data in browser settings |
| White flash on load | Already handled — `<body>` background matches the app's dark theme |

# GPS Map Camera

A React Native (Expo) app that captures photos with a permanent watermark
showing location, address, coordinates, and timestamp — similar to apps
like "GPS Map Camera." Captured photos are backed up to Supabase with an
offline-safe upload queue.

## Features

- Live camera preview with a real-time location overlay preview
- GPS coordinates + reverse-geocoded address (city, region, country)
- Formatted date/time with timezone offset
- Static map thumbnail (Google Static Maps API)
- Overlay burned permanently into the saved photo (not just UI)
- Saves final image to the device's photo gallery
- **Email/password auth via Supabase Auth**
- **Automatic cloud backup to Supabase Storage after each capture**
- **Offline-safe upload queue** — queues failed uploads and retries on reconnect
- **Cloud gallery tab** — browse all cloud-backed captures with pull-to-refresh

## Project Structure

```
gps-map-camera/
├── App.js                         # Navigation root + AuthProvider + upload queue
├── app.json                       # Expo config + permissions
├── babel.config.js                # babel-plugin-dotenv for .env vars
├── package.json
├── .env                           # Your real credentials (gitignored)
├── .env.example                   # Credential template to commit
├── supabase/
│   └── schema.sql                 # Run in Supabase SQL editor to set up DB + RLS
└── src/
    ├── lib/
    │   └── supabase.js             # Supabase client singleton
    ├── context/
    │   └── AuthContext.js          # Auth state, signIn/signUp/signOut
    ├── hooks/
    │   └── useUploadQueue.js       # Retries pending uploads on launch/reconnect
    ├── screens/
    │   ├── AuthScreen.js           # Sign In / Sign Up form
    │   ├── CameraScreen.js         # Capture + overlay + upload
    │   └── GalleryScreen.js        # On Device + Cloud gallery tabs
    ├── components/
    │   └── OverlayCapture.js       # Off-screen overlay, snapshotted via ViewShot
    ├── utils/
    │   ├── location.js             # GPS + reverse geocoding + static map URL
    │   ├── dateTime.js             # Timestamp formatting
    │   ├── overlay.js              # Burns overlay PNG onto captured photo
    │   └── upload.js               # Supabase Storage upload + offline queue
    └── constants/
        └── theme.js                # Shared colors/sizes for the overlay
```

## Setup

### 1. Install dependencies

```bash
npm install
```

> **Note:** `react-native-image-marker`, `@react-native-async-storage/async-storage`,
> and `@react-native-community/netinfo` all require a **development build** (not Expo Go).
> After installing, run:
> ```bash
> npx expo prebuild
> npx expo run:android   # or run:ios
> ```

### 2. Supabase — create a project

1. Go to [https://supabase.com](https://supabase.com) and create a new project.
2. In the Dashboard, go to **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon / public** key (also labelled "publishable" in newer dashboards) → `SUPABASE_ANON_KEY`
   
   > ⚠️ Never put the `service_role` / secret key in the app. It bypasses Row Level Security.

### 3. Set up your `.env`

```bash
cp .env.example .env
```

Edit `.env` with your real values:

```
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run the database schema

In the Supabase Dashboard → **SQL Editor**, paste and run the full contents of
[`supabase/schema.sql`](./supabase/schema.sql).

This creates:
- The `captures` table with all metadata columns
- Row Level Security policies (users can only read/write their own rows)
- Storage policies for the `captures` bucket

### 5. Create the Storage bucket

In the Supabase Dashboard → **Storage**:

1. Click **New bucket**
2. Name: `captures`
3. **Public: OFF** (private — the app uses signed URLs so photos aren't publicly accessible)
4. Click **Save**

The Storage policies are included in `schema.sql` and should apply automatically
once the bucket exists with that exact name.

### 6. Get a Google Static Maps API key (optional)

- Go to https://console.cloud.google.com/google/maps-apis
- Enable "Maps Static API"
- Create an API key, restrict it to your app's bundle ID / package name
- Paste it into `src/screens/CameraScreen.js`:
  ```js
  const GOOGLE_STATIC_MAPS_API_KEY = 'YOUR_KEY_HERE';
  ```
- Note: Google charges per map load past the free tier — check current
  pricing before shipping to production.

### 7. Run the app

```bash
npx expo start
```

Or with a dev build:

```bash
npx expo run:android   # or run:ios
```

---

## How the overlay-burning works

1. `CameraScreen` captures a raw photo via `expo-camera`.
2. Fresh GPS + address data is fetched via `expo-location`.
3. `OverlayCapture` (rendered off-screen) is snapshotted as a transparent
   PNG using `react-native-view-shot`.
4. `react-native-image-marker` stamps that PNG onto the raw photo at full
   resolution, producing the final geotagged image.
5. The result is saved to the gallery via `expo-media-library`; temp files
   are cleaned up afterward.

---

## How the offline upload queue works

After each successful local save, the app attempts to upload the composited
photo to Supabase Storage and insert a metadata row into the `captures` table.

**If the upload fails** (no network, timeout, server error):
1. The capture is added to a persistent queue in `AsyncStorage`
   (key: `@gmc_pending_uploads`).
2. A blue "Pending upload ☁" badge appears on the camera screen.

**Retry happens automatically in two ways:**
- **On app launch** — `useUploadQueue` processes the queue immediately when
  the user opens the app while authenticated.
- **When connectivity is restored** — `NetInfo` fires an event; the hook
  calls `retryPendingUploads()` within seconds of the device going back online.

Each retry attempt reads the local file URI from the queue, checks the file
still exists, uploads it, and removes it from the queue on success. Items
whose local files have been deleted (e.g. user cleared app cache) are
silently discarded.

---

## Known limitations / next steps

- **Video overlay is not implemented yet.** Burning a watermark onto video
  requires FFmpeg (`ffmpeg-kit-react-native`) post-processing, or a native
  frame-processor approach (`react-native-vision-camera`).
- Overlay updates on a 15-second location poll for the live preview; the
  burned-in overlay always uses a fresh GPS fix taken at capture time.
- Map thumbnail requires network access and a valid billed API key.
- Signed URLs for cloud gallery thumbnails expire after 1 hour; the gallery
  must be refreshed after that (pull-to-refresh).
- No background fetch for the upload queue — retries are foreground-only
  (app launch + NetInfo event) to stay within Expo managed workflow limits.

## Suggested v3 roadmap

1. Video capture + FFmpeg overlay burning
2. Custom overlay templates/themes (user-selectable)
3. Settings screen: map style, coordinate format, unit toggle (metric/imperial)
4. Offline reverse-geocoding fallback (cache last known address)
5. Background upload queue with expo-background-fetch

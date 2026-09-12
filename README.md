# OurGpsCam (GPS Map Camera)

A cross-platform React Native (Expo) & Progressive Web App (PWA) that captures photos with a permanent watermark showing live location, address, coordinates, map preview, and timestamp. Captured photos are saved locally and backed up to Supabase with an offline-safe upload queue.

## Features

- **Progressive Web App (PWA)** — Installable on Android, iOS (Add to Home Screen), Windows, and Mac with offline app shell caching and service worker (`sw.js`)
- Live camera preview with a real-time location overlay preview
- GPS coordinates + reverse-geocoded address (city, region, country)
- Formatted date/time with timezone offset
- Static map thumbnail (Google Static Maps API)
- Overlay burned permanently into the saved photo (not just UI)
- Saves final image to the device's photo gallery / local download on web
- **Email/password auth via Supabase Auth**
- **Automatic cloud backup to Supabase Storage after each capture**
- **Offline-safe upload queue** — queues failed uploads and retries on reconnect
- **Cloud gallery tab** — browse all cloud-backed captures with pull-to-refresh
- **Orientation-aware bottom-center watermark** in both portrait and landscape

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
- The `@svcet.ac.in` email restriction trigger on `auth.users`
- Domain-checked Row Level Security policies on `captures`
- Domain-checked Storage policies for the `captures` bucket

### 5. Create the Storage bucket

In the Supabase Dashboard → **Storage**:

1. Click **New bucket**
2. Name: `captures`
3. **Public: OFF** (private — the app uses signed URLs so photos aren't publicly accessible)
4. Click **Save**

The Storage policies are included in `schema.sql` and should apply automatically
once the bucket exists with that exact name.

---

## College Domain Restriction (@svcet.ac.in)

OurGpsCam is an institutional application strictly restricted to Sri Venkateswara College of Engineering and Technology students and staff. Only accounts with an email address ending in `@svcet.ac.in` can create an account, log in, or access cloud storage.

This restriction is enforced across **three distinct defense-in-depth tiers**:

1. **Client-Side Validation (`src/screens/AuthScreen.js`)**:
   - Both Sign In and Sign Up validate that the entered email strictly ends in `@svcet.ac.in` using `email.trim().toLowerCase().endsWith('@' + ALLOWED_EMAIL_DOMAIN.toLowerCase())`.
   - Rejects non-college emails immediately with a friendly inline message without making a network request or leaking account existence.
   - Re-maps any database-level trigger errors to friendly copy.

2. **Server-Side Database Trigger (`supabase/schema.sql`)**:
   - A PostgreSQL `BEFORE INSERT` trigger (`enforce_allowed_email_domain_trigger`) on the `auth.users` table executes `public.enforce_allowed_email_domain()`.
   - If anyone bypasses the client UI and calls the Supabase Auth API directly via curl or SDK, the database rejects the insert with exception code `P0001`.

3. **Row Level Security (RLS) Backstop (`supabase/schema.sql`)**:
   - All 3 table policies on `public.captures` (SELECT, INSERT, DELETE) require `and (auth.jwt() ->> 'email') ilike '%@svcet.ac.in'` alongside `auth.uid() = user_id`.
   - All 3 Storage policies on `storage.objects` for the `captures` bucket require `and (auth.jwt() ->> 'email') ilike '%@svcet.ac.in'` alongside folder ownership.
   - Even if an unauthorized user account somehow existed in the database, it cannot read, write, or delete any photos or metadata.

### How to Change or Extend the Allowed Domain
If the college adds new department domains or changes the domain name:
1. Update `ALLOWED_EMAIL_DOMAIN` in `src/screens/AuthScreen.js`.
2. Update the SQL trigger check `lower(new.email) not like '%@svcet.ac.in'` in `supabase/schema.sql`.
3. Update the RLS policies `(auth.jwt() ->> 'email') ilike '%@svcet.ac.in'` in `supabase/schema.sql`.
4. Re-run the migration section of `supabase/schema.sql` in the Supabase SQL Editor.

### Email Confirmation Recommendation
In your **Supabase Dashboard → Authentication → Providers → Email**, ensure that **"Confirm email"** is turned **ON**.
- Combined with the domain restriction, this ensures that only users who actually have access to the specified `@svcet.ac.in` inbox can verify and activate their account.

---


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

---

## Deploying to Vercel

The codebase is fully optimized for continuous deployment on [Vercel](https://vercel.com).

### 1. Push Code to GitHub
Ensure your repository is pushed to GitHub:
```bash
git push origin main
```

### 2. Import into Vercel
1. Go to [Vercel Dashboard](https://vercel.com/new).
2. Click **Add New** → **Project** and select your GitHub repository (`GPmapcamera`).
3. Vercel automatically detects the pre-configured settings from `vercel.json`:
   - **Framework Preset**: Other / None
   - **Build Command**: `npm run build` (`expo export -p web`)
   - **Output Directory**: `dist`

### 3. Environment Variables (in Vercel Dashboard)
Under **Environment Variables**, add:
| Variable Name | Description | Example |
|---|---|---|
| `SUPABASE_URL` | Your Supabase project URL | `https://xyzcompany.supabase.co` |
| `SUPABASE_ANON_KEY` | Your Supabase Anon public key | `eyJhbGciOi...` |
| `EXPO_PUBLIC_SUPABASE_URL` | Optional alternative for Expo | Same as `SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Optional alternative for Expo | Same as `SUPABASE_ANON_KEY` |

*(If deploying before setting environment variables, the app will safely load with a fallback message rather than crashing.)*

### 4. Click Deploy
Vercel will install dependencies, bundle the web application into `dist/`, and provision global edge caching with immutable asset caching and SPA rewrites.


# Enable Firebase Phone Auth (Kadir AI)

Phone-OTP login via Firebase needs **no business / DLT** — Google delivers the SMS.
The app is already wired: until you add the config below it uses the backend OTP
fallback (incl. the test bypass). Once `google-services.json` is present, the app
auto-switches to Firebase.

## 1. Create the Firebase project + Android app
1. https://console.firebase.google.com → **Add project** (e.g. "Kadir AI").
2. In the project: **Add app → Android**.
   - **Package name:** `ai.kadir.app`  (must match exactly)
   - **App nickname:** Kadir AI
3. **Add SHA certificate fingerprints** (required for phone auth):
   - Get them from your keystore:
     ```
     keytool -list -v -keystore mobile/android/upload-keystore.jks -alias upload
     ```
     (password is in `mobile/android/key.properties`)
   - Add **both SHA-1 and SHA-256** to the Firebase Android app.
   - After you publish, also add Google **Play App Signing** SHA-1/256 (Play Console → Setup → App signing).
4. **Download `google-services.json`** → place it at:
   ```
   mobile/android/app/google-services.json
   ```
   (gitignored; do not commit. The build auto-activates Firebase when it sees this file.)

## 2. Enable Phone sign-in
Firebase Console → **Authentication → Sign-in method → Phone → Enable**.
- Optionally add **test phone numbers** (e.g. +91 99999 00000 → code 123456) for QA without real SMS.

## 3. Backend: let the API verify Firebase tokens
The backend exchanges a Firebase ID token for a Kadir JWT (`POST /v1/auth/firebase`).
It needs a **service account**:
1. Firebase Console → **Project settings → Service accounts → Generate new private key** → downloads a JSON.
2. On **Render → kadir-api → Environment**, add:
   - `FIREBASE_SERVICE_ACCOUNT` = the **entire JSON** on one line.
3. Redeploy. Done.

## 4. Rebuild the app
```
cd mobile
flutter build apk --release --dart-define=API_BASE_URL=https://kadir-api.onrender.com
```
Now the login screen uses Firebase: enter phone → real SMS OTP → verified → Kadir JWT.

## Notes
- **iOS** isn't targeted (Android-only), so no APNs setup needed.
- Firebase phone auth free tier covers generous volume; beyond that it's pay-as-you-go (still no DLT).
- If `google-services.json` is absent, the app silently falls back to backend OTP — so nothing breaks pre-setup.
- Keep the backend `TEST_OTP_PHONE`/`TEST_OTP_CODE` bypass for Play review even after Firebase is live (reviewers can't receive your SMS).

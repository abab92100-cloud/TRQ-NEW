# AB-210-TRQ — بوت تداول عقود KuCoin الآجلة (Android + سيرفر Termux)

تطبيق جوال (Capacitor + React 19 + TS) يعمل بالاتصال المباشر مع سيرفر Node على نفس الجهاز في Termux — مفاتيح KuCoin وأوامر التداول كلها تبقى داخل الجهاز.

## البنية

| المسار | الوصف |
|---|---|
| `src/engine.ts` | محرك التداول — **يُولَّد وقت البناء**: `tools/fetch-engine.sh` يجلب النسخة المثبتة من KING-210 (commit a84b2b11) ويطبق `engine.patch.gz.b64` (إصلاحات الأمان) |
| `engine.patch.gz.b64` | إصلاحات engine.ts مضغوطة (توكن `X-TRQ-Token` + تشفير المفاتيح بـ Android Keystore) |
| `src/ws.ts`, `src/App.tsx`, `src/Chart.tsx`, `src/server-entry.ts`, `src/server-shims.ts` | واجهة + WebSocket KuCoin + سيرفر الأسطول |
| `KingNative.java.gz.b64` | الإضافة الأصلية (wake lock + watchdog + Keystore) — CI يفكها قبل البناء |
| `tools/make-icon.mjs` | مولّد أيقونة AB-210-TRQ (PNG بلا اعتماديات — يشغّله CI) |
| `releases/trg-server.mjs` | السيرفر المجمّع (يُولّد CI) |
| `releases/trg-setup.sh` | إعداد Termux تلقائي (node + wake-lock + watchdog + boot) |
| `.github/workflows/build.yml` | CI: يبني APK ويحدّث `releases/` وينشر Release |

## التشغيل (مطور)

```bash
npm install
npm run dev            # يفك engine.ts تلقائيًا (prebuild) ثم vite
npm run build
npm run build:server
npx cap sync android
```

## Termux (السيرفر على الجوال) — أمر واحد

```bash
cd ~ && curl -fsSL -o trg-setup.sh "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-setup.sh" && bash trg-setup.sh
```

أو يدويًا:

```bash
curl -fsSL -o ~/trg-server.mjs "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-server.mjs"
nohup node ~/trg-server.mjs > ~/trg-server.log 2>&1 &
```

التطبيق يكتشف السيرفر تلقائيًا على `127.0.0.1:9010` (منسّق + 5 محركات على 9011-9015) ويتحول لوضع "السيرفر": سحب `/state` دوري، وأوامر عبر `/cmd` بتوكن `X-TRQ-Token`. المنسّق يمرر توكن الأسطول للمحركات عبر متغير البيئة `ABKING_FLEET_TOKEN` عند إطلاقها.

## الأمان

- `~/.ab-king/*.json` بصلاحيات 0600 + توكن لكل تثبيت؛ `/cmd` تتطلب `X-TRQ-Token`؛ CORS مقيّد؛ السيرفر يستمع على `127.0.0.1` فقط.
- `/state` لا يرسل المفاتيح (مقنّعة •••• + آخر 4 خانات).
- مفاتيح KuCoin على الجهاز مشفرة بـ Android Keystore (AES/GCM).
- Keystore **لا يُرفع للمستودع** — CI يبني APK عبر Secrets: `KING_KEYSTORE_BASE64`, `KING_KEYSTORE_PASSWORD`, `KING_KEY_ALIAS`, `KING_KEY_PASSWORD`.
- الملفات الثنائية (أيقونات/APK/wrapper jar/gradlew) **يولّدها CI** — لا ترفعها يدويًا.

## رابط تحميل الملفات

https://github.com/abab92100-cloud/TRQ-NEW/releases

<!-- build-verification 2026-11-05: signature stability check -->

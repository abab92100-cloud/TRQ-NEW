# TRQ-NEW — بوت تداول عقود KuCoin الآجلة (Android + سيرفر Termux)

تطبيق جوال (Capacitor + React 19 + TS) يعمل مباشرة بالاتصال مع سيرفر Node على نفس الجهاز في Termux — مفاتيح KuCoin وأوامر التداول تبدأ介 dakhl الجهاز.

## البنية

| المسار | الوصف |
|---|---|
| `src/engine.ts` | محرك التداول — **يُولَّد وقت البناء**: `tools/fetch-engine.sh` يجلب النسخة المثبتة من KING-210 (commit a84b2b11) ويطبق `engine.patch.gz.b64` (إصلاحات الأمان) |
| `engine.patch.gz.b64` | إصلاحات engine.ts مضغوطة (توكن `X-TRQ-Token` + تشفير المفاتيح بـ Android Keystore) |
| `src/ws.ts`, `src/App.tsx`, `src/Chart.tsx`, `src/server-entry.ts`, `src/server-shims.ts` | واجهة + WebSocket KuCoin + سيرفر الأسطول |
| `KingNative.java.gz.b64` | اللجن parche (wake lock + watchdog + Keystore) — CI يفك قبل البناء |
| `releases/trg-server.mjs` | السيرفر المجمّع (يُولَّد CI) |
| `releases/trg-setup.sh` | إعداد Termux تلقائي (node + wake-lock + watchdog + boot) |
| `.github/workflows/build.yml` | CI: يبني APK موقّع من Secrets ويحدّث `releases/` |

## التشغيل (مطور)

```bash
npm install
npm run dev            # يفك engine.ts تلقائيًا (prebuild) ثم vite
npm run build
npm run build:server
npx cap sync android
```

## Termux (السيرفر على الجوال)

```bash
bash releases/trg-setup.sh
# أو يدويًا:
curl -sL -o ~/trg-server.mjs "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-server.mjs"
nohup node ~/trg-server.mjs > ~/trg-server.log 2>&1 &
```

التطبيق يكتشف السيرفر تلقائيًا على `127.0.0.1:9010` (منسّق + 5 محركات على 9011-9015) ويتحول لوضع "السيرفر": سحب `/state` كل 1.2 ثانية، أوامر عبر `/cmd` بتوكن `X-TRQ-Token`.

## الأمان

- `~/.ab-king/*.json` بصلاحيات 0600 + توكن لكل تثبيت؛ `/cmd` تتطلب `X-TRQ-Token` وCORS مقيّد؛ `/state` لا يرسل المفاتيح (مقنّعة).
- مفاتيح KuCoin على الجهاز مشفرة بـ Android Keystore (AES/GCM).
- Keystore **لا يُرفع للمستودع** — CI يبني APK عبر Secrets: `KING_KEYSTORE_BASE64`, `KING_KEYSTORE_PASSWORD`, `KING_KEY_ALIAS`, `KING_KEY_PASSWORD`.
- الملفات الثنائية (أيقونات/APK/wrapper jar/gradlew) **يُولَّد CI** من مصادر خارجية — لا ترفعها.

## رابط تحميل الملفات

https://github.com/abab92100-cloud/TRQ-NEW/releases

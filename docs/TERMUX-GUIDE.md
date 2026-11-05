# دليل تشغيل AB-210-TRQ — Termux كامل

## 1) تحميل التطبيق والسيرفر من صفحة Releases
| الملف | الغرض |
|---|---|
| `AB-210-TRQ-latest.apk` | تطبيق الجوال AB-210-TRQ (يثبَّت مباشرة فوق النسخة القديمة) |
| `trg-server.mjs` | سيرفر الأسطول (منسّق + 5 محركات) |
| `trg-setup.sh` | سكربت الإعداد التلقائي (الأمر الواحد) |

## 2) تجهيز Termux مرة واحدة
```bash
pkg update -y
pkg install -y curl nodejs-lts termux-api
```
ثبّت أيضًا من متجر Google: تطبيق **Termux:API** وتطبيق **Termux:Boot** وافتح كلًّا منهما مرة واحدة.

## 3) تشغيل السيرفر (الأمر الواحد)
```bash
cd ~ && curl -fsSL -o trg-setup.sh "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-setup.sh" && bash trg-setup.sh
```
أو يدويًا:
```bash
curl -fsSL -o ~/trg-server.mjs "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-server.mjs"
termux-wake-lock
nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
```

## 4) فحص صحة الأسطول
```bash
curl -fs 127.0.0.1:9010/health          # المنسّق
curl -fs 127.0.0.1:9011/health          # أسطول 1 ... حتى 9015
tail -f ~/trg-server.log
```

## 5) الأوامر عبر /cmd (محمية بتوكن X-TRQ-Token)
سكربت الإعداد يطبع في نهايته أمر `resetAll` جاهزًا بالتوكن. لاستخراج التوكن يدويًا:
```bash
TOK=$(curl -s 127.0.0.1:9010/state | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).token)}catch{}})")
curl -s -X POST 127.0.0.1:9010/cmd -H "Content-Type: application/json" -H "X-TRQ-Token: $TOK" -d '{"action":"saveCfg","cfg":{"ladderMode":true}}'
```

## 6) إيقاف / إعادة تشغيل
```bash
pkill -f trg-server.mjs        # إيقاف
bash ~/trg-setup.sh            # إعادة نظيفة (تقتل القديم وتشغّل الجديد بأمان)
rm -f ~/.ab-king/HALT          # إن وُجد ملف إيقاف طوارئ
```

## 7) مراقبة مستمرة
- التطبيق يعرض حالة الأسطول مباشرة (poll دوري).
- الحارس (watchdog) يفحص 9010 كل 60 ثانية ويعيد التشغيل تلقائيًا، ويلم السجلات إذا تضخمت.
- الإقلاع التلقائي بعد إعادة تشغيل الجهاز: `~/.termux/boot/trg.sh` (يتطلب تطبيق Termux:Boot).
- السجلات: `~/trg-server.log`, `~/trg-watchdog.log`، وحالة كل أسطول في `~/.ab-king/trg-slot-*-store.json` (صلاحيات 0600).
- المنافذ: المنسّق 9010 والمحركات 9011-9015 — لا تمس سيرفرات AB-KING (8787) وTRQ (8987).

## 8) ملاحظات أمان
- `/cmd` محمية بتوكن لكل تثبيت، والسيرفر يستمع على `127.0.0.1` فقط.
- مفاتيح KuCoin لا تظهر في `/state` (مقنّعة) ومشفرة على الجهاز بـ Android Keystore.
- لا تحذف مجلد `~/.ab-king/` — فيه التوكن والمفاتيح والحالة.

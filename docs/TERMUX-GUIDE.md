# دليل تشغيل KING-trading (TRQ-NEW) — Termux كامل

## 1) تحميل التطبيق والسيرفر من صفحة Releases في TRQ-NEW
| الملف | الغرض |
|---|---|
| `KING-trading-latest.apk` | تطبيق الجوال (يثبَّت مباشرة) |
| `trg-server.mjs` | سيرفر الأسطول (منسّق + 5 محركات) |
| `trg-setup.sh` | سكربت الإعداد التلقائي (الأمر الواحد) |

## 2) تجهيز Termux مرة واحدة
```bash
pkg update -y
pkg install -y curl nodejs termux-api
```

## 3) تشغيل السيرفر (الأمر الواحد)
```bash
cd ~ && curl -sL -o trg-setup.sh "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-setup.sh" && bash trg-setup.sh
```
أو يدويًا:
```bash
curl -sL -o ~/trg-server.mjs "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-server.mjs"
termux-wake-lock
nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
```

## 4) فحص صحة الأسطول
```bash
curl -s 127.0.0.1:9010/health          # المنسّق
curl -s 127.0.0.1:9011/health          # أسطول 1 ... حتى 9015
tail -f ~/trg-server.log
```

## 5) الأوامر عبر /cmd (محمية بتوكن)
```bash
TOK=$(curl -s 127.0.0.1:9010/state | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST 127.0.0.1:9010/cmd -H "Content-Type: application/json" -H "X-TRQ-Token: $TOK" -d '{"action":"saveCfg","cfg":{"ladderMode":true}}'
```

## 6) إيقاف / إعادة تشغيل
```bash
pkill -f trg-server.mjs        # إيقاف
bash ~/trg-setup.sh            # إعادة نظيفة
rm -f ~/.ab-king/HALT          # إن وُجد ملف إيقاف طوارئ
```

## 7) مراقبة مستمرة
- التطبيق يعرض حالة الأسطول مباشرة (poll كل 1.2 ثانية).
- الحارس (watchdog) يفحص 9010 كل 60 ثانية ويعيد التشغيل تلقائيًا.
- الإقلاع التلقائي بعد إعادة تشغيل الجهاز: `~/.termux/boot/trg.sh`.
- السجلات: `~/trg-server.log`, `~/trg-watchdog.log`, وحالة كل أسطول في `~/.ab-king/trg-slot-*-store.json` (صلاحيات 0600).
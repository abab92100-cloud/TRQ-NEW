#!/data/data/com.termux/files/usr/bin/bash
# ================================================================
# AB-210-TRQ — أداة تشخيص سيرفر الأسطول v2 (تقرير + إقلاع + فحص بقاء)
# ================================================================
echo "═══ تشخيص سيرفر AB-210-TRQ ═══"
date '+%F %T'
echo "Node: $(node -v 2>/dev/null || echo 'غير مثبت')"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null && echo "✓ قفل اليقظة مفعّل" || echo "! termux-api غير متوفر"

echo "── 1) المنافذ الآن ──"
for p in 9010 9011 9012 9013 9014 9015; do
  if curl -fs --max-time 3 "127.0.0.1:$p/health" >/dev/null 2>&1; then echo "  ✓ منفذ $p حيّ"; else echo "  ✗ منفذ $p لا يرد"; fi
done
curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1 && { echo "═══ ✓ السيرفر يعمل — افتح التطبيق وانتظر 10 ثوانٍ ═══"; exit 0; }

echo "── 2) ملف السيرفر ──"
if [ ! -f ~/trg-server.mjs ]; then
  echo "✗ الملف غير موجود — نفّذ سكربت الإعداد:"
  echo "  curl -sL https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-setup.sh | bash"
  exit 1
fi
echo "النسخة: $(grep -o 'AB-210-TRQ-[0-9.]*' ~/trg-server.mjs | head -1)"
node --check ~/trg-server.mjs 2>/dev/null && echo "✓ الملف سليم" || { echo "✗ الملف تالف"; exit 1; }

echo "── 3) سبب التعطل السابق من السجل ──"
[ -f ~/trg-server.log ] && grep -aiE "error|fatal|throw|exception|ENOENT|EADDR|EACCES|Cannot|SyntaxError" ~/trg-server.log 2>/dev/null | tail -5 || echo "(لا سجل)"

echo "── 4) إقلاع جديد (انتظر حتى 25 ثانية — لا تغلق Termux) ──"
nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
OK=""
for i in $(seq 1 10); do
  sleep 2.5
  curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1 && { OK=1; break; }
done

echo "── 5) فحص البقاء 40 ثانية (لا تغلق Termux ولا تطفئ الشاشة) ──"
SURVIVED=""
for i in $(seq 1 8); do
  sleep 5
  curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1 && SURVIVED=1 || { SURVIVED=""; break; }
  echo "  ... $((40 - i*5)) ثانية"
done

if [ "$SURVIVED" = "1" ]; then
  ENGINES=0
  for p in 9011 9012 9013 9014 9015; do
    curl -fs --max-time 3 "127.0.0.1:$p/health" >/dev/null 2>&1 && ENGINES=$((ENGINES+1))
  done
  echo ""
  echo "═══════════════════════════════════════"
  echo "النتيجة: السيرفر يعمل وثابت ($ENGINES/5 محركات)"
  echo "افتح تطبيق AB-210-TRQ الآن وانتظر 10 ثوانٍ — ستظهر حبة «سيرفر»"
  echo "═══════════════════════════════════════"
  echo "ثم فورًا لمنع انطفائه لاحقًا:"
  echo "  1) اسحب إشعار Termux ← اضغط زر Acquire WakeLock"
  echo "  2) إعدادات أندرويد ← التطبيقات ← Termux ← البطارية ← «غير مقيّد»"
  echo "  3) لا تغلق Termux من «التطبيقات الأخيرة» أبدًا"
  exit 0
else
  echo ""
  echo "═══════════════════════════════════════"
  echo "النتيجة: السيرفر انطفى بعد الإقلاع — سبب التعطل:"
  echo "═══════════════════════════════════════"
  tail -n 15 ~/trg-server.log 2>/dev/null
  echo "── صوّر هذه الشاشة كاملة وأرسلها ──"
  exit 1
fi

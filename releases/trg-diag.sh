#!/data/data/com.termux/files/usr/bin/bash
# ================================================================
# AB-210-TRQ — أداة تشخيص سيرفر الأسطول (تقرير + إصلاح تلقائي)
# تعمل حتى لو كان السيرفر متوقفًا — تعرض السبب ثم تحاول الإقلاع
# ================================================================
echo "═══ تشخيص سيرفر AB-210-TRQ ═══"
date '+%F %T'
echo "Node: $(node -v 2>/dev/null || echo 'غير مثبت')"
echo "المساحة الحرة: $(df -h ~ 2>/dev/null | tail -1 | awk '{print $4}')"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock 2>/dev/null && echo "✓ قفل اليقظة مفعّل" || echo "! termux-api غير متوفر — ثبّت تطبيق Termux:API وافتحه مرة"

echo "── 1) حالة العمليات والمنافذ ──"
RUN=$(pgrep -f trg-server.mjs 2>/dev/null | wc -l)
echo "عمليات السيرفر النشطة: $RUN"
for p in 9010 9011 9012 9013 9014 9015; do
  if curl -fs --max-time 3 "127.0.0.1:$p/health" >/dev/null 2>&1; then echo "  ✓ منفذ $p حيّ"; else echo "  ✗ منفذ $p لا يرد"; fi
done
for p in 8787 8987; do
  curl -fs --max-time 2 "127.0.0.1:$p/health" >/dev/null 2>&1 && echo "  (ملاحظة: سيرفر AB-KING القديم على $p يعمل)"
done

if curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1; then
  echo "═══ ✓ السيرفر يعمل الآن — افتح تطبيق AB-210-TRQ (سيتصل خلال ثوانٍ) ═══"
  exit 0
fi

echo "── 2) وجود ملف السيرفر ونسخته ──"
if [ ! -f ~/trg-server.mjs ]; then
  echo "✗ ملف ~/trg-server.mjs غير موجود — نفّذ سكربت الإعداد:"
  echo "  curl -sL https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-setup.sh | bash"
  exit 1
fi
echo "النسخة: $(grep -o 'AB-210-TRQ-[0-9.]*' ~/trg-server.mjs | head -1)"
node --check ~/trg-server.mjs 2>/dev/null && echo "✓ الملف سليم" || { echo "✗ الملف تالف — أعد تشغيل سكربت الإعداد"; exit 1; }

echo "── 3) سبب التعطل من السجل (إن وُجد) ──"
[ -f ~/trg-server.log ] && grep -aiE "error|fatal|throw|exception|ENOENT|EADDR|EACCES|Cannot|SyntaxError" ~/trg-server.log 2>/dev/null | tail -6 || echo "(لا يوجد سجل سابق)"
[ -f ~/trg-server.log ] && { echo "── آخر 6 أسطر من السجل ──"; tail -n 6 ~/trg-server.log; }

echo "── 4) إقلاع جديد الآن ──"
nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
echo "انتظار حتى 25 ثانية..."
OK=""
for i in $(seq 1 10); do
  sleep 2.5
  if curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1; then OK=1; break; fi
done
ENGINES=0
[ -n "$OK" ] && for p in 9011 9012 9013 9014 9015; do
  curl -fs --max-time 3 "127.0.0.1:$p/health" >/dev/null 2>&1 && ENGINES=$((ENGINES+1))
done

if [ -n "$OK" ]; then
  echo "═══ ✓ انطلق السيرفر ($ENGINES/5 محركات) — افتح التطبيق الآن ═══"
  echo "مهم: إعدادات أندرويد ← التطبيقات ← Termux ← البطارية ← «غير مقيّد»"
  echo "بدونها سيقتل أندرويد السيرفر بعد دقائق من إطفاء الشاشة"
  exit 0
else
  echo "═══ ✗ لم ينطلق السيرفر — صوّر هذه الشاشة كاملة وأرسلها ═══"
  echo "── آخر 15 سطرًا من السجل ──"
  tail -n 15 ~/trg-server.log 2>/dev/null
  exit 1
fi

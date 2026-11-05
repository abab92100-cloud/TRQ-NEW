#!/data/data/com.termux/files/usr/bin/bash
# ================================================================
# AB-210-TRQ — إعداد سيرفر الأسطول في Termux (أمر واحد مستقل)
# · سيرفر الأسطول: منسّق + 5 محركات، كل عملية بمحرك مستقل
# · المنسّق على 9010 والمحركات على 9011-9015 — لا يمس سيرفرات
#   AB-KING (8787) وTRQ (8987) إطلاقًا
# · حارس ذاتي يفحص الأسطول كل 60 ثانية ويعيد تشغيله عند انقطاعه
# · إعادة تشغيل تلقائية بعد إعادة تشغيل الجهاز (Termux:Boot)
# · الحالة والمفاتيح في ~/.ab-king/ (صلاحيات 0600) — لا تحذفها
# ================================================================
set -e
echo "═══ AB-210-TRQ — إعداد سيرفر الأسطول ═══"

# 1) التحقق من بيئة Termux
if [ ! -d "/data/data/com.termux" ]; then
  echo "✗ هذا السكربت مخصص لـ Termux على أندرويد فقط"
  exit 1
fi

# 2) Node.js (يتطلب 18 أو أحدث)
if ! command -v node >/dev/null 2>&1; then
  echo "• تثبيت Node.js..."
  pkg install nodejs -y
fi
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ إصدار Node قديم جدًا ($(node -v)) — السيرفر يتطلب 18 أو أحدث"
  echo "  نفّذ: pkg upgrade -y && pkg install nodejs -y ثم أعد المحاولة"
  exit 1
fi
echo "✓ Node $(node -v)"

# 3) termux-api (لقفل اليقظة)
if ! command -v termux-wake-lock >/dev/null 2>&1; then
  pkg install termux-api -y >/dev/null 2>&1 || true
fi
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock >/dev/null 2>&1 && echo "✓ قفل اليقظة مفعّل" || true
else
  echo "! حزمة termux-api غير مثبتة — قد يقتل أندرويد السيرفر عند سكون الشاشة"
  echo "  نفّذ: pkg install termux-api -y ثم ثبّت تطبيق Termux:API من المتجر"
fi

# 4) تحميل أحدث سيرفر — مع تحقق إلزامي قبل تشغيله
echo "• تحميل أحدث سيرفر AB-210-TRQ..."
if ! curl -fsSL -o ~/trg-server.mjs.new "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-server.mjs?t=$(date +%s)"; then
  echo "✗ فشل تحميل السيرفر — تحقق من اتصال الإنترنت وأعد المحاولة"
  [ -f ~/trg-server.mjs ] && echo "  (النسخة القديمة ~/trg-server.mjs ما زالت موجودة ولم تُمسس)"
  exit 1
fi
if ! node --check ~/trg-server.mjs.new >/dev/null 2>&1; then
  echo "✗ الملف المُحمّل تالف أو غير سليم — أوقفت الإعداد حفاظًا على نسختك الحالية"
  rm -f ~/trg-server.mjs.new
  exit 1
fi
mv -f ~/trg-server.mjs.new ~/trg-server.mjs
echo "✓ سيرفر AB-210-TRQ محدّث ومُتحقق منه"

# 5) إيقاف أي نسخة قديمة (منسّق + 5 محركات)
echo "• إيقاف أي نسخة قديمة (منسّق + 5 محركات)..."
pkill -f trg-server.mjs 2>/dev/null || true
sleep 2
if pgrep -f trg-server.mjs >/dev/null 2>&1; then
  pkill -9 -f trg-server.mjs 2>/dev/null || true
  sleep 2
fi

# 6) تأكيد أن المنافذ 9010-9015 حرة
for port in 9010 9011 9012 9013 9014 9015; do
  if curl -fs --max-time 2 "127.0.0.1:$port/health" >/dev/null 2>&1; then
    echo "! المنفذ $port لا يزال مشغولًا"
    if command -v fuser >/dev/null 2>&1; then
      fuser -k "$port/tcp" 2>/dev/null || true
      sleep 1
    else
      echo "  أوقف العملية التي تشغّله يدويًا ثم أعد المحاولة"
    fi
  fi
done
sleep 1

# 7) تقليم السجلات إذا تضخمت (تبقى آخر 2000 سطر)
if [ -f ~/trg-server.log ] && [ "$(wc -c < ~/trg-server.log)" -gt 5000000 ]; then
  tail -n 2000 ~/trg-server.log > ~/trg-server.log.tmp && mv ~/trg-server.log.tmp ~/trg-server.log
fi
[ -f ~/trg-watchdog.log ] && [ "$(wc -c < ~/trg-watchdog.log)" -gt 1000000 ] && \
  { tail -n 500 ~/trg-watchdog.log > ~/trg-watchdog.log.tmp && mv ~/trg-watchdog.log.tmp ~/trg-watchdog.log; } || true

# 8) تشغيل الأسطول الآن — السيرفر أولًا ثم الحارس
nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
echo "• انطلاق الأسطول..."

# 9) انتظار صحة المنسّق (حتى 60 ثانية) + عدّ المحركات
OK=""
for i in $(seq 1 20); do
  if curl -fs --max-time 5 "127.0.0.1:9010/health" >/dev/null 2>&1; then
    OK=1
    break
  fi
  sleep 3
done
if [ -z "$OK" ]; then
  echo "✗ المنسّق لم يستجب خلال 60 ثانية — آخر 20 سطرًا من السجل:"
  tail -n 20 ~/trg-server.log 2>/dev/null || true
  exit 1
fi
echo "✓ المنسّق يعمل على 9010"
sleep 3
ENGINES=0
for port in 9011 9012 9013 9014 9015; do
  curl -fs --max-time 5 "127.0.0.1:$port/health" >/dev/null 2>&1 && ENGINES=$((ENGINES+1))
done
echo "✓ $ENGINES/5 محركات حية (قد تحتاج المحركات ثوانٍ إضافية للإقلاع)"

# 10) الحارس الذاتي — يفحص المنسّق كل 60 ثانية ويعيد التشغيل عند انقطاعه
cat > ~/trg-watchdog.sh <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
# حارس AB-210-TRQ: يفحص منفذ 9010 ويعيد تشغيل الأسطول إذا لم يرد
while true; do
  if ! curl -fs --max-time 8 127.0.0.1:9010/health >/dev/null 2>&1; then
    echo "[$(date '+%F %T')] أسطول AB-210-TRQ لا يرد — إعادة تشغيل فورية" >> ~/trg-watchdog.log
    termux-wake-lock 2>/dev/null
    pgrep -f trg-server.mjs >/dev/null 2>&1 && pkill -f trg-server.mjs
    sleep 2
    nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
  else
    termux-wake-lock 2>/dev/null
  fi
  # تقليم السجلات إذا تضخمت
  [ -f ~/trg-server.log ] && [ "$(wc -c < ~/trg-server.log)" -gt 5000000 ] && \
    { tail -n 2000 ~/trg-server.log > ~/trg-server.log.tmp && mv ~/trg-server.log.tmp ~/trg-server.log; } || true
  [ -f ~/trg-watchdog.log ] && [ "$(wc -c < ~/trg-watchdog.log)" -gt 1000000 ] && \
    { tail -n 500 ~/trg-watchdog.log > ~/trg-watchdog.log.tmp && mv ~/trg-watchdog.log.tmp ~/trg-watchdog.log; } || true
  sleep 60
done
EOF
chmod +x ~/trg-watchdog.sh
if pgrep -f trg-watchdog.sh >/dev/null 2>&1; then
  pkill -f trg-watchdog.sh || true
  sleep 1
fi
nohup bash ~/trg-watchdog.sh >/dev/null 2>&1 &
echo "✓ حارس AB-210-TRQ يعمل — يفحص الأسطول كل 60 ثانية"

# 11) الإقلاع التلقائي بعد إعادة تشغيل الجهاز (يتطلب تطبيق Termux:Boot)
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/trg.sh <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock 2>/dev/null || true
if ! pgrep -f trg-server.mjs >/dev/null 2>&1; then
  nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
fi
if ! pgrep -f trg-watchdog.sh >/dev/null 2>&1; then
  nohup bash ~/trg-watchdog.sh >/dev/null 2>&1 &
fi
EOF
chmod +x ~/.termux/boot/trg.sh
echo "✓ الإقلاع التلقائي مُجهّز (ثبّت تطبيق Termux:API وTermux:Boot وافتحهما مرة واحدة)"

# 12) ملخص نهائي
echo ""
echo "═══ تم — أسطول AB-210-TRQ يعمل ═══"
echo "المنسّق: curl -s 127.0.0.1:9010/health"
echo "السجلات: tail -f ~/trg-server.log"
TOK=$(curl -s --max-time 8 "127.0.0.1:9010/state" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const j=JSON.parse(d);console.log(j.token||'')}catch{console.log('')}})" 2>/dev/null || true)
if [ -n "$TOK" ]; then
  echo ""
  echo "لمسح بيانات الأسطول القديمة (اختياري — أمر جاهز بالتوكن):"
  echo "curl -s -X POST 127.0.0.1:9010/cmd -H 'Content-Type: application/json' -H 'X-TRQ-Token: $TOK' -d '{\"action\":\"resetAll\"}'"
fi
echo ""
echo "⚠️ ثبّت أحدث APK (AB-210-TRQ) على الجوال — الواجهة القديمة لا تعرض الأسطول"

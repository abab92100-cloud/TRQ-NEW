#!/data/data/com.termux/files/usr/bin/bash
# ================================================================
# KING-trading (TRQ-NEW) — إعداد سيرفر الأسطول في Termux (أمر مستقل تمامًا)
# · سيرفر الأسطول: منسّق + 5 محركات، كل عميلة بمحركها
# · يعمل على منفذ 9010 (محركات على 9011-9015) — لا ي clash مع AB-KING (8787) أو TRQ (8987)
# · حارس ذاتي يفحص الأسطول كل 60 ثانية
# · إقلاع تلقائي بعد إعادة تشغيل الجوال (مدخل boot خاص)
# ================================================================
set -e
echo "══ KING-trading — إعداد سيرفر الأسطول ══"

# 1) Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "• تثبيت Node.js..."
  pkg install nodejs -y
fi
echo "✓ Node $(node -v)"

# 2) أحدث نسخة من سيرفر الأسطول من مستودع TRQ-NEW
curl -sL -o ~/trg-server.mjs "https://raw.githubusercontent.com/abab92100-cloud/TRQ-NEW/main/releases/trg-server.mjs?t=$(date +%s)"
echo "✓ سيرفر الأسطول Trampoline محدّث"

# 3) قفل اليقظة
termux-wake-lock 2>/dev/null && echo "✓ قفل اليقظة مفعّل" || true

# 4) حارس ذاتي — يفحص المنفذ 9010 فقط ولا يلمس أي سيرفر آخر
cat > ~/trg-watchdog.sh <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
while true; do
  if ! curl -s --max-time 8 127.0.0.1:9010/health >/dev/null 2>&1; then
    echo "[$(date '+%H:%M:%S')] الأسطول لا يرد — إعادة تشغيل" >> ~/trg-watchdog.log
    termux-wake-lock 2>/dev/null
    pgrep -f trg-server.mjs >/dev/null 2>&1 && pkill -f trg-server.mjs
    sleep 2
    nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
  else
    termux-wake-lock 2>/dev/null
  fi
  sleep 60
done
EOF
chmod +x ~/trg-watchdog.sh
pgrep -f trg-watchdog.sh >/dev/null 2>&1 && pkill -f trg-watchdog.sh || true
sleep 1
nohup bash ~/trg-watchdog.sh >/dev/null 2>&1 &
echo "✓ حارس الأسطول يعمل — يفحص كل 60 ثانية"

# 5) إقلاع تلقائي خاص (مدخل مستقل)
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/trg.sh <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
pgrep -f trg-server.mjs >/dev/null 2>&1 || nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
pgrep -f trg-watchdog.sh >/dev/null 2>&1 || nohup bash ~/trg-watchdog.sh >/dev/null 2>&1 &
EOF
chmod +x ~/.termux/boot/trg.sh
echo "✓ إقلاع تلقائي جاهز (Termux:Boot)"

# 6) تشغيل الأسطول الآن
pkill -f trg-server.mjs 2>/dev/null || true
sleep 2
for port in 9010 9011 9012 9013 9014 9015; do
  curl -s --max-time 2 127.0.0.1:$port/health >/dev/null 2>&1 && { echo "! المنفذ $port لا يزال busy"; fuser -k $port/tcp 2>/dev/null || true; sleep 1; }
done
sleep 1
nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
echo "✓ الأسطول انطلق — المنسّق على 9010 ومحركاته على 9011-9015"

# 7) فحص떴litz
sleep 4
H=$(curl -s --max-time 8 127.0.0.1:9010/health)
echo "$H"
echo ""
echo "══ تم — الأسطول يعمل ══"
echo "⚠️ تحذير: قبل مسح البيانات_oldWER، ثبّت أحدث APK على الجوال (الجهاز القديم يُ recenser المفاتيح الجديدة)"

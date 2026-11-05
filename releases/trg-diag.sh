#!/data/data/com.termux/files/usr/bin/bash
# ================================================================
# AB-210-TRQ — تشخيص شامل v3: تقرير + إصلاح تلقائي + إرسال التقرير للمطور
# ================================================================
R=/tmp/trg-report.txt
: > "$R"
log() { echo "$@"; echo "$@" >> "$R"; }

log "═══ تقرير تشخيص AB-210-TRQ v3 ═══"
log "التاريخ: $(date '+%F %T')"
log "Node: $(node -v 2>/dev/null || echo 'غير مثبت') | المسار: $(command -v node || echo '-')"
log "أندرويد: $(/system/bin/getprop ro.build.version.release 2>/dev/null || echo '?') (API $(/system/bin/getprop ro.build.version.sdk 2>/dev/null || echo '?')) | الجهاز: $(/system/bin/getprop ro.product.model 2>/dev/null || echo '?')"
log "المساحة الحرة: $(df -h ~ 2>/dev/null | tail -1 | awk '{print $4 " متاح من " $2}')"
command -v termux-battery-status >/dev/null 2>&1 && log "البطارية: $(termux-battery-status 2>/dev/null | head -c 200)" || log "البطارية: (Termux:API غير مثبت)"
command -v termux-wake-lock >/dev/null 2>&1 && { termux-wake-lock 2>/dev/null && log "قفل اليقظة: مفعّل ✓" || log "قفل اليقظة: فشل الأمر (ثبّت تطبيق Termux:API)"; } || log "قفل اليقظة: غير متوفر"

log ""
log "── المنافذ ──"
for p in 9010 9011 9012 9013 9014 9015 8787 8987; do
  if curl -fs --max-time 3 "127.0.0.1:$p/health" >/dev/null 2>&1; then log "منفذ $p: حي ✓"; else log "منفذ $p: لا يرد"; fi
done

if curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1; then
  log ""
  log "صحة المنسّق: $(curl -s --max-time 3 127.0.0.1:9010/health)"
  log ""
  log "═══ النتيجة: السيرفر يعمل الآن ═══"
  echo "═══ ✓ السيرفر يعمل — افتح التطبيق وانتظر 10 ثوانٍ ═══"
  FINAL="يعمل"
else
  log ""
  log "── ملف السيرفر ──"
  if [ ! -f ~/trg-server.mjs ]; then
    log "✗ ~/trg-server.mjs غير موجود"
    echo "✗ ملف السيرفر غير موجود — نفّذ سكربت الإعداد"
    FINAL="لا يوجد ملف"
  else
    log "النسخة: $(grep -o 'AB-210-TRQ-[0-9.]*' ~/trg-server.mjs | head -1) | الحجم: $(wc -c < ~/trg-server.mjs) بايت | md5: $(md5sum ~/trg-server.mjs 2>/dev/null | awk '{print $1}')"
    node --check ~/trg-server.mjs 2>&1 >/dev/null && log "node --check: سليم ✓" || log "node --check: تالف ✗"

    log ""
    log "── أخطاء السجل السابق ──"
    [ -f ~/trg-server.log ] && grep -aiE "error|fatal|throw|exception|ENOENT|EADDR|EACCES|Cannot|SyntaxError|TypeError|ReferenceError" ~/trg-server.log 2>/dev/null | tail -10 >> "$R" || log "(لا سجل)"
    log ""
    log "── آخر 20 سطرًا من سجل السيرفر ──"
    [ -f ~/trg-server.log ] && tail -n 20 ~/trg-server.log >> "$R" || log "(لا سجل)"

    echo "── إقلاع جديد (انتظر حتى 30 ثانية — لا تغلق Termux) ──"
    : >> ~/trg-server.log
    echo "=== [$(date '+%F %T')] محاولة إقلاع من التشخيص ===" >> ~/trg-server.log
    nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
    OK=""
    for i in $(seq 1 12); do
      sleep 2.5
      curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1 && { OK=1; break; }
    done

    if [ -z "$OK" ] && ! pgrep -f trg-server.mjs >/dev/null 2>&1; then
      log ""
      log "── الإقلاع فشل: آخر 15 سطرًا بعد المحاولة ──"
      tail -n 15 ~/trg-server.log >> "$R"
      log ""
      log "الإصلاح التلقائي: نسخ حالة الأسطول القديمة احتياطيًا وإقلاع بحالة نظيفة..."
      B=~/.ab-king/trg-backup-$(date '+%s')
      mkdir -p "$B" 2>/dev/null
      for f in ~/.ab-king/trg-server-store.json ~/.ab-king/trg-slot-*.json; do
        [ -f "$f" ] && mv "$f" "$B/" 2>/dev/null
      done
      log "نُسخت الملفات إلى: $B"
      nohup node ~/trg-server.mjs >> ~/trg-server.log 2>&1 &
      for i in $(seq 1 12); do
        sleep 2.5
        curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1 && { OK=1; break; }
      done
      [ -n "$OK" ] && log "✓ الإقلاع نجح بعد تنظيف الحالة القديمة (ستحتاج لإعادة إدخال مفاتيح API من التطبيق)"
    fi

    if [ -n "$OK" ]; then
      echo "── فحص البقاء 40 ثانية (لا تغلق Termux) ──"
      log ""
      log "── فحص البقاء 40 ثانية ──"
      SURVIVED=1
      for i in $(seq 1 8); do
        sleep 5
        curl -fs --max-time 3 "127.0.0.1:9010/health" >/dev/null 2>&1 || { SURVIVED=""; break; }
        echo "  ... $((40 - i*5))"
      done
      if [ "$SURVIVED" = "1" ]; then
        ENGINES=0
        for p in 9011 9012 9013 9014 9015; do
          curl -fs --max-time 3 "127.0.0.1:$p/health" >/dev/null 2>&1 && ENGINES=$((ENGINES+1))
        done
        log "═══ النتيجة: السيرفر انطلق وثابت 40 ثانية ($ENGINES/5 محركات) ═══"
        log "ملاحظة: إن لم يتصل التطبيق رغم هذا، فالمشكلة في اكتشاف التطبيق وليس في السيرفر"
        echo ""
        echo "═════════════════════════════════════"
        echo "النتيجة: السيرفر يعمل وثابت ($ENGINES/5)"
        echo "افتح التطبيق الآن وانتظر 10 ثوانٍ"
        echo "═════════════════════════════════════"
        FINAL="يعمل وثابت ($ENGINES/5)"
      else
        log "═══ النتيجة: السيرفر انطفى خلال 40 ثانية من الإقلاع ═══"
        tail -n 20 ~/trg-server.log >> "$R"
        echo ""
        echo "النتيجة: السيرفر انطفى بعد الإقلاع"
        FINAL="ينطفئ بعد الإقلاع"
      fi
    else
      log "═══ النتيجة: السيرفر لم ينطلق إطلاقًا ═══"
      tail -n 20 ~/trg-server.log >> "$R"
      echo ""
      echo "النتيجة: السيرفر لم ينطلق"
      FINAL="لم ينطلق"
    fi
  fi
fi

log ""
log "── عمليات node النشطة ──"
ps -ef 2>/dev/null | grep -a "trg-server\|node" | grep -av grep >> "$R" || log "(لا عمليات)"
log ""
log "══════ نهاية التقرير ══════"

# حجب أي سطر يحتمل توكن أو مفاتيح
sed -i -E 's/.*([Tt]oken|apiKey|api_key|secret|password).*/[سطر محجوب للأمان]/' "$R" 2>/dev/null

URL=$(curl -s -m 20 --data-urlencode "content@$(echo $R)" --data "lexer=_text&format=url&expires=604800" https://dpaste.org/api/ 2>/dev/null | tr -d '\r\n')
echo ""
if [ -n "$URL" ] && echo "$URL" | grep -qa "https://"; then
  echo "═════════════════════════════════════"
  echo "تم إرسال التقرير الكامل للمطور ✓"
  echo "أرسل هذا الرابط في المحادثة:"
  echo "$URL"
  echo "═════════════════════════════════════"
else
  echo "تعذّر إرسال التقرير تلقائيًا — صوّر الشاشة كاملة وأرسلها"
fi

// ==========================================
// منطق قسم التوقع
// ==========================================

let sessionState = {
  active: false,
  currentRound: null,
  currentItem: null,
  currentHour: null,
  currentMinute: null,
  currentDay: null,
  currentDate: null,
  pendingPrediction: null,
  correctCount: 0,
  totalCount: 0,
  learningEnabled: true
};

// تحديث حالة التعلم في الواجهة
async function refreshLearningStatus() {
  const lr = await DB.get('app_settings', 'learning_enabled');
  sessionState.learningEnabled = lr ? lr.value !== false : true;
  const el = document.getElementById('learning-status');
  if (el) {
    el.innerText = sessionState.learningEnabled ? 'مفعّل' : 'موقوف';
    el.style.color = sessionState.learningEnabled ? '#2ecc71' : '#e74c3c';
  }
}

// تهيئة قسم التوقع
async function initPrediction() {
  await refreshLearningStatus();

  // جلب اليوم والتاريخ من آخر حزمة
  const packages = await DB.getAll('packages');
  if (packages.length > 0) {
    const last = packages[packages.length - 1];
    sessionState.currentDay = last.day;
    sessionState.currentDate = last.date;
  }
}

// تحديث قائمة العناصر المعروفة في الـ datalist
async function refreshKnownItemsDatalist() {
  const rounds = await DB.getAll('rounds');
  const items = [...new Set(rounds.map(r => r.item_name))].filter(Boolean);
  const datalist = document.getElementById('known-items');
  if (datalist) datalist.innerHTML = '';
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        datalist.appendChild(opt);
    });
}

// بدء الجلسة
async function handleStartSession() {
  const roundVal = document.getElementById('pred-round').value.trim();
  const itemVal = document.getElementById('pred-item').value.trim();
  const hourVal = document.getElementById('pred-hour').value.trim();
  const minuteVal = document.getElementById('pred-minute').value.trim();

  if (!roundVal) { alert('رقم الجولة إجباري'); return; }
  if (!itemVal) { alert('اسم العنصر إجباري'); return; }

  await refreshLearningStatus();

  sessionState.active = true;
  const roundNum = parseInt(roundVal, 10);
        if (!Number.isInteger(roundNum) || roundNum < 1) {
            alert('رقم الجولة يجب أن يكون رقماً صحيحاً موجباً');
            return;
        }
        let hourNum = null;
        if (hourVal !== '') {
            hourNum = parseInt(hourVal, 10);
            if (!Number.isInteger(hourNum) || hourNum < 0 || hourNum > 23) {
                alert('الساعة يجب أن تكون بين 0 و 23');
                return;
            }
        }
        let minuteNum = null;
        if (minuteVal !== '') {
            minuteNum = parseInt(minuteVal, 10);
            if (!Number.isInteger(minuteNum) || minuteNum < 0 || minuteNum > 59) {
                alert('الدقيقة يجب أن تكون بين 0 و 59');
                return;
            }
        }
        
        sessionState.currentRound = roundNum;
        sessionState.currentItem = itemVal;
        sessionState.currentHour = hourNum;
        sessionState.currentMinute = minuteNum;
  sessionState.pendingPrediction = null;
  sessionState.correctCount = 0;
  sessionState.totalCount = 0;

  await _generateNextPrediction();
}

// توليد التوقع التالي
async function _generateNextPrediction() {
  await refreshLearningStatus();

  const result = await Analysis.predict({
    round_number: sessionState.currentRound,
    item_name: sessionState.currentItem,
    hour: sessionState.currentHour,
    minute: sessionState.currentMinute,
    day: sessionState.currentDay,
    date: sessionState.currentDate
  });

  if (!result || !result.predicted_item) {
    alert('لا توجد بيانات كافية. أضف المزيد من الجولات في قسم البيانات أولاً.');
    handleStopSession();
    return;
  }

  sessionState.pendingPrediction = {
    round_number: sessionState.currentRound + 1,
    predicted_item: result.predicted_item,
    breakdown: result.breakdown || {}
  };

  // عرض التوقع
  document.getElementById('prediction-round-num').innerText = sessionState.pendingPrediction.round_number;
  document.getElementById('prediction-item-name').innerText = result.predicted_item;
  document.getElementById('prediction-result').classList.remove('hidden');

  // أزرار حسب وضع التعلم
  if (sessionState.learningEnabled) {
    document.getElementById('feedback-buttons').classList.remove('hidden');
    document.getElementById('next-buttons').classList.add('hidden');
  } else {
    document.getElementById('feedback-buttons').classList.add('hidden');
    document.getElementById('next-buttons').classList.remove('hidden');
  }
}

// الحصول على البعد الأعلى مساهمة في التوقع
function _getTopDimension(breakdown) {
  const keys = Object.keys(breakdown || {});
  if (keys.length === 0) return null;
  return keys.reduce((a, b) => breakdown[a] > breakdown[b] ? a : b);
}

// حفظ نتيجة توقع في السجلات والبيانات
async function _savePredictionOutcome(predicted, actual, isCorrect) {
  await DB.add('predictions_log', {
    predicted_round: predicted.round_number,
    predicted_item: predicted.predicted_item,
    actual_item: actual,
    is_correct: isCorrect,
    created_at: Date.now()
  });

  // [FIX-B1] تم إيقاف إضافة التوقعات إلى rounds لمنع تلوث البيانات
}

// معالجة زر "صح"
async function handleCorrect() {
  if (!sessionState.pendingPrediction) return;
  const pred = sessionState.pendingPrediction;

  sessionState.correctCount++;
  sessionState.totalCount++;

  await _savePredictionOutcome(pred, pred.predicted_item, true);
  await refreshKnownItemsDatalist();

  const topDim = _getTopDimension(pred.breakdown);
  if (topDim) await Analysis._updateWeight(topDim, true);

  sessionState.currentRound = pred.round_number;
  sessionState.currentItem = pred.predicted_item;
  sessionState.pendingPrediction = null;

    _updateTimeFromInputs();
    await _generateNextPrediction();
}

// معالجة زر "خطأ"
async function handleWrong() {
  if (!sessionState.pendingPrediction) return;
  const pred = sessionState.pendingPrediction;

  const actualItem = await askActualItem();
  if (!actualItem) return;

  sessionState.totalCount++;

  await _savePredictionOutcome(pred, actualItem, false);
  await refreshKnownItemsDatalist();

  const topDim = _getTopDimension(pred.breakdown);
  if (topDim) await Analysis._updateWeight(topDim, false);

  sessionState.currentRound = pred.round_number;
  sessionState.currentItem = actualItem;
  sessionState.pendingPrediction = null;

    _updateTimeFromInputs();
    await _generateNextPrediction();
}

// معالجة زر "التالي" (وضع التعلم موقوف)
async function handleNext() {
  if (!sessionState.pendingPrediction) return;
  const pred = sessionState.pendingPrediction;

  sessionState.currentRound = pred.round_number;
  sessionState.currentItem = pred.predicted_item;
  sessionState.pendingPrediction = null;

    _updateTimeFromInputs();
    await _generateNextPrediction();
}

// معالجة زر "ستوب"
async function handleStopSession() {
  if (sessionState.active && sessionState.totalCount > 0) {
    if (typeof Analysis !== 'undefined' && Analysis.run) {
      try { await Analysis.run(); } catch (e) { console.warn(e); }
    }
  }

  sessionState.active = false;
  sessionState.currentRound = null;
  sessionState.currentItem = null;
  sessionState.currentHour = null;
  sessionState.currentMinute = null;
  sessionState.pendingPrediction = null;
  sessionState.correctCount = 0;
  sessionState.totalCount = 0;

  document.getElementById('prediction-result').classList.add('hidden');
  document.getElementById('pred-round').value = '';
  document.getElementById('pred-item').value = '';
  document.getElementById('pred-hour').value = '';
  document.getElementById('pred-minute').value = '';
}

// سؤال العنصر الفعلي عند الخطأ
function askActualItem() {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-title').innerText = 'ما العنصر الذي ظهر فعلاً؟';
    document.getElementById('modal-message').innerHTML = `
      <input type="text" id="modal-actual-input" list="known-items" placeholder="اكتب اسم العنصر"
        style="width:100%; padding:12px; background:#1a1a1a; border:1px solid #2a2a2a; border-radius:8px; color:#fff; font-size:15px; margin-top:10px;">
    `;
    document.getElementById('modal-buttons').innerHTML = `
      <button class="btn-yes">تأكيد</button>
      <button class="btn-no">إلغاء</button>
    `;

    const input = document.getElementById('modal-actual-input');
    setTimeout(() => input.focus(), 50);

    modal.querySelector('.btn-yes').onclick = () => {
      const val = input.value.trim();
      if (!val) { input.focus(); return; }
      modal.classList.add('hidden');
      resolve(val);
    };
    modal.querySelector('.btn-no').onclick = () => {
      modal.classList.add('hidden');
      resolve(null);
    };

    modal.classList.remove('hidden');
  });
}

// [FIX-C2] قراءة hour/minute من الحقول قبل التوقع
function _updateTimeFromInputs() {
    const hourEl = document.getElementById('pred-hour');
    const minuteEl = document.getElementById('pred-minute');
    if (hourEl) {
        const h = hourEl.value.trim();
        if (h !== '') {
            const n = parseInt(h, 10);
            sessionState.currentHour = (Number.isInteger(n) && n >= 0 && n <= 23) ? n : null;
        } else {
            sessionState.currentHour = null;
        }
    }
    if (minuteEl) {
        const m = minuteEl.value.trim();
        if (m !== '') {
            const n = parseInt(m, 10);
            sessionState.currentMinute = (Number.isInteger(n) && n >= 0 && n <= 59) ? n : null;
        } else {
            sessionState.currentMinute = null;
        }
    }
}

// ربط الأحداث
function bindPredictionEvents() {
  document.getElementById('btn-start-session').addEventListener('click', handleStartSession);
  document.getElementById('btn-correct').addEventListener('click', handleCorrect);
  document.getElementById('btn-wrong').addEventListener('click', handleWrong);
  document.getElementById('btn-next').addEventListener('click', handleNext);
  document.getElementById('btn-stop-session').addEventListener('click', handleStopSession);
}

// تصدير
window.Prediction = {
  init: initPrediction,
  bind: bindPredictionEvents,
  refreshLearningStatus: refreshLearningStatus
};

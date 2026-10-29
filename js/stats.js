// ==========================================
// منطق قسم الإحصائيات
// ==========================================

// تحديث وعرض كل الإحصائيات
async function refreshStats() {
  try {
    // 1. حساب نسبة النجاح من predictions_log
    const predictions = await DB.getAll('predictions_log');
    const totalPredictions = predictions.length;
    const correctPredictions = predictions.filter(p => p.is_correct === true).length;
    const successRate = totalPredictions > 0
      ? Math.round((correctPredictions / totalPredictions) * 100)
      : 0;

    document.getElementById('stats-success-rate').innerText = successRate + '%';

    // 2. عدد الجولات الكلي
    const rounds = await DB.getAll('rounds');
        const userRounds = rounds.filter(r => r.is_prediction_source !== true);
        document.getElementById('stats-total-rounds').innerText = userRounds.length;

    // 3. عدد الحزم
    const packages = await DB.getAll('packages');
    document.getElementById('stats-total-packages').innerText = packages.length;

    // 4. تحديث زر مفتاح التعلم
    const learningRecord = await DB.get('app_settings', 'learning_enabled');
    const isLearningOn = learningRecord ? learningRecord.value !== false : true;
    const toggleBtn = document.getElementById('btn-toggle-learning');
    if (isLearningOn) {
      toggleBtn.innerText = 'مفعّل';
      toggleBtn.classList.remove('off');
    } else {
      toggleBtn.innerText = 'موقوف';
      toggleBtn.classList.add('off');
    }
  } catch (err) {
    console.error('خطأ في تحديث الإحصائيات:', err);
  }
}

// تبديل مفتاح التعلم
async function handleToggleLearning() {
  const current = await DB.get('app_settings', 'learning_enabled');
  const currentVal = current ? current.value !== false : true;
  const newVal = !currentVal;

  await DB.put('app_settings', { key: 'learning_enabled', value: newVal });

  // إعادة رسم الواجهة
  await refreshStats();

  // تحديث شارة حالة التعلم في قسم التوقع أيضاً
  if (typeof Prediction !== 'undefined' && Prediction.refreshLearningStatus) {
    await Prediction.refreshLearningStatus();
  }
}

// تصدير كل البيانات كملف JSON
async function handleExport() {
  try {
            const restore = setBusy(document.getElementById('btn-export'), '⏳ تصدير...');
    const data = await DB.exportAll();

    // إضافة معلومات النسخة
    data._meta = {
      app: 'WheelCodeApp',
      version: '1.0',
      exported_at: new Date().toISOString(),
      total_rounds: (data.rounds || []).length,
      total_packages: (data.packages || []).length
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    a.download = `wheel-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (typeof restore === 'function') restore();
            showAlert('تم تصدير النسخة الاحتياطية بنجاح.');
  } catch (err) {
    console.error(err);
    if (typeof restore === 'function') restore();
            showAlert('فشل التصدير: ' + err.message);
  }
}

// استيراد نسخة احتياطية
async function handleImport(file) {
  if (!file) return;

  try {
            const restore = setBusy(document.getElementById('btn-import'), '⏳ استيراد...');
    const text = await file.text();
    const data = JSON.parse(text);

    // التحقق من صحة الملف
    if (!data._meta || data._meta.app !== 'WheelCodeApp') {
      showAlert('هذا الملف ليس نسخة احتياطية صالحة من هذا التطبيق.');
      return;
    }

    // تأكيد من المستخدم
    const confirmed = await confirmModal(
      'استيراد نسخة احتياطية',
      `سيتم استبدال كل البيانات الحالية ببيانات النسخة (${data._meta.total_rounds || 0} جولة). هل تريد المتابعة؟`
    );
    if (!confirmed) return;

    // استيراد
    await DB.importAll(data);

    // إعادة تحليل كل شيء
    if (typeof Analysis !== 'undefined' && Analysis.run) {
      await Analysis.run();
    }

    // تحديث كل الأقسام
    await refreshStats();
    if (typeof Data !== 'undefined' && Data.init) await Data.init();
    if (typeof Prediction !== 'undefined' && Prediction.init) await Prediction.init();

    if (typeof restore === 'function') restore();
            showAlert('تم استيراد النسخة الاحتياطية بنجاح.');
  } catch (err) {
    console.error(err);
    if (typeof restore === 'function') restore();
            showAlert('فشل الاستيراد: ' + err.message);
  }
}

// مسح كل البيانات
async function handleClearAll() {
            const restore = setBusy(document.getElementById('btn-clear-all'), '⏳ مسح...');
  const confirmed = await confirmModal(
    'مسح جميع البيانات',
    'سيتم حذف كل الحزم والجولات والتوقعات والإحصائيات نهائياً. لا يمكن التراجع. هل أنت متأكد؟'
  );
  if (!confirmed) { if (typeof restore === 'function') restore(); return; }

  const doubleConfirm = await confirmModal(
    'تأكيد نهائي',
    'هل أنت متأكد 100%؟ كل شيء سيُحذف ولا يمكن استرجاعه.'
  );
  if (!doubleConfirm) { if (typeof restore === 'function') restore(); return; }

  await DB.clearAll();

            // [FIX-B5] إعادة تعيين الحالة في الذاكرة
            if (typeof Data !== 'undefined' && Data.reset) Data.reset();

  // إعادة تعيين الأوزان
  await DB.put('app_settings', { key: 'dimension_weights', value: null });

  // تحديث كل الأقسام
  await refreshStats();
  if (typeof Data !== 'undefined' && Data.init) await Data.init();
  if (typeof Prediction !== 'undefined' && Prediction.init) await Prediction.init();

  if (typeof restore === 'function') restore();
            showAlert('تم مسح جميع البيانات. التطبيق عاد لحالة البداية.');
}

// نافذة تأكيد (Modal) عامة
function confirmModal(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    document.getElementById('modal-buttons').innerHTML = `
      <button class="btn-yes">نعم، تأكيد</button>
      <button class="btn-no">إلغاء</button>
    `;

    modal.querySelector('.btn-yes').onclick = () => {
      modal.classList.add('hidden');
      resolve(true);
    };
    modal.querySelector('.btn-no').onclick = () => {
      modal.classList.add('hidden');
      resolve(false);
    };

    modal.classList.remove('hidden');
  });
}

// تهيئة قسم الإحصائيات
async function initStats() {
  await refreshStats();
}

// ربط الأحداث
function bindStatsEvents() {
  document.getElementById('btn-toggle-learning').addEventListener('click', handleToggleLearning);
  document.getElementById('btn-export').addEventListener('click', handleExport);

  const importBtn = document.getElementById('btn-import');
  const importFile = document.getElementById('import-file');
  importBtn.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImport(e.target.files[0]);
      e.target.value = '';
    }
  });

  document.getElementById('btn-change-pin').addEventListener('click', () => {
    if (typeof Auth !== 'undefined' && Auth.changePin) Auth.changePin();
  });

  document.getElementById('btn-clear-all').addEventListener('click', handleClearAll);
}

// تصدير
window.Stats = {
  init: initStats,
  bind: bindStatsEvents,
  refresh: refreshStats
};

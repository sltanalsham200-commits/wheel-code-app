// ==========================================
// منطق قسم البيانات
// ==========================================

// الحزمة الحالية (في الذاكرة المؤقتة قبل الحفظ النهائي)
let currentPackage = {
  date: '',
  day: '',
  rounds: [],
  is_continuous: null
};

// الحزمة السابقة (آخر حزمة محفوظة في قاعدة البيانات)
let previousPackage = null;

// تهيئة قسم البيانات
async function initData() {
  const packages = await DB.getAll('packages');
  if (packages.length > 0) {
    previousPackage = packages[packages.length - 1];
  }
  updateCounterDisplay();
  await updateKnownItems();
}

// تحديث العداد
function updateCounterDisplay() {
  document.getElementById('data-counter').innerText = currentPackage.rounds.length;
}

// إضافة جولة
async function handleAddRound() {
  const dateVal = document.getElementById('data-date').value;
  const dayVal = document.getElementById('data-day').value.trim();
  const roundVal = document.getElementById('data-round').value.trim();
  const itemVal = document.getElementById('data-item').value.trim();
  const hourVal = document.getElementById('data-hour').value.trim();
  const minuteVal = document.getElementById('data-minute').value.trim();

  // التحقق
  if (!dateVal) { alert('أدخل تاريخ الحزمة أولاً'); return; }
  if (!dayVal) { alert('أدخل يوم الحزمة أولاً'); return; }
  if (!roundVal) { alert('رقم الجولة إجباري'); return; }
  if (!itemVal) { alert('اسم العنصر إجباري'); return; }

  // سؤال الاستمرارية: عند أول إضافة في حزمة جديدة (إن وُجدت حزمة سابقة)
  if (currentPackage.rounds.length === 0 && previousPackage !== null && currentPackage.is_continuous === null) {
    currentPackage.is_continuous = await askContinuity();
  }

  // تحديث بيانات الحزمة
  currentPackage.date = dateVal;
  currentPackage.day = dayVal;

  // إضافة الجولة إلى الذاكرة المؤقتة
  currentPackage.rounds.push({
    round_number: parseInt(roundVal),
    item_name: itemVal,
    hour: hourVal ? parseInt(hourVal) : null,
    minute: minuteVal ? parseInt(minuteVal) : null
  });

  // تحديث العداد
  updateCounterDisplay();

  // إظهار رسالة النجاح
  const successEl = document.getElementById('add-success');
  successEl.classList.remove('hidden');
  setTimeout(() => successEl.classList.add('hidden'), 1500);

  // تفريغ حقول الإدخال (مع الإبقاء على التاريخ واليوم)
  document.getElementById('data-round').value = '';
  document.getElementById('data-item').value = '';
  document.getElementById('data-hour').value = '';
  document.getElementById('data-minute').value = '';
  document.getElementById('data-round').focus();

  // تحديث قائمة العناصر المعروفة
  await updateKnownItems();
}

// حفظ الحزمة
async function handleSavePackage() {
  if (currentPackage.rounds.length === 0) {
    alert('لا توجد بيانات لحفظها. أضف جولة واحدة على الأقل.');
    return;
  }

  if (!currentPackage.date || !currentPackage.day) {
    alert('أدخل تاريخ ويوم الحزمة أولاً');
    return;
  }

  // حفظ الحزمة في قاعدة البيانات
  const packageData = {
    date: currentPackage.date,
    day: currentPackage.day,
    is_continuous_with_previous: currentPackage.is_continuous === null ? true : currentPackage.is_continuous,
    created_at: Date.now()
  };

  const packageId = await DB.add('packages', packageData);

  // حفظ كل الجولات
  for (const round of currentPackage.rounds) {
    await DB.add('rounds', {
      package_id: packageId,
      round_number: round.round_number,
      item_name: round.item_name,
      hour: round.hour,
      minute: round.minute
    });
  }

  // تحديث الحزمة السابقة
  previousPackage = { id: packageId, ...packageData };

  // تشغيل التحليل في الخلفية (لا ننتظره)
  if (typeof Analysis !== 'undefined' && Analysis.run) {
    Analysis.run().catch(err => console.warn('Analysis error:', err));
  }

  // إعادة تعيين الحزمة الحالية
  currentPackage = {
    date: '',
    day: '',
    rounds: [],
    is_continuous: null
  };

  document.getElementById('data-date').value = '';
  document.getElementById('data-day').value = '';
  updateCounterDisplay();

  alert('تم حفظ الحزمة بنجاح (' + packageData.rounds?.length + ' جولة). يمكنك بدء حزمة جديدة.');
}

// تحديث قائمة العناصر المعروفة (datalist)
async function updateKnownItems() {
  const rounds = await DB.getAll('rounds');
  const items = [...new Set(rounds.map(r => r.item_name))].filter(Boolean);
  const datalist = document.getElementById('known-items');
  datalist.innerHTML = items.map(item => `<option value="${item}">`).join('');
}

// سؤال الاستمرارية
function askContinuity() {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-overlay');
    document.getElementById('modal-title').innerText = 'استمرارية الحزمة';
    document.getElementById('modal-message').innerText = 'هل هذه الحزمة متصلة بالحزمة السابقة؟';
    document.getElementById('modal-buttons').innerHTML = `
      <button class="btn-yes">نعم</button>
      <button class="btn-no">لا</button>
    `;

    const yesBtn = modal.querySelector('.btn-yes');
    const noBtn = modal.querySelector('.btn-no');

    const finish = (val) => {
      modal.classList.add('hidden');
      resolve(val);
    };

    yesBtn.onclick = () => finish(true);
    noBtn.onclick = () => finish(false);

    modal.classList.remove('hidden');
  });
}

// ربط الأحداث
function bindDataEvents() {
  document.getElementById('btn-add-round').addEventListener('click', handleAddRound);
  document.getElementById('btn-save-package').addEventListener('click', handleSavePackage);
}

// تصدير
window.Data = {
  init: initData,
  bind: bindDataEvents
};

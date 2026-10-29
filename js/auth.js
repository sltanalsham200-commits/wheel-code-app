// ==========================================
// نظام المصادقة (PIN)
// ==========================================

// تشفير النص باستخدام SHA-256
async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// جلب PIN المخزن (إن وجد)
async function getStoredPin() {
  const record = await DB.get('app_settings', 'pin_hash');
  return record ? record.value : null;
}

// حفظ PIN جديد
async function savePin(pin) {
  const hash = await hashPin(pin);
  await DB.put('app_settings', { key: 'pin_hash', value: hash });
}

// التحقق من PIN
async function verifyPin(pin) {
  const storedHash = await getStoredPin();
  if (!storedHash) return false;
  const inputHash = await hashPin(pin);
  return storedHash === inputHash;
}

// عرض رسالة خطأ في شاشة القفل
function showLockError(msg) {
  const err = document.getElementById('lock-error');
  err.innerText = msg;
  err.classList.remove('hidden');
  setTimeout(() => err.classList.add('hidden'), 3000);
}

// إخفاء رسالة الخطأ
function hideLockError() {
  document.getElementById('lock-error').classList.add('hidden');
}

// تهيئة شاشة القفل
async function initLockScreen() {
  const storedPin = await getStoredPin();
  const setupSection = document.getElementById('setup-pin-section');
  const loginSection = document.getElementById('login-pin-section');

  if (storedPin) {
    // يوجد PIN مسبقاً → شاشة الدخول
    setupSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    document.getElementById('login-pin').focus();
  } else {
    // أول استخدام → شاشة تعيين PIN
    setupSection.classList.remove('hidden');
    loginSection.classList.add('hidden');
    document.getElementById('setup-pin-1').focus();
  }
}

// معالجة تعيين PIN لأول مرة
async function handleSetupPin() {
  hideLockError();
  const pin1 = document.getElementById('setup-pin-1').value.trim();
  const pin2 = document.getElementById('setup-pin-2').value.trim();

  if (pin1.length !== 6 || !/^\d+$/.test(pin1)) {
    showLockError('PIN يجب أن يكون 6 أرقام');
    return;
  }
  if (pin1 !== pin2) {
    showLockError('الرمزان غير متطابقين');
    return;
  }

  await savePin(pin1);
  unlockApp();
}

// معالجة تسجيل الدخول
async function handleLogin() {
  hideLockError();
  const pin = document.getElementById('login-pin').value.trim();
  if (pin.length !== 6) {
    showLockError('أدخل 6 أرقام');
    return;
  }

  const ok = await verifyPin(pin);
  if (ok) {
    unlockApp();
  } else {
    showLockError('PIN غير صحيح');
    document.getElementById('login-pin').value = '';
    document.getElementById('login-pin').focus();
  }
}

// فتح التطبيق بعد المصادقة
function unlockApp() {
  document.getElementById('lock-screen').classList.remove('active');
  document.getElementById('lock-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  
  // تهيئة التطبيق بعد الدخول
  if (typeof initApp === 'function') {
    initApp();
  }
}

// تغيير PIN (يُستدعى من قسم الإحصائيات)
async function changePin() {
  const oldPin = prompt('أدخل PIN القديم:');
  if (!oldPin) return;

  const ok = await verifyPin(oldPin);
  if (!ok) { alert('PIN القديم غير صحيح'); return; }

  const newPin = prompt('أدخل PIN الجديد (6 أرقام):');
  if (!newPin || newPin.length !== 6 || !/^\d+$/.test(newPin)) {
    alert('PIN الجديد يجب أن يكون 6 أرقام');
    return;
  }
  const confirmPin = prompt('تأكيد PIN الجديد:');
  if (newPin !== confirmPin) { alert('الرمزان غير متطابقين'); return; }

  await savePin(newPin);
  alert('تم تغيير PIN بنجاح');
}

// ربط الأحداث (يُستدعى عند تحميل index.html)
function bindAuthEvents() {
  document.getElementById('btn-setup-pin').addEventListener('click', handleSetupPin);
  document.getElementById('btn-login').addEventListener('click', handleLogin);
  
  // السماح بالضغط على Enter
  document.getElementById('setup-pin-2').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSetupPin();
  });
  document.getElementById('login-pin').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

// تصدير للاستخدام الخارجي
window.Auth = {
  init: initLockScreen,
  bind: bindAuthEvents,
  changePin: changePin,
  verifyPin: verifyPin
};

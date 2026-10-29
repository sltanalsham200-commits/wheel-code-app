// ==========================================
// نظام المصادقة (PIN) — v2 مع PBKDF2
// ==========================================

const PBKDF2_ITERATIONS = 200000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 30000;

async function hashPinPBKDF2(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        key, 256
    );
    const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
    return 'pbkdf2$' + PBKDF2_ITERATIONS + '$' + saltHex + '$' + hashHex;
}

async function hashPinLegacy(pin) {
    const data = new TextEncoder().encode(pin);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPBKDF2(pin, stored) {
    const parts = stored.split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
    const iterations = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const expectedHash = parts[3];
    if (!/^[a-f0-9]+$/.test(saltHex) || saltHex.length % 2 !== 0) return false;
    const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
    const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
    );
    const actualHash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
    return actualHash === expectedHash;
}

async function getStoredPin() {
    const record = await DB.get('app_settings', 'pin_hash');
    return record ? record.value : null;
}

async function savePin(pin) {
    const hash = await hashPinPBKDF2(pin);
    await DB.put('app_settings', { key: 'pin_hash', value: hash });
}

async function verifyPin(pin) {
    const stored = await getStoredPin();
    if (!stored) return false;
    if (stored.startsWith('pbkdf2$')) return await verifyPBKDF2(pin, stored);
    if (/^[a-f0-9]{64}$/.test(stored)) {
        const legacyHash = await hashPinLegacy(pin);
        if (legacyHash === stored) {
            console.log('🔐 ترقية PIN إلى PBKDF2...');
            await savePin(pin);
            return true;
        }
    }
    return false;
}

async function getLockoutState() {
    const attempts = await DB.get('app_settings', 'login_attempts');
    const lockout = await DB.get('app_settings', 'lockout_until');
    return {
        attempts: (attempts && attempts.value) || 0,
        lockoutUntil: (lockout && lockout.value) || 0
    };
}

async function recordFailedLogin() {
    const state = await getLockoutState();
    const newAttempts = state.attempts + 1;
    let newLockoutUntil = state.lockoutUntil;
    if (newAttempts >= MAX_LOGIN_ATTEMPTS) newLockoutUntil = Date.now() + LOCKOUT_MS;
    await DB.put('app_settings', { key: 'login_attempts', value: newAttempts });
    await DB.put('app_settings', { key: 'lockout_until', value: newLockoutUntil });
    return { attempts: newAttempts, lockoutUntil: newLockoutUntil };
}

async function clearLoginAttempts() {
    await DB.put('app_settings', { key: 'login_attempts', value: 0 });
    await DB.put('app_settings', { key: 'lockout_until', value: 0 });
}

function showLockError(msg) {
    const err = document.getElementById('lock-error');
    if (!err) return;
    err.innerText = msg;
    err.classList.remove('hidden');
    setTimeout(() => err.classList.add('hidden'), 4000);
}

function hideLockError() {
    const err = document.getElementById('lock-error');
    if (err) err.classList.add('hidden');
}

async function initLockScreen() {
    const storedPin = await getStoredPin();
    const setupSection = document.getElementById('setup-pin-section');
    const loginSection = document.getElementById('login-pin-section');
    if (storedPin) {
        setupSection.classList.add('hidden');
        loginSection.classList.remove('hidden');
        const state = await getLockoutState();
        if (state.lockoutUntil > Date.now()) {
            const remaining = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
            showLockError('⏱️ محاولات كثيرة. حاول بعد ' + remaining + ' ثانية');
        }
        document.getElementById('login-pin').focus();
    } else {
        setupSection.classList.remove('hidden');
        loginSection.classList.add('hidden');
        document.getElementById('setup-pin-1').focus();
    }
}

async function handleSetupPin() {
    hideLockError();
    if (!crypto.subtle) {
        showLockError('التطبيق يحتاج HTTPS للعمل بشكل آمن');
        return;
    }
    const pin1 = document.getElementById('setup-pin-1').value.trim();
    const pin2 = document.getElementById('setup-pin-2').value.trim();
    if (pin1.length !== 6 || !/^\d+$/.test(pin1)) { showLockError('PIN يجب أن يكون 6 أرقام'); return; }
    if (pin1 !== pin2) { showLockError('الرمزان غير متطابقين'); return; }
    try {
        await savePin(pin1);
        unlockApp();
    } catch (e) {
        console.error(e);
        showLockError('فشل حفظ الرمز — حاول مجدداً');
    }
}

async function handleLogin() {
    hideLockError();
    const state = await getLockoutState();
    if (state.lockoutUntil > Date.now()) {
        const remaining = Math.ceil((state.lockoutUntil - Date.now()) / 1000);
        showLockError('⏱️ محاولات كثيرة. حاول بعد ' + remaining + ' ثانية');
        return;
    }
    const pin = document.getElementById('login-pin').value.trim();
    if (pin.length !== 6 || !/^\d+$/.test(pin)) { showLockError('أدخل 6 أرقام'); return; }
    const ok = await verifyPin(pin);
    if (ok) {
        await clearLoginAttempts();
        unlockApp();
    } else {
        const result = await recordFailedLogin();
        if (result.lockoutUntil > Date.now()) {
            const remaining = Math.ceil((result.lockoutUntil - Date.now()) / 1000);
            showLockError('🔒 PIN خاطئ. قفل مؤقت ' + remaining + ' ثانية');
        } else {
            const remaining = MAX_LOGIN_ATTEMPTS - result.attempts;
            showLockError('PIN خاطئ. محاولات متبقية: ' + remaining);
        }
        document.getElementById('login-pin').value = '';
        document.getElementById('login-pin').focus();
    }
}

function unlockApp() {
    document.getElementById('lock-screen').classList.remove('active');
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    if (typeof initApp === 'function') {
        initApp().catch(err => console.error('فشل تهيئة التطبيق:', err));
    }
}

async function changePin() {
    const oldPin = prompt('أدخل PIN الحالي:');
    if (!oldPin) return;
    const ok = await verifyPin(oldPin);
    if (!ok) { alert('PIN الحالي غير صحيح'); return; }
    const newPin = prompt('أدخل PIN الجديد (6 أرقام):');
    if (!newPin || newPin.length !== 6 || !/^\d+$/.test(newPin)) { alert('PIN الجديد يجب أن يكون 6 أرقام'); return; }
    const confirmPin = prompt('تأكيد PIN الجديد:');
    if (newPin !== confirmPin) { alert('الرمزان غير متطابقين'); return; }
    await savePin(newPin);
    alert('✅ تم تغيير PIN بنجاح');
}

async function handleForgotPin() {
    const confirmed1 = await confirmForgot(
        'نسيت الرمز؟',
        'لا يمكن استعادة الرمز. سيتم مسح كل البيانات (الحزم والجولات والإحصاءات). هل تريد المتابعة؟'
    );
    if (!confirmed1) return;
    const confirmed2 = await confirmForgot(
        'تأكيد نهائي',
        '⚠️ سيُحذف كل شيء نهائياً. هل أنت متأكد 100%؟'
    );
    if (!confirmed2) return;
    try {
        await DB.clearAll();
        await DB.put('app_settings', { key: 'pin_hash', value: null });
        await clearLoginAttempts();
        alert('تم مسح كل البيانات. سيُطلب منك تعيين رمز جديد.');
        location.reload();
    } catch (e) {
        alert('فشل المسح: ' + e.message);
    }
}

function confirmForgot(title, message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;font-family:inherit;';
        overlay.innerHTML = '<div style="background:#1a1a1a;padding:24px;border-radius:12px;max-width:400px;text-align:center;color:#fff;border:1px solid #2a2a2a;">'
            + '<h3 style="margin:0 0 12px;color:#e74c3c;">' + title + '</h3>'
            + '<p style="margin:0 0 20px;font-size:14px;line-height:1.6;">' + message + '</p>'
            + '<button id="cf-yes" style="padding:10px 20px;margin:0 6px;background:#e74c3c;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-family:inherit;">نعم، متابعة</button>'
            + '<button id="cf-no" style="padding:10px 20px;margin:0 6px;background:#333;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-family:inherit;">إلغاء</button>'
            + '</div>';
        document.body.appendChild(overlay);
        overlay.querySelector('#cf-yes').onclick = () => { document.body.removeChild(overlay); resolve(true); };
        overlay.querySelector('#cf-no').onclick = () => { document.body.removeChild(overlay); resolve(false); };
    });
}

function bindAuthEvents() {
    document.getElementById('btn-setup-pin').addEventListener('click', handleSetupPin);
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    const forgotBtn = document.getElementById('btn-forgot-pin');
    if (forgotBtn) forgotBtn.addEventListener('click', handleForgotPin);
    document.getElementById('setup-pin-2').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSetupPin(); });
    document.getElementById('login-pin').addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
}

window.Auth = {
    init: initLockScreen,
    bind: bindAuthEvents,
    changePin: changePin,
    verifyPin: verifyPin
};

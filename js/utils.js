// ==========================================
// utils.js — أدوات مشتركة
// ==========================================

function showToast(message, type = 'info', duration = 3000) {
    const colors = {
        success: { bg: 'rgba(52, 211, 153, 0.95)', border: '#34d399' },
        error:   { bg: 'rgba(248, 113, 113, 0.95)', border: '#f87171' },
        warning: { bg: 'rgba(251, 191, 36, 0.95)', border: '#fbbf24' },
        info:    { bg: 'rgba(96, 165, 250, 0.95)', border: '#60a5fa' }
    };
    const c = colors[type] || colors.info;
    const toast = document.createElement('div');
    toast.style.cssText =
        'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-120px);' +
        'background:' + c.bg + ';color:white;padding:14px 24px;border-radius:12px;' +
        'box-shadow:0 8px 24px rgba(0,0,0,0.4),0 0 20px ' + c.border + ';' +
        'font-size:15px;font-weight:600;z-index:99999;max-width:85vw;text-align:center;' +
        'font-family:inherit;backdrop-filter:blur(10px);border:1px solid ' + c.border + ';' +
        'transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1);';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(-120px)';
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

function showAlert(message, title = 'تنبيه') {
    const overlay = document.createElement('div');
    overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(5,8,20,0.85);backdrop-filter:blur(8px);' +
        'display:flex;align-items:center;justify-content:center;z-index:99998;padding:20px;';
    overlay.innerHTML =
        '<div style="background:linear-gradient(135deg,rgba(30,41,71,0.95),rgba(45,27,78,0.95));' +
        'backdrop-filter:blur(20px);border:1px solid rgba(150,170,220,0.4);border-radius:16px;' +
        'padding:28px;max-width:420px;width:100%;text-align:center;color:#eef2ff;' +
        'box-shadow:0 16px 48px rgba(0,0,0,0.5),0 0 40px rgba(167,139,250,0.2);font-family:inherit;">' +
        '<h3 style="margin:0 0 14px;color:#ffd566;font-size:19px;">' + escapeHtml(title) + '</h3>' +
        '<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#cbd5e1;white-space:pre-line;">' + escapeHtml(message) + '</p>' +
        '<button class="ua-ok" style="padding:12px 32px;background:linear-gradient(135deg,#f0b429,#a87d12);' +
        'color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;' +
        'font-family:inherit;box-shadow:0 4px 16px rgba(240,180,41,0.4);">حسناً</button>' +
        '</div>';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('.ua-ok').onclick = close;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

function showConfirm(message, title = 'تأكيد') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(5,8,20,0.85);backdrop-filter:blur(8px);' +
            'display:flex;align-items:center;justify-content:center;z-index:99998;padding:20px;';
        overlay.innerHTML =
            '<div style="background:linear-gradient(135deg,rgba(30,41,71,0.95),rgba(45,27,78,0.95));' +
            'backdrop-filter:blur(20px);border:1px solid rgba(150,170,220,0.4);border-radius:16px;' +
            'padding:28px;max-width:420px;width:100%;text-align:center;color:#eef2ff;' +
            'box-shadow:0 16px 48px rgba(0,0,0,0.5),0 0 40px rgba(167,139,250,0.2);font-family:inherit;">' +
            '<h3 style="margin:0 0 14px;color:#ffd566;font-size:19px;">' + escapeHtml(title) + '</h3>' +
            '<p style="margin:0 0 22px;font-size:15px;line-height:1.7;color:#cbd5e1;white-space:pre-line;">' + escapeHtml(message) + '</p>' +
            '<div style="display:flex;gap:10px;">' +
            '<button class="uc-yes" style="padding:12px 24px;background:linear-gradient(135deg,#f0b429,#a87d12);' +
            'color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;' +
            'font-family:inherit;box-shadow:0 4px 16px rgba(240,180,41,0.4);flex:1;">نعم، متابعة</button>' +
            '<button class="uc-no" style="padding:12px 24px;background:rgba(120,140,190,0.2);color:#eef2ff;' +
            'border:1px solid rgba(150,170,220,0.4);border-radius:10px;font-size:15px;font-weight:600;' +
            'cursor:pointer;font-family:inherit;flex:1;">إلغاء</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        const finish = (val) => { overlay.remove(); resolve(val); };
        overlay.querySelector('.uc-yes').onclick = () => finish(true);
        overlay.querySelector('.uc-no').onclick = () => finish(false);
    });
}

function setBusy(button, busyText = '⏳ جاري...') {
    if (!button) return () => {};
    const originalHTML = button.innerHTML;
    const wasDisabled = button.disabled;
    button.innerHTML = busyText;
    button.disabled = true;
    button.style.opacity = '0.7';
    button.style.cursor = 'wait';
    return () => {
        button.innerHTML = originalHTML;
        button.disabled = wasDisabled;
        button.style.opacity = '';
        button.style.cursor = '';
    };
}

function parseIntStrict(value, opts = {}) {
    if (value === null || value === undefined || value === '') return null;
    const n = parseInt(value, 10);
    if (!Number.isInteger(n)) return null;
    if (opts.min !== undefined && n < opts.min) return null;
    if (opts.max !== undefined && n > opts.max) return null;
    return n;
}

function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

async function getLatestPackage() {
    const packages = await DB.getAll('packages');
    if (packages.length === 0) return null;
    return packages.reduce((latest, p) => {
        if (!latest) return p;
        const a = latest.created_at || latest.id || 0;
        const b = p.created_at || p.id || 0;
        return b > a ? p : latest;
    }, null);
}

window.Utils = {
    toast: showToast, alert: showAlert, confirm: showConfirm,
    setBusy, parseIntStrict, escapeHtml, getLatestPackage
};
window.showToast = showToast;
window.showAlert = showAlert;
window.showConfirm = showConfirm;
window.setBusy = setBusy;

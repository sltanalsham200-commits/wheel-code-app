// ==========================================
// الملف الرئيسي: يُشغّل كل شيء
// ==========================================

// التنقل بين الشاشات
function showScreen(screenName) {
  // إخفاء كل الشاشات
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  // إظهار الشاشة المطلوبة
  const target = document.getElementById('screen-' + screenName);
  if (target) target.classList.add('active');

  // إعادة الرسم عند الدخول لقسم معين
  if (screenName === 'stats' && window.Stats && Stats.refresh) {
    Stats.refresh();
  }
  if (screenName === 'prediction' && window.Prediction && Prediction.refreshLearningStatus) {
    Prediction.refreshLearningStatus();
  }
  if (screenName === 'data' && window.Data && Data.init) {
    Data.init();
  }
}

// تهيئة التطبيق بعد فتح القفل
async function initApp() {
  try {
    // 1. تهيئة الأقسام
    if (window.Data && Data.init) await Data.init();
    if (window.Prediction && Prediction.init) await Prediction.init();
    if (window.Stats && Stats.init) await Stats.init();

    // 2. ربط أحداث الأقسام
    if (window.Data && Data.bind) Data.bind();
    if (window.Prediction && Prediction.bind) Prediction.bind();
    if (window.Stats && Stats.bind) Stats.bind();

    // 3. ربط أزرار التنقل من الشاشة الرئيسية
    document.getElementById('btn-goto-data').addEventListener('click', () => showScreen('data'));
    document.getElementById('btn-goto-prediction').addEventListener('click', () => showScreen('prediction'));
    document.getElementById('btn-goto-stats').addEventListener('click', () => showScreen('stats'));

    // 4. ربط أزرار الرجوع
    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-back') || 'home';
        showScreen(target);
      });
    });

    // 5. تسجيل Service Worker
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./service-worker.js');
        console.log('Service Worker: مسجل بنجاح');
      } catch (err) {
        console.warn('Service Worker: فشل التسجيل', err);
      }
    }

    console.log('✅ التطبيق جاهز للعمل');
  } catch (err) {
    console.error('خطأ في تهيئة التطبيق:', err);
    alert('حدث خطأ أثناء تهيئة التطبيق. راجع Console للتفاصيل.');
  }
}

// التشغيل عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', async () => {
  // تهيئة شاشة القفل
  if (window.Auth && Auth.init) {
    await Auth.init();
    if (Auth.bind) Auth.bind();
  }

  // إخفاء شاشة التحميل (إن كانت موجودة)
  // لا توجد شاشة تحميل حالياً، لكن هذا احتياط للمستقبل
});

// منع إغلاق التطبيق بالخطأ إذا كان المستخدم في منتصف جلسة
window.addEventListener('beforeunload', (event) => {
  // تحقق أن المستخدم في جلسة توقع نشطة
  if (typeof sessionState !== 'undefined' && sessionState.active) {
    event.preventDefault();
    event.returnValue = '';
    return '';
  }
});

// إتاحة showScreen عالمياً (للاستخدام في أي مكان)
window.showScreen = showScreen;
window.initApp = initApp;

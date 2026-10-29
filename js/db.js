// ==========================================
// قاعدة البيانات المحلية (IndexedDB)
// ==========================================

const DB_NAME = 'WheelCodeDB';
const DB_VERSION = 1;
let dbInstance = null;

// 1. فتح قاعدة البيانات وإنشاء الجداول (أول مرة فقط)
function openDB() {
  if (dbInstance) return Promise.resolve(dbInstance);
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => reject('خطأ في فتح قاعدة البيانات: ' + event.target.error);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // جدول الحزم
      if (!db.objectStoreNames.contains('packages')) {
        db.createObjectStore('packages', { keyPath: 'id', autoIncrement: true });
      }

      // جدول الجولات
      if (!db.objectStoreNames.contains('rounds')) {
        const roundsStore = db.createObjectStore('rounds', { keyPath: 'id', autoIncrement: true });
        roundsStore.createIndex('package_id', 'package_id', { unique: false });
        roundsStore.createIndex('round_number', 'round_number', { unique: false });
        roundsStore.createIndex('item_name', 'item_name', { unique: false });
      }

      // جدول التحليل (الأنماط المكتشفة)
      if (!db.objectStoreNames.contains('analysis_cache')) {
        const analysisStore = db.createObjectStore('analysis_cache', { keyPath: 'id', autoIncrement: true });
        analysisStore.createIndex('dimension', 'dimension', { unique: false });
        analysisStore.createIndex('key_value', 'key_value', { unique: false });
      }

      // جدول سجل التوقعات
      if (!db.objectStoreNames.contains('predictions_log')) {
        db.createObjectStore('predictions_log', { keyPath: 'id', autoIncrement: true });
      }

      // جدول الإعدادات (PIN، مفتاح التعلم)
      if (!db.objectStoreNames.contains('app_settings')) {
        db.createObjectStore('app_settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      
      // تعيين إعدادات افتراضية إذا كان هذا أول تشغيل
      const tx = dbInstance.transaction('app_settings', 'readwrite');
      const store = tx.objectStore('app_settings');
      const getLearning = store.get('learning_enabled');
      getLearning.onsuccess = () => {
        if (getLearning.result === undefined) {
          store.put({ key: 'learning_enabled', value: true });
        }
      };
      
      tx.oncomplete = () => resolve(dbInstance);
      tx.onerror = () => resolve(dbInstance);
    };
  });
}

// ==========================================
// دوال مساعدة (Wrappers) للتعامل مع IndexedDB
// ==========================================

async function dbAdd(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).add(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const request = tx.objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const request = tx.objectStore(storeName).put(data);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbClearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['packages', 'rounds', 'analysis_cache', 'predictions_log'], 'readwrite');
    tx.objectStore('packages').clear();
    tx.objectStore('rounds').clear();
    tx.objectStore('analysis_cache').clear();
    tx.objectStore('predictions_log').clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// تصدير كل البيانات (لأخذ نسخة احتياطية)
async function dbExportAll() {
  const data = {};
  data.packages = await dbGetAll('packages');
  data.rounds = await dbGetAll('rounds');
  data.analysis_cache = await dbGetAll('analysis_cache');
  data.predictions_log = await dbGetAll('predictions_log');
  data.app_settings = await dbGetAll('app_settings');
  return data;
}

// استيراد البيانات من نسخة احتياطية
async function dbImportAll(data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['packages', 'rounds', 'analysis_cache', 'predictions_log', 'app_settings'], 'readwrite');
    
    // مسح البيانات القديمة أولاً
    tx.objectStore('packages').clear();
    tx.objectStore('rounds').clear();
    tx.objectStore('analysis_cache').clear();
    tx.objectStore('predictions_log').clear();
    tx.objectStore('app_settings').clear();

    // إضافة البيانات الجديدة
    if (data.packages) data.packages.forEach(item => tx.objectStore('packages').put(item));
    if (data.rounds) data.rounds.forEach(item => tx.objectStore('rounds').put(item));
    if (data.analysis_cache) data.analysis_cache.forEach(item => tx.objectStore('analysis_cache').put(item));
    if (data.predictions_log) data.predictions_log.forEach(item => tx.objectStore('predictions_log').put(item));
    if (data.app_settings) data.app_settings.forEach(item => tx.objectStore('app_settings').put(item));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// تصدير الدوال لاستخدامها في الملفات الأخرى
window.DB = {
  open: openDB,
  add: dbAdd,
  getAll: dbGetAll,
  get: dbGet,
  put: dbPut,
  clearAll: dbClearAll,
  exportAll: dbExportAll,
  importAll: dbImportAll
};

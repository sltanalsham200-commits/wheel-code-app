// ==========================================
// أدوات مساعدة للنسخ الاحتياطي (Low-Level Utilities)
// ==========================================
// ملاحظة: المنطق الأساسي للتصدير/الاستيراد موجود في stats.js
// هذا الملف يُوفر أدوات مساعدة إضافية قابلة لإعادة الاستخدام.

const Backup = {

  // توليد اسم ملف النسخة الاحتياطية بصيغة YYYY-MM-DD
  generateFilename(prefix = 'wheel-backup') {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${prefix}-${yyyy}-${mm}-${dd}.json`;
  },

  // تنزيل نص كملف في المتصفح
  downloadText(content, filename, mime = 'application/json') {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (err) {
      console.error('فشل التنزيل:', err);
      return false;
    }
  },

  // قراءة ملف نصي (File object) كـ String
  async readFileAsText(file) {
    if (!file) throw new Error('لا يوجد ملف');
    return await file.text();
  },

  // قراءة ملف نصي كـ JSON مع التحقق
  async readFileAsJSON(file) {
    const text = await this.readFileAsText(file);
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new Error('الملف ليس JSON صالحاً');
    }
  },

  // التحقق من بنية نسخة احتياطية
  validateBackup(data) {
    if (!data || typeof data !== 'object') return false;
    if (!data._meta) return false;
    if (data._meta.app !== 'WheelCodeApp') return false;
    return true;
  },

  // معلومات موجزة عن نسخة احتياطية (للعرض)
  summarizeBackup(data) {
    if (!this.validateBackup(data)) return null;
    return {
      app: data._meta.app,
      version: data._meta.version,
      exported_at: data._meta.exported_at,
      total_rounds: data._meta.total_rounds || 0,
      total_packages: data._meta.total_packages || 0
    };
  }
};

// تصدير
window.Backup = Backup;

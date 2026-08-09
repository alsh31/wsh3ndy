/*
  بديل تخزين خارج بيئة Claude
  ------------------------------------------
  داخل Claude Artifacts توجد واجهة window.storage جاهزة. خارج هذه
  البيئة (مثل GitHub Pages) هذه الواجهة غير موجودة، فيعرّفها هذا
  الملف بنفس التوقيع تماماً، عشان باقي الكود (app.js) يشتغل بدون أي
  تعديل:

  - المفاتيح الشخصية (shared=false، مثل رمز جهازك المحفوظ محلياً
    وإعدادات 12/24 ساعة) تُحفظ بـ localStorage — خاصة بنفس المتصفح.
  - المفاتيح المشتركة (shared=true، وهي بيانات الجدول نفسها المرتبطة
    بالرمز الخاص) تُحفظ فعلياً في قاعدة بيانات Firebase Realtime
    Database، عشان تشتغل المزامنة الحقيقية بين أي جهاز.
*/
(function(){
  if(typeof window.storage !== 'undefined') return; // موجودة أصلاً (داخل Claude)

  // رابط قاعدة بيانات Firebase الخاصة بك
  const FIREBASE_DB_URL = 'https://university-schedule-ef937-default-rtdb.europe-west1.firebasedatabase.app';

  const PREFIX = 'univ-schedule:';

  function sanitizeLeaf(key){
    // مفاتيح الجدول المشترك دائماً بصيغة "schedule:shared:<code>"
    if(key.startsWith('schedule:shared:')) return key.slice('schedule:shared:'.length);
    // أي مفتاح مشترك آخر: تنظيف الأحرف الممنوعة في مسارات Firebase
    return encodeURIComponent(key).replace(/[.#$\[\]]/g, '_');
  }

  async function firebaseGet(key){
    const leaf = sanitizeLeaf(key);
    const res = await fetch(`${FIREBASE_DB_URL}/schedule/${leaf}.json`);
    if(!res.ok) throw new Error('تعذر الاتصال بقاعدة البيانات');
    const data = await res.json();
    if(data === null) throw new Error('Key not found: '+key);
    return { key, value: data, shared: true };
  }

  async function firebaseSet(key, value){
    const leaf = sanitizeLeaf(key);
    const res = await fetch(`${FIREBASE_DB_URL}/schedule/${leaf}.json`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value)
    });
    if(!res.ok) throw new Error('تعذر الحفظ في قاعدة البيانات');
    return { key, value, shared: true };
  }

  async function firebaseDelete(key){
    const leaf = sanitizeLeaf(key);
    const res = await fetch(`${FIREBASE_DB_URL}/schedule/${leaf}.json`, { method: 'DELETE' });
    if(!res.ok) throw new Error('تعذر الحذف من قاعدة البيانات');
    return { key, deleted: true, shared: true };
  }

  window.storage = {
    async get(key, shared){
      if(shared) return firebaseGet(key);
      const raw = localStorage.getItem(PREFIX+key);
      if(raw === null) throw new Error('Key not found: '+key);
      return { key, value: raw, shared: false };
    },
    async set(key, value, shared){
      if(shared) return firebaseSet(key, value);
      localStorage.setItem(PREFIX+key, value);
      return { key, value, shared: false };
    },
    async delete(key, shared){
      if(shared) return firebaseDelete(key);
      const existed = localStorage.getItem(PREFIX+key) !== null;
      localStorage.removeItem(PREFIX+key);
      return { key, deleted: existed, shared: false };
    },
    async list(prefix, shared){
      if(shared){
        const res = await fetch(`${FIREBASE_DB_URL}/schedule.json?shallow=true`);
        if(!res.ok) throw new Error('تعذر الاتصال بقاعدة البيانات');
        const data = await res.json();
        const keys = data ? Object.keys(data) : [];
        return { keys, prefix, shared: true };
      }
      const p = PREFIX + (prefix || '');
      const keys = Object.keys(localStorage)
        .filter(k => k.startsWith(p))
        .map(k => k.slice(PREFIX.length));
      return { keys, prefix, shared: false };
    }
  };
})();

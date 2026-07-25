// netlify/functions/quran-data.js
//
// نفس فكرة data.js تماماً، بس مخصص لبيانات "الآيات/السور" فقط (verses)، وبمفتاح
// تخزين منفصل عن باقي محتوى الموقع (site-data). السبب: نص القرآن كامل حجمه
// كبير نسبياً (~1.5 ميغابايت) ونادراً ما يتغيّر (فقط لما الأدمن يعدّل/يضيف/يحذف
// آية)، فمن غير المنطقي إعادة إرساله مع كل حفظ بسيط لحديث أو دعاء. فصل هذا
// الملف يخلي حفظ باقي محتوى الموقع سريع وخفيف دايماً.
//
//   GET  /.netlify/functions/quran-data   -> يرجّع آخر نسخة محفوظة من بيانات الآيات
//   PUT  /.netlify/functions/quran-data   -> يحفظ نسخة جديدة (يتطلب هيدر X-Admin-Secret صحيح)

import { getStore } from '@netlify/blobs';

const ADMIN_SECRET = process.env.ADMIN_SECRET || '014842';
const KEY = 'quran-verses-data';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

export default async (req) => {
  const store = getStore('mishkat-content');

  if (req.method === 'GET') {
    try {
      const data = await store.get(KEY, { type: 'json' });
      return json(data || null);
    } catch (e) {
      return json(null, 200);
    }
  }

  if (req.method === 'PUT') {
    const secret = req.headers.get('x-admin-secret');
    if (!secret || secret !== ADMIN_SECRET) {
      return json({ error: 'unauthorized' }, 401);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: 'invalid json' }, 400);
    }

    try {
      await store.setJSON(KEY, body);
      return json({ ok: true });
    } catch (e) {
      return json({ error: 'save failed' }, 500);
    }
  }

  return json({ error: 'method not allowed' }, 405);
};

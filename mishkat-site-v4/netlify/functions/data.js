// netlify/functions/data.js
//
// هاد الملف هو "السيرفر" البسيط اللي بخزّن محتوى الموقع (أحاديث، آيات مختارة،
// أدعية، فيديوهات، عناصر المتجر، التحديات) بشكل مشترك بين كل الزوار.
// الموقع (index.html) أصلاً معمول عشان يتكلم مع هالمسار:
//   GET  /.netlify/functions/data   -> يرجّع آخر نسخة محفوظة من المحتوى
//   PUT  /.netlify/functions/data   -> يحفظ نسخة جديدة (يتطلب هيدر X-Admin-Secret صحيح)
//
// يستخدم Netlify Blobs للتخزين (مخزّن دائم مرتبط بالموقع، ما يحتاج قاعدة بيانات خارجية).

import { getStore } from '@netlify/blobs';

// غيّر هاد الرقم أو خليه يجي من متغير بيئة ADMIN_SECRET في إعدادات Netlify
// (Site settings -> Environment variables) لو بدك تغيّر كلمة سر الأدمن بدون
// تعديل الكود. لازم يطابق تماماً القيمة اللي يرسلها index.html عند تسجيل الدخول.
const ADMIN_SECRET = process.env.ADMIN_SECRET || '014842';

const KEY = 'site-data';

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
      return json(data || {});
    } catch (e) {
      return json({}, 200);
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

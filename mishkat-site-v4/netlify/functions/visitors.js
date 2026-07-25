// netlify/functions/visitors.js
//
// يسجّل زيارات المستخدمين الحقيقيين على الموقع (جهاز/متصفح/نظام/دولة/مدينة تقريبية)
// عشان تقدر لوحة الأدمن تعرض عدد الزوار والمتصلين الآن بشكل حقيقي، مو وهمي.
//
// GET    /.netlify/functions/visitors   -> يرجّع إحصائيات الزوار (يتطلب X-Admin-Secret)
// POST   /.netlify/functions/visitors   -> يسجّل زيارة/نبضة جديدة من متصفح الزائر (عام، بدون سر)
// DELETE /.netlify/functions/visitors   -> يصفّر كل بيانات الزوار (يتطلب X-Admin-Secret)

import { getStore } from '@netlify/blobs';

const ADMIN_SECRET = process.env.ADMIN_SECRET || '014842';
const KEY = 'visitors-data';
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // آخر 5 دقائق = "متصل الآن"

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function maskIp(ip) {
  if (!ip) return '';
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.*.* `.trim();
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return parts.slice(0, 2).join(':') + ':****';
  }
  return ip;
}

export default async (req, context) => {
  const store = getStore('mishkat-content');

  // ===== تسجيل زيارة/نبضة (عام لأي زائر) =====
  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return json({ error: 'invalid json' }, 400);
    }
    const deviceId = body.deviceId;
    if (!deviceId) return json({ error: 'missing deviceId' }, 400);

    let data;
    try {
      data = await store.get(KEY, { type: 'json' });
    } catch (e) {
      data = null;
    }
    if (!data || typeof data !== 'object' || !data.devices) data = { devices: {} };

    const now = new Date().toISOString();
    const ip =
      req.headers.get('x-nf-client-connection-ip') ||
      (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
    const geo = context && context.geo ? context.geo : null;

    const existing = data.devices[deviceId] || {
      firstSeen: now,
      visits: 0,
      pageViews: 0
    };

    existing.lastSeen = now;
    if (body.browser) existing.browser = body.browser;
    if (body.os) existing.os = body.os;
    if (body.deviceType) existing.deviceType = body.deviceType;
    if (body.lang) existing.lang = body.lang;
    if (body.tz) existing.tz = body.tz;
    if (body.screen) existing.screen = body.screen;
    existing.ipMasked = maskIp(ip);
    if (geo && (geo.city || (geo.country && geo.country.name))) {
      existing.geo = {
        city: geo.city || (existing.geo && existing.geo.city) || '',
        country: (geo.country && geo.country.name) || (existing.geo && existing.geo.country) || ''
      };
    }

    existing.pageViews = (existing.pageViews || 0) + 1;
    if (body.type === 'visit') {
      existing.visits = (existing.visits || 0) + 1;
    }

    data.devices[deviceId] = existing;

    try {
      await store.setJSON(KEY, data);
    } catch (e) {
      return json({ error: 'save failed' }, 500);
    }
    return json({ ok: true });
  }

  // ===== إحصائيات الزوار (أدمن فقط) =====
  if (req.method === 'GET') {
    const secret = req.headers.get('x-admin-secret');
    if (!secret || secret !== ADMIN_SECRET) return json({ error: 'unauthorized' }, 401);

    let data;
    try {
      data = await store.get(KEY, { type: 'json' });
    } catch (e) {
      data = null;
    }
    if (!data || !data.devices) data = { devices: {} };

    const now = Date.now();
    const devices = Object.keys(data.devices)
      .map(id => {
        const d = data.devices[id];
        const online = now - new Date(d.lastSeen).getTime() < ONLINE_WINDOW_MS;
        return { deviceId: id, ...d, online };
      })
      .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));

    const totalDevices = devices.length;
    const onlineNow = devices.filter(d => d.online).length;
    const totalVisits = devices.reduce((sum, d) => sum + (d.visits || 0), 0);

    return json({ totalDevices, onlineNow, totalVisits, devices });
  }

  // ===== تصفير بيانات الزوار (أدمن فقط) =====
  if (req.method === 'DELETE') {
    const secret = req.headers.get('x-admin-secret');
    if (!secret || secret !== ADMIN_SECRET) return json({ error: 'unauthorized' }, 401);
    try {
      await store.setJSON(KEY, { devices: {} });
    } catch (e) {
      return json({ error: 'clear failed' }, 500);
    }
    return json({ ok: true });
  }

  return json({ error: 'method not allowed' }, 405);
};

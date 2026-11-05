// R.E.M.S. Reader / Kids Reader 専用の中継サーバー（Cloudflare Workers 用）
// QQEnglish公式サイトの教材PDF（R.E.M.S.・キッズ教材）だけを取得し、あなたのリーダー画面にだけ渡します。
// それ以外のURLや他のサイトからの利用は拒否します。

const ALLOWED_ORIGINS = ["https://kouheim1979.github.io"];
const PDF_HOST = "www.qqeng.com";
const PDF_DIR = /^\/blog2\/wordpress\/wp-content\/uploads\/\d{4}\/\d{2}\/[A-Za-z0-9_.\-]+\.pdf$/;

function isAllowed(target) {
  let u;
  try { u = new URL(target); } catch { return false; }
  return u.protocol === "https:" && u.hostname === PDF_HOST && !u.username && !u.port && PDF_DIR.test(u.pathname);
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Expose-Headers": "Content-Length",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("method not allowed", { status: 405, headers: cors });
    }

    const target = new URL(request.url).searchParams.get("url") || "";
    if (!target) return new Response("R.E.M.S. Reader proxy: OK", { headers: { ...cors, "Content-Type": "text/plain; charset=utf-8" } });
    if (!isAllowed(target)) {
      return new Response("forbidden", { status: 403, headers: cors });
    }

    // Cloudflareのキャッシュに30日保存（2回目以降は公式サイトにアクセスしない）
    const cache = caches.default;
    const cacheKey = new Request(target);
    let res = await cache.match(cacheKey);
    if (!res) {
      const upstream = await fetch(target, {
        headers: { "User-Agent": "Mozilla/5.0 (R.E.M.S. Reader personal proxy)" },
        cf: { cacheEverything: true, cacheTtl: 2592000 },
      });
      if (!upstream.ok) return new Response("upstream " + upstream.status, { status: 502, headers: cors });
      res = new Response(upstream.body, upstream);
      res.headers.set("Cache-Control", "public, max-age=2592000");
      ctx.waitUntil(cache.put(cacheKey, res.clone()));
    }

    const out = new Response(request.method === "HEAD" ? null : res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    out.headers.set("Content-Type", "application/pdf");
    return out;
  },
};

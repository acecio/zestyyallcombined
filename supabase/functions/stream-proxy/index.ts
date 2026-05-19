// Stream proxy: relays remote video streams to bypass mixed-content + CORS.
// Note: this runs in a single edge region; it is NOT a real geo-VPN.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, range",
  "Access-Control-Expose-Headers": "content-length, content-range, accept-ranges, content-type",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    if (!target) {
      return new Response(JSON.stringify({ error: "Missing url param" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid url" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return new Response(JSON.stringify({ error: "Unsupported scheme" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const headers = new Headers();
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    );
    const range = req.headers.get("range");
    if (range) headers.set("Range", range);

    const upstream = await fetch(parsed.toString(), {
      method: req.method,
      headers,
      redirect: "follow",
    });

    const respHeaders = new Headers(corsHeaders);
    const passthrough = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"];
    for (const h of passthrough) {
      const v = upstream.headers.get(h);
      if (v) respHeaders.set(h, v);
    }
    if (!respHeaders.has("content-type")) {
      // Common fallback for raw MPEG-TS
      respHeaders.set("content-type", "video/mp2t");
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

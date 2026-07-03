const IGN_URL = "https://www.ign.es/web/ign/portal/ultimos-terremotos";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return textResponse("Metodo no permitido", 405);
    }

    if (url.pathname !== "/" && url.pathname !== "/ign-terremotos") {
      return textResponse("Not found", 404);
    }

    try {
      const ignResponse = await fetch(IGN_URL, {
        headers: {
          "User-Agent": "Casasola-Alerta/1.0",
          "Accept": "text/html,application/xhtml+xml",
        },
        cf: { cacheTtl: 0, cacheEverything: false },
      });

      if (!ignResponse.ok) {
        return textResponse(`IGN respondio con codigo ${ignResponse.status}`, 502);
      }

      const html = await ignResponse.text();
      return new Response(html, {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    } catch (error) {
      return textResponse(`No se pudo leer IGN: ${error.message}`, 502);
    }
  },
};

function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

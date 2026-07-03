const ORDINARY = "ORDINARY";
const EXTRA = "EXTRA";
const ZERO = "ZERO";
const UNKNOWN = "UNKNOWN";
const APP_VERSION = "v3.3";
const ZERO_SATELLITE_ZOOM = 9;
const ZERO_SATELLITE_MAX_ZOOM = 14;
const IGN_PROXY_PATH = "ign-terremotos";
const DEFAULT_LOCAL_APP_URL = "http://10.197.22.196:8791/";

const SAMPLE_TEXT = `EVENTO: es2026mnvfi Madrid 2026-06-28 09:23:55
El INSTITUTO GEOGRAFICO NACIONAL informa que se ha producido un terremoto con estos datos epicentrales:
HORA LOCAL(*): 2026-06-28 08:59:40
HORA UTC: 2026-06-28 06:59:40
Latitud: 36.68 grados norte
Longitud: 9.83 grados oeste
Profundidad: 14 km
Magnitud mbLg: 4.3
Zona epicentral: SW CABO DE SAN VICENTE`;

const LEGENDS = {
  extra: [
    [4.0, "1 I>=IV"],
    [4.5, "2 I>=IV-V"],
    [5.0, "3 I>=V"],
    [5.5, "4 I>=V-VI"],
    [6.0, "5 I>=VI"],
    [6.5, "6 I>=VI-VII"],
    [7.0, "7 I>=VII"],
    [7.5, "8 I>=VII-VIII"],
    [8.0, "9 I>=VIII"],
    [8.5, "10 I>=VIII-IX"],
    [9.0, "11 I>=IX"],
    [9.5, "12 I>=IX-X"],
    [10.0, "13 I>=X"],
    [10.5, "14 I>=X-XI"],
    [11.0, "15 I>=XI"],
    [11.5, "16 I>=XI-XII"],
  ],
  zero: [
    [5.5, "1 I>=V-VI"],
    [6.0, "2 I>=VI"],
    [6.5, "3 I>=VI-VII"],
    [7.0, "4 I>=VII"],
    [7.5, "5 I>=VII-VIII"],
    [8.0, "6 I>=VIII"],
    [8.5, "7 I>=VIII-IX"],
    [9.0, "8 I>=IX"],
    [9.5, "9 I>=IX-X"],
    [10.0, "10 I>=X"],
    [10.5, "11 I>=X-XI"],
    [11.0, "12 I>=XI"],
    [11.5, "13 I>=XI-XII"],
  ],
};

const MAPS = {
  zero: {
    imgId: "zeroMapImg",
    frameId: "zeroFrame",
    layerId: "zeroLayer",
    coordTipId: "zeroCoordTip",
    markerId: "zeroMarker",
    labelId: "zeroMarkerLabel",
    isolineId: "zeroIsolines",
    thresholdBase: 5.5,
    maxClass: 13,
    georef: { mode: "standard", lon0: -15, lat0: 42, pxDegX: 167.8125, pxDegY: 156.7273, west: -15, east: 1, north: 42, south: 31, width: 2685, height: 1724 },
    rotation: { width: 2685, height: 1724, clockwise: false },
    vector: true,
  },
};

const $ = (id) => document.getElementById(id);
const mapViews = {
  zero: { scale: 1, x: 0, y: 0 },
};
const satelliteState = { zero: { zoom: null, key: "" } };
const CONSERVATIVE_CELL_RADIUS = 2;
const COORD_TIP_CURSOR_OFFSET_PX = 76;
const SEVERITY_RANK = { [ORDINARY]: 0, [EXTRA]: 1, [ZERO]: 2, [UNKNOWN]: -1 };
let contextMenuPoint = null;
let lastIgnResults = [];

const fileInput = $("fileInput");
const textInput = $("textInput");
const dropzone = $("dropzone");

fileInput.addEventListener("change", async () => {
  if (fileInput.files[0]) textInput.value = await readFileText(fileInput.files[0]);
});

for (const eventName of ["dragenter", "dragover"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag");
  });
}
for (const eventName of ["dragleave", "drop"]) {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.remove("drag");
  });
}
dropzone.addEventListener("drop", async (event) => {
  const file = event.dataTransfer.files[0];
  if (file) textInput.value = await readFileText(file);
});

$("analyzeBtn").addEventListener("click", runAnalyze);
$("readIgnBtn").addEventListener("click", runIgnRead);
$("sampleBtn").addEventListener("click", async () => {
  textInput.value = SAMPLE_TEXT;
  await runAnalyze();
});
$("clearBtn").addEventListener("click", () => {
  textInput.value = "";
  fileInput.value = "";
  lastIgnResults = [];
  renderIgnEvents([]);
  clearBatchMarkers();
  render(null);
});

initMapInteractions();
initContextMenu();
renderIsolineOverlays();
initSatelliteTiles();
initProxyNotice();

async function runAnalyze() {
  const button = $("analyzeBtn");
  try {
    button.disabled = true;
    button.textContent = "Analizando...";
    const result = await analyze(textInput.value);
    clearBatchMarkers();
    render(result || decision(UNKNOWN, {}, ["No hay texto para analizar. Carga un archivo del IGN o pega el boletin."]));
  } catch (error) {
    render(decision(UNKNOWN, {}, [`No se pudo completar el analisis: ${error.message}`]));
  } finally {
    button.disabled = false;
    button.textContent = "Analizar";
  }
}

async function runIgnRead() {
  const button = $("readIgnBtn");
  const days = Math.max(1, Math.min(10, Math.round(numberValue($("ignDays").value, 7))));
  $("ignDays").value = String(days);
  try {
    button.disabled = true;
    button.textContent = "Leyendo IGN...";
    const events = await fetchIgnEvents(days);
    await analyzeIgnEvents(events, days);
  } catch (error) {
    render(decision(UNKNOWN, {}, [`No se pudo leer o analizar el listado del IGN: ${error.message}`]));
  } finally {
    button.disabled = false;
    button.textContent = "Leer sismos del IGN";
  }
}

async function analyzeIgnEvents(events, days = numberValue($("ignDays")?.value, 7)) {
  const results = [];
  for (const event of events) {
    const result = await analyze(ignEventToText(event), { skipMarker: true });
    if (!result) continue;
    result.data.ignEvent = event;
    results.push(result);
  }
  lastIgnResults = results;
  const overall = overallIgnDecision(results, days);
  render(overall);
  renderBatchMarkers(results);
  renderIgnEvents(results, days);
  return results;
}

async function readFileText(file) {
  const buffer = await file.arrayBuffer();
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    try {
      return await extractPdfText(buffer);
    } catch (error) {
      return `No se pudo extraer automaticamente el PDF: ${error.message}`;
    }
  }
  return new TextDecoder("utf-8").decode(buffer);
}

async function extractPdfText(buffer) {
  const bytes = new Uint8Array(buffer);
  const latin = new TextDecoder("latin1").decode(bytes);
  const chunks = [];
  let index = 0;

  while (true) {
    const streamPos = latin.indexOf("stream", index);
    if (streamPos < 0) break;
    let dataStart = streamPos + 6;
    if (latin[dataStart] === "\r" && latin[dataStart + 1] === "\n") dataStart += 2;
    else if (latin[dataStart] === "\n") dataStart += 1;

    const endPos = latin.indexOf("endstream", dataStart);
    if (endPos < 0) break;
    let dataEnd = endPos;
    if (latin[dataEnd - 1] === "\n") dataEnd -= 1;
    if (latin[dataEnd - 1] === "\r") dataEnd -= 1;

    const dictStart = latin.lastIndexOf("<<", streamPos);
    const dictEnd = latin.indexOf(">>", dictStart);
    const dict = dictStart >= 0 && dictEnd < streamPos ? latin.slice(dictStart, dictEnd + 2) : "";
    const streamBytes = bytes.slice(dataStart, dataEnd);
    const streamText = dict.includes("/FlateDecode")
      ? await inflateToLatin1(streamBytes).catch(() => "")
      : new TextDecoder("latin1").decode(streamBytes);

    const literalText = extractPdfLiterals(streamText);
    if (literalText.trim()) chunks.push(literalText);
    index = endPos + 9;
  }
  return chunks.join("\n");
}

async function inflateToLatin1(bytes) {
  if (!("DecompressionStream" in window)) throw new Error("El navegador no soporta descompresion PDF integrada");
  const blob = new Blob([bytes]);
  const stream = blob.stream().pipeThrough(new DecompressionStream("deflate"));
  const out = await new Response(stream).arrayBuffer();
  return new TextDecoder("latin1").decode(out);
}

function extractPdfLiterals(text) {
  const result = [];
  const regex = /\((?:\\.|[^\\)])*\)/g;
  let match;
  while ((match = regex.exec(text))) result.push(unescapePdfString(match[0].slice(1, -1)));
  return result.join(" ");
}

function unescapePdfString(value) {
  return value
    .replace(/\\([nrtbf()\\])/g, (_, code) => ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" }[code]))
    .replace(/\\([0-7]{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

async function analyze(rawText, options = {}) {
  const text = normalize(rawText || "");
  if (!text.trim()) return null;

  const data = parseIgn(text);
  const reasons = [];
  const damLat = numberValue($("damLat").value, 36.8068);
  const damLon = numberValue($("damLon").value, -4.4922056);

  if (data.lat != null && data.lon != null) {
    data.distanceKm = haversineKm(damLat, damLon, data.lat, data.lon);
  }

  if (data.pga != null) {
    reasons.push(`PGA detectada: ${fmt(data.pga)} cm/s2.`);
  }

  if (data.intensity == null && data.magnitude != null) {
    const conversion = toMomentMagnitude(data.magnitude, data.magnitudeType);
    data.mw = conversion?.mw;
    data.magnitudeConversion = conversion?.method;
    if (data.mw != null) {
      data.intensity = (data.mw - 1.656) / 0.545;
      reasons.push(`Mw = ${fmt(data.mw)} e Io = ${fmt(data.intensity)} calculadas desde ${data.magnitudeType || "magnitud"} ${fmt(data.magnitude)} (${data.magnitudeConversion}).`);
    }
  }

  if (data.lat == null || data.lon == null) {
    return decision(UNKNOWN, data, [...reasons, "No se ha detectado latitud y longitud del IGN; no se puede posicionar el epicentro en los mapas."]);
  }

  if (data.intensity == null && data.pga == null) {
    return decision(UNKNOWN, data, [...reasons, "No se ha detectado intensidad, magnitud ni PGA; requiere revision manual."]);
  }

  const unifiedMap = await readMapThreshold("zero", data.lat, data.lon);
  data.mapZero = {
    ...unifiedMap,
    threshold: unifiedMap.zeroThreshold,
    matches: unifiedMap.zeroMatches,
    legend: formatLegendLabel("zero", unifiedMap.zeroThreshold),
  };
  data.mapExtra = {
    ...unifiedMap,
    threshold: unifiedMap.extraThreshold,
    matches: unifiedMap.extraMatches,
    legend: formatLegendLabel("extra", unifiedMap.extraThreshold),
  };

  if (!options.skipMarker) placeMarker("zero", data);

  if (data.mapExtra.inMap) {
    reasons.push(`Situacion Extraordinaria vectorial: epicentro en pixel (${Math.round(data.mapExtra.x)}, ${Math.round(data.mapExtra.y)}), ${data.mapExtra.matches || 0} poligono(s) contienen el punto; I minima ${formatThreshold(data.mapExtra.threshold)}.`);
  } else {
    reasons.push("Situacion Extraordinaria: el epicentro cae fuera del ambito georreferenciado del mapa unificado.");
  }
  if (data.mapZero.inMap) {
    reasons.push(`Escenario 0 vectorial: epicentro en pixel (${Math.round(data.mapZero.x)}, ${Math.round(data.mapZero.y)}), ${data.mapZero.matches || 0} poligono(s) contienen el punto; I minima ${formatThreshold(data.mapZero.threshold)}.`);
  } else {
    reasons.push("Escenario 0: el epicentro cae fuera del ambito georreferenciado del mapa unificado.");
  }

  if (data.pga != null && data.pga >= 26.5) return decision(ZERO, data, [...reasons, "PGA >= 26,5 cm/s2: Escenario 0."]);
  if (data.pga != null && data.pga >= 9.4) return decision(EXTRA, data, [...reasons, "PGA >= 9,4 cm/s2: situacion extraordinaria."]);

  if (data.mapZero.threshold != null && data.intensity >= data.mapZero.threshold) {
    return decision(ZERO, data, [...reasons, `Io ${fmt(data.intensity)} >= umbral de Escenario 0 ${fmt(data.mapZero.threshold)}.`]);
  }
  if (data.mapExtra.threshold != null && data.intensity >= data.mapExtra.threshold) {
    return decision(EXTRA, data, [...reasons, `Io ${fmt(data.intensity)} >= umbral de Situacion Extraordinaria ${fmt(data.mapExtra.threshold)}.`]);
  }
  if (!data.mapExtra.inMap && !data.mapZero.inMap) {
    return decision(UNKNOWN, data, [...reasons, "No hay lectura de mapa valida; se requiere revision manual."]);
  }
  return decision(ORDINARY, data, [...reasons, `Io ${fmt(data.intensity)} queda por debajo de los umbrales leidos en los mapas.`]);
}

async function fetchIgnEvents(days) {
  const html = await fetchIgnHtml(days);
  const events = parseIgnRecentHtml(html);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return events
    .filter((event) => !event.utcDate || event.utcDate.getTime() >= cutoff)
    .sort((a, b) => (b.utcDate?.getTime() || 0) - (a.utcDate?.getTime() || 0));
}

async function fetchIgnHtml(days) {
  if (requiresLocalServer()) {
    throw new Error(`Estas abriendo la app desde ${location.origin}. Desde GitHub Pages el navegador bloquea la lectura IGN del servidor local. Abre ${DEFAULT_LOCAL_APP_URL}?v=5 en el iPhone, con el ordenador y el movil en la misma Wi-Fi y serve.ps1 abierto.`);
  }
  let lastError = "";
  for (const baseUrl of ignProxyUrls()) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${separator}days=${encodeURIComponent(days)}`;
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = `${url}: codigo ${response.status}`;
        continue;
      }
      const html = await response.text();
      if (!html.includes("terremoto0") && !html.includes("<td>es")) {
        lastError = `${url}: respuesta sin filas de terremotos`;
        continue;
      }
      return html;
    } catch (error) {
      lastError = `${url}: ${error.message}`;
    }
  }
  throw new Error(`No se pudo conectar con el proxy del IGN en ${location.origin}. Comprueba que el movil esta en la misma Wi-Fi que el ordenador y que serve.ps1 sigue abierto. Ultimo error: ${lastError}`);
}

function ignProxyUrls() {
  const origin = location.origin && location.origin !== "null" ? location.origin : "";
  return [`${origin}/${IGN_PROXY_PATH}`, `./${IGN_PROXY_PATH}`];
}

function requiresLocalServer() {
  return location.protocol === "https:" && /(^|\.)github\.io$/i.test(location.hostname);
}

function initProxyNotice() {
  const notice = $("proxyNote");
  const link = $("localAppLink");
  if (!notice || !link) return;
  link.href = `${DEFAULT_LOCAL_APP_URL}?v=5`;
  if (requiresLocalServer()) notice.hidden = false;
}

function parseIgnRecentHtml(html) {
  const rows = [];
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)(?=<tr\b|<\/table>)/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(html))) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => cleanHtmlCell(match[1]));
    if (cells.length < 11 || !/^es\d{4}/i.test(cells[0])) continue;
    const utcDate = parseIgnUtcDate(cells[1], cells[2]);
    rows.push({
      event: cells[0],
      date: cells[1],
      utc: cells[2],
      localTime: cells[3],
      lat: toNumber(cells[4]),
      lon: toNumber(cells[5]),
      depthKm: toNumber(cells[6]),
      magnitude: toNumber(cells[7]),
      magnitudeType: cells[8] || "mbLg",
      maxIntensity: parseIntensity(cells[9]),
      zone: cells[10],
      utcDate,
    });
  }
  return rows.filter((event) => event.lat != null && event.lon != null && event.magnitude != null);
}

function cleanHtmlCell(html) {
  const withoutTags = html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  const named = {
    aacute: "\u00e1", eacute: "\u00e9", iacute: "\u00ed", oacute: "\u00f3", uacute: "\u00fa", ntilde: "\u00f1",
    Aacute: "\u00c1", Eacute: "\u00c9", Iacute: "\u00cd", Oacute: "\u00d3", Uacute: "\u00da", Ntilde: "\u00d1",
    amp: "&", quot: '"', lt: "<", gt: ">",
  };
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&([A-Za-z]+);/g, (match, name) => named[name] ?? named[name.toLowerCase()] ?? match)
    .replace(/&#39;/g, "'");
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&Aacute;/g, "Á")
    .replace(/&Eacute;/g, "É")
    .replace(/&Iacute;/g, "Í")
    .replace(/&Oacute;/g, "Ó")
    .replace(/&Uacute;/g, "Ú")
    .replace(/&Ntilde;/g, "Ñ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function parseIgnUtcDate(dateText, timeText) {
  const dateMatch = String(dateText || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const timeMatch = String(timeText || "").match(/(\d{2}):(\d{2}):(\d{2})/);
  if (!dateMatch || !timeMatch) return null;
  return new Date(Date.UTC(
    Number(dateMatch[3]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[1]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3]),
  ));
}

function ignEventToText(event) {
  const latDir = event.lat >= 0 ? "norte" : "sur";
  const lonDir = event.lon >= 0 ? "este" : "oeste";
  return [
    `EVENTO: ${event.event}`,
    `HORA LOCAL(*): ${event.date} ${event.localTime || ""}`,
    `HORA UTC: ${event.date} ${event.utc || ""}`,
    `Latitud: ${Math.abs(event.lat)} grados ${latDir}`,
    `Longitud: ${Math.abs(event.lon)} grados ${lonDir}`,
    `Profundidad: ${event.depthKm ?? ""} km`,
    event.magnitudeType ? `Magnitud ${event.magnitudeType}: ${event.magnitude}` : `Magnitud: ${event.magnitude}`,
    event.maxIntensity != null ? `Intensidad: ${event.maxIntensity}` : "",
    `Zona epicentral: ${event.zone || ""}`,
  ].filter(Boolean).join("\n");
}

function overallIgnDecision(results, days) {
  if (!results.length) {
    return decision(UNKNOWN, {}, [`No se han encontrado terremotos IGN validos en los ultimos ${days} dias.`]);
  }
  const worst = results.reduce((best, item) => SEVERITY_RANK[item.level] > SEVERITY_RANK[best.level] ? item : best, results[0]);
  const data = { ...worst.data };
  data.event = `${results.length} sismos IGN`;
  return decision(worst.level, data, [
    `Analizados ${results.length} terremotos del IGN en los ultimos ${days} dias.`,
    `Estado del embalse: se adopta el estado mas grave obtenido entre todos los sismos.`,
    `Evento condicionante: ${worst.data.event || "-"} (${worst.data.zone || "-"}) -> ${statusLabel(worst.level)}.`,
  ]);
}

function enforceNestedZeroThreshold(data) {
  if (data.mapZero?.source === "vector") return;
  if (data.mapExtra?.threshold == null || data.mapZero?.threshold == null) return;
  if (data.mapZero.threshold >= data.mapExtra.threshold) return;
  data.mapZero.rawThreshold = data.mapZero.threshold;
  data.mapZero.threshold = data.mapExtra.threshold;
}

async function readMapThreshold(mapKey, lat, lon) {
  const map = MAPS[mapKey];
  const point = rotatePixel(latLonToPixel(map.georef, lat, lon), map.rotation);
  if (map.vector) {
    const inMap = point.x >= 0 && point.x < map.rotation.width && point.y >= 0 && point.y < map.rotation.height;
    const vector = readVectorThresholdsAtLatLon(lat, lon);
    return { ...point, inMap, ...vector, threshold: vector.zeroThreshold, matches: vector.zeroMatches, source: "vector" };
  }
  const grid = window.MAP_THRESHOLD_DATA?.[mapKey];
  if (!grid) throw new Error("No se ha cargado la tabla de umbrales de los mapas.");

  const inMap = point.x >= 0 && point.x < grid.width && point.y >= 0 && point.y < grid.height;
  if (!inMap) return { ...point, inMap, threshold: null };

  const gx = Math.max(0, Math.min(grid.gridWidth - 1, Math.floor(point.x / grid.step)));
  const gy = Math.max(0, Math.min(grid.gridHeight - 1, Math.floor(point.y / grid.step)));
  const threshold = conservativeThreshold(grid, gx, gy);
  return { ...point, inMap, threshold, gridCell: [gx, gy] };
}

function readMapThresholdAtPixel(mapKey, x, y) {
  const map = MAPS[mapKey];
  if (map?.vector) {
    const original = unrotatePixel({ x, y }, map.rotation);
    const geo = pixelToLatLon(map.georef, original.x, original.y);
    const vector = readVectorThresholdsAtLatLon(geo.lat, geo.lon);
    const inMap = x >= 0 && x < map.rotation.width && y >= 0 && y < map.rotation.height;
    return { x, y, inMap, ...vector, threshold: vector.zeroThreshold, matches: vector.zeroMatches, source: "vector" };
  }
  const grid = window.MAP_THRESHOLD_DATA?.[mapKey];
  if (!grid) return null;

  const inMap = x >= 0 && x < grid.width && y >= 0 && y < grid.height;
  if (!inMap) return { x, y, inMap, threshold: null };

  const gx = Math.max(0, Math.min(grid.gridWidth - 1, Math.floor(x / grid.step)));
  const gy = Math.max(0, Math.min(grid.gridHeight - 1, Math.floor(y / grid.step)));
  const threshold = conservativeThreshold(grid, gx, gy);
  return { x, y, inMap, threshold, gridCell: [gx, gy] };
}

function conservativeThreshold(grid, gx, gy) {
  let best = null;
  let hasOutsideCurve = false;

  for (let y = gy - CONSERVATIVE_CELL_RADIUS; y <= gy + CONSERVATIVE_CELL_RADIUS; y += 1) {
    for (let x = gx - CONSERVATIVE_CELL_RADIUS; x <= gx + CONSERVATIVE_CELL_RADIUS; x += 1) {
      if (x < 0 || y < 0 || x >= grid.gridWidth || y >= grid.gridHeight) continue;
      const encoded = grid.values[y * grid.gridWidth + x];
      if (encoded === 255) {
        hasOutsideCurve = true;
        continue;
      }
      if (encoded === 254 || encoded == null) continue;
      const value = encoded / 2;
      best = best == null ? value : Math.min(best, value);
    }
  }

  if (best != null) return best;
  return hasOutsideCurve ? Infinity : null;
}

function readVectorThresholdsAtLatLon(lat, lon) {
  const features = window.ZERO_VECTOR_DATA?.features || [];
  let zeroBest = null;
  let extraBest = null;
  let zeroMatches = 0;
  let extraMatches = 0;
  for (const feature of features) {
    if (!geometryContainsLonLat(feature.geometry, lon, lat)) continue;
    const zeroIntensity = Number(feature.properties?.Intensidad);
    const extraIntensity = Number(feature.properties?.IntensidadExtraordinaria ?? feature.properties?.IntensidadExpraordinaria);
    if (Number.isFinite(zeroIntensity)) {
      zeroBest = zeroBest == null ? zeroIntensity : Math.min(zeroBest, zeroIntensity);
      zeroMatches += 1;
    }
    if (Number.isFinite(extraIntensity)) {
      extraBest = extraBest == null ? extraIntensity : Math.min(extraBest, extraIntensity);
      extraMatches += 1;
    }
  }
  return { zeroThreshold: zeroBest, extraThreshold: extraBest, zeroMatches, extraMatches };
}

function geometryContainsLonLat(geometry, lon, lat) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return polygonContainsLonLat(geometry.coordinates, lon, lat);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => polygonContainsLonLat(polygon, lon, lat));
  return false;
}

function polygonContainsLonLat(polygon, lon, lat) {
  if (!polygon?.length || !pointInRing(polygon[0], lon, lat)) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(polygon[i], lon, lat)) return false;
  }
  return true;
}

function pointInRing(ring, lon, lat) {
  if (!ring?.length) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function renderIsolineOverlays() {
  for (const mapKey of Object.keys(MAPS)) {
    const map = MAPS[mapKey];
    const svg = $(map.isolineId);
    if (map.vector) {
      renderVectorOverlay(mapKey, svg);
      continue;
    }
    const grid = window.MAP_THRESHOLD_DATA?.[mapKey];
    if (!svg || !grid) continue;

    svg.setAttribute("viewBox", `0 0 ${grid.width} ${grid.height}`);
    svg.innerHTML = "";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", buildIsolinePath(grid));
    path.setAttribute("class", "isoline-path");
    svg.appendChild(path);
  }
}

function renderVectorOverlay(mapKey, svg) {
  const map = MAPS[mapKey];
  if (!svg || !window.ZERO_VECTOR_DATA) return;
  svg.setAttribute("viewBox", `0 0 ${map.rotation.width} ${map.rotation.height}`);
  svg.innerHTML = "";

  for (const feature of window.ZERO_VECTOR_DATA.features || []) {
    const pathData = geoJsonGeometryToPath(feature.geometry, map);
    if (!pathData) continue;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("class", "vector-zone-outline");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#050505");
    path.setAttribute("stroke-width", "2.2");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("opacity", "0.86");
    path.dataset.intensity = feature.properties?.Intensidad ?? "";
    path.dataset.extraIntensity = feature.properties?.IntensidadExtraordinaria ?? "";
    svg.appendChild(path);
  }
}

function renderLatLonGrid(svg, map) {
  const grid = document.createElementNS("http://www.w3.org/2000/svg", "g");
  grid.setAttribute("class", "latlon-grid");
  const lonStart = Math.ceil(map.georef.west);
  const lonEnd = Math.floor(map.georef.east);
  const latStart = Math.ceil(map.georef.south);
  const latEnd = Math.floor(map.georef.north);

  for (let lon = lonStart; lon <= lonEnd; lon += 1) {
    const a = rotatePixel(latLonToPixel(map.georef, map.georef.south, lon), map.rotation);
    const b = rotatePixel(latLonToPixel(map.georef, map.georef.north, lon), map.rotation);
    appendGridLine(grid, a.x, a.y, b.x, b.y);
    appendGridLabel(grid, b.x + 8, 30, `${Math.abs(lon)}°${lon < 0 ? "O" : lon > 0 ? "E" : ""}`);
  }

  for (let lat = latStart; lat <= latEnd; lat += 1) {
    const a = rotatePixel(latLonToPixel(map.georef, lat, map.georef.west), map.rotation);
    const b = rotatePixel(latLonToPixel(map.georef, lat, map.georef.east), map.rotation);
    appendGridLine(grid, a.x, a.y, b.x, b.y);
    appendGridLabel(grid, 12, a.y - 8, `${lat}°N`);
  }

  svg.appendChild(grid);
}

function appendGridLine(group, x1, y1, x2, y2) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1.toFixed(1));
  line.setAttribute("y1", y1.toFixed(1));
  line.setAttribute("x2", x2.toFixed(1));
  line.setAttribute("y2", y2.toFixed(1));
  group.appendChild(line);
}

function appendGridLabel(group, x, y, text) {
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", x.toFixed(1));
  label.setAttribute("y", y.toFixed(1));
  label.textContent = text;
  group.appendChild(label);
}

function geoJsonGeometryToPath(geometry, map) {
  if (!geometry) return "";
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates
      : [];
  const parts = [];

  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!ring?.length) continue;
      const commands = ring.map(([lon, lat], index) => {
        const point = rotatePixel(latLonToPixel(map.georef, lat, lon), map.rotation);
        return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
      });
      if (commands.length) parts.push(`${commands.join("")}Z`);
    }
  }
  return parts.join("");
}

function buildIsolinePath(grid) {
  const parts = [];
  const { gridWidth, gridHeight, step, values } = grid;
  const codes = uniqueThresholdCodes(values);

  for (let i = 0; i < codes.length - 1; i += 1) {
    const level = (codes[i] + codes[i + 1]) / 2;
    for (let y = 0; y < gridHeight - 1; y += 1) {
      for (let x = 0; x < gridWidth - 1; x += 1) {
        appendMarchingSquare(parts, grid, x, y, level);
      }
    }
  }

  return parts.join("");
}

function uniqueThresholdCodes(values) {
  return [...new Set(values.filter(isThresholdClass))].sort((a, b) => a - b);
}

function appendMarchingSquare(parts, grid, x, y, level) {
  const { gridWidth, step, values } = grid;
  const v0 = values[y * gridWidth + x];
  const v1 = values[y * gridWidth + x + 1];
  const v2 = values[(y + 1) * gridWidth + x + 1];
  const v3 = values[(y + 1) * gridWidth + x];
  if (![v0, v1, v2, v3].every(isThresholdClass)) return;

  const x0 = (x + 0.5) * step;
  const x1 = (x + 1.5) * step;
  const y0 = (y + 0.5) * step;
  const y1 = (y + 1.5) * step;
  const points = [];

  addCrossing(points, v0, v1, level, x0, y0, x1, y0);
  addCrossing(points, v1, v2, level, x1, y0, x1, y1);
  addCrossing(points, v2, v3, level, x1, y1, x0, y1);
  addCrossing(points, v3, v0, level, x0, y1, x0, y0);

  if (points.length === 2) {
    parts.push(pathSegment(points[0], points[1]));
  } else if (points.length === 4) {
    parts.push(pathSegment(points[0], points[1]));
    parts.push(pathSegment(points[2], points[3]));
  }
}

function addCrossing(points, a, b, level, x0, y0, x1, y1) {
  if ((a < level && b < level) || (a > level && b > level) || a === b) return;
  const t = (level - a) / (b - a);
  points.push({
    x: x0 + (x1 - x0) * t,
    y: y0 + (y1 - y0) * t,
  });
}

function pathSegment(a, b) {
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

function isThresholdClass(code) {
  return code != null && code < 254;
}

function latLonToPixel(georef, lat, lon) {
  if (georef.mode === "standard") {
    return {
      x: (lon - georef.lon0) * georef.pxDegX,
      y: (georef.lat0 - lat) * georef.pxDegY,
    };
  }
  if (georef.mode === "webMercator") {
    const nw = webMercatorPoint(georef.west, georef.north);
    const se = webMercatorPoint(georef.east, georef.south);
    const p = webMercatorPoint(lon, lat);
    return {
      x: ((p.x - nw.x) / (se.x - nw.x)) * georef.width,
      y: ((p.y - nw.y) / (se.y - nw.y)) * georef.height,
    };
  }
  return {
    x: georef.xLat0 + (georef.lat0 - lat) * georef.pxDegX,
    y: georef.yLon0 + (georef.lon0 - lon) * georef.pxDegY,
  };
}

function initSatelliteTiles() {
  const map = MAPS.zero;
  const container = $("zeroSatelliteTiles");
  if (!container) return;

  const view = mapViews.zero;
  const frame = $(map.frameId);
  const zoom = Math.min(ZERO_SATELLITE_MAX_ZOOM, ZERO_SATELLITE_ZOOM + Math.ceil(Math.log2(Math.max(1, view.scale))));
  const scale = 256 * 2 ** zoom;
  const visible = visibleMapBounds(frame, view, map.georef.width, map.georef.height);
  const padX = (visible.x1 - visible.x0) * 0.35;
  const padY = (visible.y1 - visible.y0) * 0.35;
  const x0 = Math.max(0, visible.x0 - padX);
  const x1 = Math.min(map.georef.width, visible.x1 + padX);
  const y0 = Math.max(0, visible.y0 - padY);
  const y1 = Math.min(map.georef.height, visible.y1 + padY);
  const nw = pixelToLatLon(map.georef, x0, y0);
  const se = pixelToLatLon(map.georef, x1, y1);
  const tileMin = lonLatToTile(nw.lon, nw.lat, zoom);
  const tileMax = lonLatToTile(se.lon, se.lat, zoom);
  const startX = Math.floor(Math.min(tileMin.x, tileMax.x));
  const endX = Math.floor(Math.max(tileMin.x, tileMax.x));
  const startY = Math.floor(Math.min(tileMin.y, tileMax.y));
  const endY = Math.floor(Math.max(tileMin.y, tileMax.y));
  const key = `${zoom}:${startX}:${endX}:${startY}:${endY}`;
  if (satelliteState.zero.key === key) return;
  satelliteState.zero = { zoom, key };
  const worldTiles = 2 ** zoom;

  const fragment = document.createDocumentFragment();
  for (let ty = startY; ty <= endY; ty += 1) {
    for (let tx = startX; tx <= endX; tx += 1) {
      const tile = document.createElement("img");
      const wrappedX = ((tx % worldTiles) + worldTiles) % worldTiles;
      const server = Math.abs(tx + ty) % 4;
      tile.src = `https://mt${server}.google.com/vt/lyrs=s&x=${wrappedX}&y=${ty}&z=${zoom}`;
      tile.alt = "";
      tile.loading = "lazy";
      tile.decoding = "async";
      const box = tileBoundsToMapBox(tx, ty, zoom, map.georef);
      tile.style.left = `${box.left}%`;
      tile.style.top = `${box.top}%`;
      tile.style.width = `${box.width}%`;
      tile.style.height = `${box.height}%`;
      fragment.appendChild(tile);
    }
  }
  container.replaceChildren(fragment);
}

function lonLatToTile(lon, lat, zoom) {
  const p = webMercatorPoint(lon, lat);
  const scale = 2 ** zoom;
  return { x: p.x * scale, y: p.y * scale };
}

function tileToLonLat(x, y, zoom) {
  const scale = 2 ** zoom;
  return inverseWebMercatorPoint(x / scale, y / scale);
}

function tileBoundsToMapBox(tx, ty, zoom, georef) {
  const nw = tileToLonLat(tx, ty, zoom);
  const se = tileToLonLat(tx + 1, ty + 1, zoom);
  const a = latLonToPixel(georef, nw.lat, nw.lon);
  const b = latLonToPixel(georef, se.lat, se.lon);
  const left = (a.x / georef.width) * 100;
  const top = (a.y / georef.height) * 100;
  const width = ((b.x - a.x) / georef.width) * 100;
  const height = ((b.y - a.y) / georef.height) * 100;
  return { left, top, width, height };
}

function visibleMapBounds(frame, view, width, height) {
  const x0 = ((0 - view.x) / view.scale) * (width / frame.clientWidth);
  const y0 = ((0 - view.y) / view.scale) * (height / frame.clientHeight);
  const x1 = ((frame.clientWidth - view.x) / view.scale) * (width / frame.clientWidth);
  const y1 = ((frame.clientHeight - view.y) / view.scale) * (height / frame.clientHeight);
  return {
    x0: Math.max(0, Math.min(width, x0)),
    y0: Math.max(0, Math.min(height, y0)),
    x1: Math.max(0, Math.min(width, x1)),
    y1: Math.max(0, Math.min(height, y1)),
  };
}

function webMercatorPoint(lon, lat) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: (lon + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

function inverseWebMercatorPoint(x, y) {
  const lon = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lon };
}

function rotatePixel(point, rotation) {
  if (!rotation?.clockwise) return point;
  return {
    x: rotation.height - point.y,
    y: point.x,
  };
}

function placeMarker(mapKey, data) {
  const map = MAPS[mapKey];
  const marker = $(map.markerId);
  const label = $(map.labelId);
  const reading = mapKey === "extra" ? data.mapExtra : data.mapZero;
  const size = getMapPixelSize(mapKey);
  if (!reading?.inMap || !size.width || !size.height) {
    marker.style.display = "none";
    return;
  }
  marker.style.display = "block";
  marker.style.left = `${(reading.x / size.width) * 100}%`;
  marker.style.top = `${(reading.y / size.height) * 100}%`;
  label.textContent = `${data.magnitudeType || "M"} ${fmt(data.magnitude)} | Io ${fmt(data.intensity)}`;
}

function renderBatchMarkers(results) {
  const container = $("quakeMarkers");
  const map = MAPS.zero;
  const size = getMapPixelSize("zero");
  if (!container || !size.width || !size.height) return;
  container.innerHTML = "";
  $("zeroMarker").style.display = "none";

  for (const result of results) {
    const data = result.data || {};
    const reading = data.mapZero || data.mapExtra;
    if (!reading?.inMap) continue;
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `batch-quake-marker ${statusClass(result.level)}`;
    marker.style.left = `${(reading.x / size.width) * 100}%`;
    marker.style.top = `${(reading.y / size.height) * 100}%`;
    marker.title = `${data.event || "-"} | ${statusLabel(result.level)} | ${data.zone || ""} | M ${fmt(data.magnitude)} | Io ${formatThreshold(data.intensity)}`;
    marker.addEventListener("click", () => selectIgnResult(result));
    container.appendChild(marker);
  }
}

function clearBatchMarkers() {
  const container = $("quakeMarkers");
  if (container) container.innerHTML = "";
}

function renderIgnEvents(results, days = numberValue($("ignDays")?.value, 7)) {
  const summary = $("ignSummary");
  const list = $("ignEventList");
  if (!summary || !list) return;
  if (!results.length) {
    summary.textContent = "Sin sismos analizados";
    list.innerHTML = `<p class="empty-list">Pulsa "Leer sismos del IGN" para analizar los terremotos recientes.</p>`;
    return;
  }

  const counts = {
    [ORDINARY]: results.filter((item) => item.level === ORDINARY).length,
    [EXTRA]: results.filter((item) => item.level === EXTRA).length,
    [ZERO]: results.filter((item) => item.level === ZERO).length,
    [UNKNOWN]: results.filter((item) => item.level === UNKNOWN).length,
  };
  summary.textContent = `${results.length} sismos en ${days} dias | Ordinaria ${counts[ORDINARY]} | Extra ${counts[EXTRA]} | Esc. 0 ${counts[ZERO]}`;

  const rows = results.map((result, index) => {
    const data = result.data || {};
    const event = data.ignEvent || {};
    return `
      <tr class="${statusClass(result.level)}">
        <td><button type="button" class="event-link" data-index="${index}">${escapeHtml(data.event || "-")}</button></td>
        <td>${escapeHtml([event.date, event.utc].filter(Boolean).join(" "))}</td>
        <td>${fmt(data.lat)} / ${fmt(data.lon)}</td>
        <td>
          <div class="magnitude-editor">
            <input class="event-magnitude-input" data-index="${index}" type="number" step="0.1" value="${escapeHtml(data.magnitude ?? "")}" aria-label="Magnitud ${escapeHtml(data.event || "")}">
            <select class="event-magnitude-type" data-index="${index}" aria-label="Tipo de magnitud ${escapeHtml(data.event || "")}">
              ${magnitudeTypeOptions(data.magnitudeType)}
            </select>
          </div>
        </td>
        <td>${formatThreshold(data.intensity)}</td>
        <td>${formatThreshold(data.mapExtra?.threshold)}</td>
        <td>${formatThreshold(data.mapZero?.threshold)}</td>
        <td><span class="status-pill ${statusClass(result.level)}">${statusLabel(result.level)}</span></td>
        <td>${escapeHtml(data.zone || "-")}</td>
      </tr>`;
  }).join("");

  list.innerHTML = `
    <table class="event-table">
      <thead>
        <tr>
          <th>Evento</th>
          <th>UTC</th>
          <th>Lat/Lon</th>
          <th>Mag.</th>
          <th>Io</th>
          <th>Extra</th>
          <th>Esc. 0</th>
          <th>Estado</th>
          <th>Zona</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  for (const button of list.querySelectorAll(".event-link")) {
    button.addEventListener("click", () => selectIgnResult(results[Number(button.dataset.index)]));
  }
  for (const input of list.querySelectorAll(".event-magnitude-input")) {
    input.addEventListener("change", () => updateIgnMagnitude(Number(input.dataset.index), input.value, null));
  }
  for (const select of list.querySelectorAll(".event-magnitude-type")) {
    select.addEventListener("change", () => updateIgnMagnitude(Number(select.dataset.index), null, select.value));
  }
}

function magnitudeTypeOptions(currentType = "") {
  const normalizedCurrent = normalizeMagnitudeType(currentType);
  const options = ["Mw", "mbLg", "mb", "ML", "Md", "mbvc"];
  const hasCurrent = options.some((option) => normalizeMagnitudeType(option) === normalizedCurrent);
  const allOptions = hasCurrent || !currentType ? options : [currentType, ...options];
  return allOptions.map((option) => {
    const selected = normalizeMagnitudeType(option) === normalizedCurrent ? " selected" : "";
    return `<option value="${escapeHtml(option)}"${selected}>${escapeHtml(option)}</option>`;
  }).join("");
}

async function updateIgnMagnitude(index, magnitudeValue, magnitudeType) {
  const current = lastIgnResults[index]?.data?.ignEvent;
  if (!current) return;
  const events = lastIgnResults.map((result) => ({ ...result.data.ignEvent }));
  const event = events[index];
  if (magnitudeValue != null) {
    const magnitude = toNumber(magnitudeValue);
    if (magnitude == null) {
      render(decision(UNKNOWN, {}, [`La magnitud introducida para ${event.event || "el evento"} no es valida.`]));
      return;
    }
    event.magnitude = magnitude;
  }
  if (magnitudeType != null) event.magnitudeType = magnitudeType;
  await analyzeIgnEvents(events, numberValue($("ignDays")?.value, 7));
}

function selectIgnResult(result) {
  if (!result) return;
  render(result);
  placeMarker("zero", result.data);
}

function statusClass(level) {
  if (level === ZERO) return "zero";
  if (level === EXTRA) return "extra";
  if (level === ORDINARY) return "ordinary";
  return "unknown";
}

function statusLabel(level) {
  if (level === ZERO) return "Escenario 0";
  if (level === EXTRA) return "Situacion extraordinaria";
  if (level === ORDINARY) return "Situacion ordinaria";
  return "Revision manual";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function getMapPixelSize(mapKey) {
  const map = MAPS[mapKey];
  if (map.vector) return { width: map.rotation.width, height: map.rotation.height };
  const img = $(map.imgId);
  return { width: img.naturalWidth || map.rotation.width, height: img.naturalHeight || map.rotation.height };
}

function initMapInteractions() {
  for (const mapKey of Object.keys(MAPS)) {
    const map = MAPS[mapKey];
    const frame = $(map.frameId);
    const tools = document.querySelector(`.map-tools[data-map="${mapKey}"]`);
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startView = null;

    tools.addEventListener("click", (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      if (action === "reset") {
        mapViews[mapKey] = { scale: 1, x: 0, y: 0 };
      } else {
        const factor = action === "zoomIn" ? 1.25 : 0.8;
        zoomMap(mapKey, factor, frame.clientWidth / 2, frame.clientHeight / 2);
      }
      applyMapTransform(mapKey);
    });

    frame.addEventListener("wheel", (event) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      zoomMap(mapKey, event.deltaY < 0 ? 1.15 : 0.87, event.clientX - rect.left, event.clientY - rect.top);
      applyMapTransform(mapKey);
    }, { passive: false });

    frame.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      dragging = true;
      frame.setPointerCapture(event.pointerId);
      frame.classList.add("dragging");
      startX = event.clientX;
      startY = event.clientY;
      startView = { ...mapViews[mapKey] };
    });

    frame.addEventListener("pointermove", (event) => {
      updateCoordinateTip(mapKey, event);
      if (dragging) {
        mapViews[mapKey].x = startView.x + event.clientX - startX;
        mapViews[mapKey].y = startView.y + event.clientY - startY;
        applyMapTransform(mapKey);
      }
    });

    frame.addEventListener("pointerleave", () => {
      const tip = $(map.coordTipId);
      tip.textContent = "Lat - | Lon - | UTM -";
      tip.classList.remove("visible");
    });

    frame.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const geo = getMapGeoAtEvent(mapKey, event);
      if (!geo) return;
      contextMenuPoint = { mapKey, ...geo };
      showContextMenu(event.clientX, event.clientY);
    });

    frame.addEventListener("pointerup", () => {
      dragging = false;
      frame.classList.remove("dragging");
    });

    frame.addEventListener("pointercancel", () => {
      dragging = false;
      frame.classList.remove("dragging");
    });

    applyMapTransform(mapKey);
  }
}

function zoomMap(mapKey, factor, originX, originY) {
  const view = mapViews[mapKey];
  const nextScale = Math.max(1, Math.min(10, view.scale * factor));
  const actual = nextScale / view.scale;
  view.x = originX - (originX - view.x) * actual;
  view.y = originY - (originY - view.y) * actual;
  view.scale = nextScale;
}

function updateCoordinateTip(mapKey, event) {
  const geo = getMapGeoAtEvent(mapKey, event);
  const map = MAPS[mapKey];
  const tip = $(map.coordTipId);
  if (!geo) {
    tip.textContent = "Fuera del mapa";
    positionCoordinateTip(mapKey, event, tip);
    tip.classList.add("visible");
    return;
  }
  tip.textContent = formatCoordinateText(geo);
  positionCoordinateTip(mapKey, event, tip);
  tip.classList.add("visible");
}

function positionCoordinateTip(mapKey, event, tip) {
  const frame = $(MAPS[mapKey].frameId);
  const rect = frame.getBoundingClientRect();
  const width = tip.offsetWidth || 260;
  const height = tip.offsetHeight || 48;
  let left = event.clientX - rect.left + COORD_TIP_CURSOR_OFFSET_PX;
  let top = event.clientY - rect.top + COORD_TIP_CURSOR_OFFSET_PX;

  if (left + width > frame.clientWidth - 8) left = event.clientX - rect.left - COORD_TIP_CURSOR_OFFSET_PX - width;
  if (top + height > frame.clientHeight - 8) top = event.clientY - rect.top - COORD_TIP_CURSOR_OFFSET_PX - height;

  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function getMapGeoAtEvent(mapKey, event) {
  const map = MAPS[mapKey];
  const frame = $(map.frameId);
  const size = getMapPixelSize(mapKey);
  if (!size.width || !size.height) return null;

  const rect = frame.getBoundingClientRect();
  const view = mapViews[mapKey];
  const displayX = (event.clientX - rect.left - view.x) / view.scale;
  const displayY = (event.clientY - rect.top - view.y) / view.scale;
  const px = displayX * (size.width / frame.clientWidth);
  const py = displayY * (size.height / frame.clientHeight);
  if (px < 0 || py < 0 || px >= size.width || py >= size.height) {
    return null;
  }

  const original = unrotatePixel({ x: px, y: py }, map.rotation);
  const geo = pixelToLatLon(map.georef, original.x, original.y);
  const utm = latLonToUtm(geo.lat, geo.lon);
  const reading = readMapThresholdAtPixel(mapKey, px, py);
  const threshold = reading?.threshold ?? null;
  const legend = formatLegendLabel(mapKey, threshold);
  return {
    ...geo,
    utm,
    threshold,
    legend,
    zeroThreshold: reading?.zeroThreshold ?? null,
    extraThreshold: reading?.extraThreshold ?? null,
    zeroLegend: formatLegendLabel("zero", reading?.zeroThreshold ?? null),
    extraLegend: formatLegendLabel("extra", reading?.extraThreshold ?? null),
  };
}

function formatCoordinateText(point) {
  if (point.zeroThreshold != null || point.extraThreshold != null) {
    return `Extra ${formatThreshold(point.extraThreshold)} (${point.extraLegend}) | Esc. 0 ${formatThreshold(point.zeroThreshold)} (${point.zeroLegend}) | Lat ${point.lat.toFixed(5)} | Lon ${point.lon.toFixed(5)} | UTM ${point.utm.zone}${point.utm.hemisphere} E ${Math.round(point.utm.easting)} N ${Math.round(point.utm.northing)}`;
  }
  return `I mapa ${formatThreshold(point.threshold)} (${point.legend}) | Lat ${point.lat.toFixed(5)} | Lon ${point.lon.toFixed(5)} | UTM ${point.utm.zone}${point.utm.hemisphere} E ${Math.round(point.utm.easting)} N ${Math.round(point.utm.northing)}`;
}

function initContextMenu() {
  const menu = $("mapContextMenu");
  menu.addEventListener("click", async (event) => {
    const action = event.target?.dataset?.action;
    if (!action || !contextMenuPoint) return;
    if (action === "copyCoords") await copyCoordinates(contextMenuPoint);
    if (action === "setQuakeCoords") {
      setQuakeCoordinates(contextMenuPoint);
      await runAnalyze();
    }
    hideContextMenu();
  });

  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) hideContextMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideContextMenu();
  });
  window.addEventListener("scroll", hideContextMenu, { passive: true });
  window.addEventListener("resize", hideContextMenu);
}

function showContextMenu(clientX, clientY) {
  const menu = $("mapContextMenu");
  menu.classList.add("open");
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.left = `${Math.min(clientX, window.innerWidth - width - 8)}px`;
  menu.style.top = `${Math.min(clientY, window.innerHeight - height - 8)}px`;
}

function hideContextMenu() {
  $("mapContextMenu").classList.remove("open");
}

async function copyCoordinates(point) {
  const text = `${formatCoordinateText(point)} | Lat ${point.lat.toFixed(6)}, Lon ${point.lon.toFixed(6)}`;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function setQuakeCoordinates(point) {
  const latLine = `Latitud: ${Math.abs(point.lat).toFixed(5)} grados ${point.lat >= 0 ? "norte" : "sur"}`;
  const lonLine = `Longitud: ${Math.abs(point.lon).toFixed(5)} grados ${point.lon <= 0 ? "oeste" : "este"}`;
  let text = textInput.value || "";

  if (/Latitud:\s*[^\n\r]*/i.test(text)) text = text.replace(/Latitud:\s*[^\n\r]*/i, latLine);
  else text = `${latLine}\n${text}`;

  if (/Longitud:\s*[^\n\r]*/i.test(text)) text = text.replace(/Longitud:\s*[^\n\r]*/i, lonLine);
  else text = text.replace(latLine, `${latLine}\n${lonLine}`);

  textInput.value = text;
}

function applyMapTransform(mapKey) {
  const map = MAPS[mapKey];
  const layer = $(map.layerId);
  const frame = $(map.frameId);
  const view = mapViews[mapKey];

  const maxX = 0;
  const maxY = 0;
  const minX = frame.clientWidth * (1 - view.scale);
  const minY = frame.clientHeight * (1 - view.scale);
  view.x = Math.min(maxX, Math.max(minX, view.x));
  view.y = Math.min(maxY, Math.max(minY, view.y));

  layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  if (mapKey === "zero") initSatelliteTiles();
}

function unrotatePixel(point, rotation) {
  if (!rotation?.clockwise) return point;
  return {
    x: point.y,
    y: rotation.height - point.x,
  };
}

function pixelToLatLon(georef, x, y) {
  if (georef.mode === "standard") {
    return {
      lat: georef.lat0 - y / georef.pxDegY,
      lon: georef.lon0 + x / georef.pxDegX,
    };
  }
  if (georef.mode === "webMercator") {
    const nw = webMercatorPoint(georef.west, georef.north);
    const se = webMercatorPoint(georef.east, georef.south);
    return inverseWebMercatorPoint(
      nw.x + (x / georef.width) * (se.x - nw.x),
      nw.y + (y / georef.height) * (se.y - nw.y),
    );
  }
  return {
    lat: georef.lat0 - (x - georef.xLat0) / georef.pxDegX,
    lon: georef.lon0 - (y - georef.yLon0) / georef.pxDegY,
  };
}

function latLonToUtm(lat, lon) {
  const zone = Math.floor((lon + 180) / 6) + 1;
  const hemisphere = lat >= 0 ? "N" : "S";
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e = Math.sqrt(f * (2 - f));
  const e2 = e * e;
  const ep2 = e2 / (1 - e2);
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const n = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
  const t = Math.tan(latRad) ** 2;
  const c = ep2 * Math.cos(latRad) ** 2;
  const A = Math.cos(latRad) * (lonRad - lon0);
  const m = a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * latRad
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * latRad)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * latRad)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * latRad)
  );

  let easting = k0 * n * (A + (1 - t + c) * A ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * A ** 5 / 120) + 500000;
  let northing = k0 * (m + n * Math.tan(latRad) * (A ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * A ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) northing += 10000000;

  return { zone, hemisphere, easting, northing };
}

function parseIgn(text) {
  const data = {};
  data.event = pick(text, /EVENTO:\s*([A-Za-z0-9_-]+)/i);
  data.utc = pick(text, /HORA\s+UTC:\s*([0-9:\-\s]+)/i);
  data.localTime = pick(text, /HORA\s+LOCAL\(?\*?\)?:\s*([0-9:\-\s]+)/i);
  data.zone = pick(text, /Zona\s+epicentral:\s*([^\n\r]+)/i);
  data.depthKm = toNumber(pick(text, /Profundidad:\s*([0-9]+(?:[,.][0-9]+)?)/i));
  data.lat = coordinate(text, /Latitud:\s*([0-9]+(?:[,.][0-9]+)?)\s*(grados)?\s*(norte|sur|N|S)?/i);
  data.lon = coordinate(text, /Longitud:\s*([0-9]+(?:[,.][0-9]+)?)\s*(grados)?\s*(este|oeste|E|W|O)?/i);
  data.magnitudeType = pick(text, /Magnitud\s*([A-Za-z0-9]+)?\s*:\s*[-+]?[0-9]+(?:[,.][0-9]+)?/i) || "Mw";
  data.magnitude = toNumber(pick(text, /Magnitud\s*[A-Za-z0-9]*\s*:\s*([-+]?[0-9]+(?:[,.][0-9]+)?)/i));
  data.intensity = parseIntensity(text);
  data.pga = toNumber(pick(text, /\bPGA\b[^0-9]*([0-9]+(?:[,.][0-9]+)?)/i));
  return data;
}

function parseIntensity(text) {
  const explicit = pick(text, /Intensidad\s*(?:EMS|epicentral|Io|I0)?[^0-9IVX]*([0-9]+(?:[,.][0-9]+)?|IV|V|VI|VII|VIII|IX|X|XI|XII)/i);
  if (!explicit) return null;
  const roman = { IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };
  return roman[explicit.toUpperCase()] ?? toNumber(explicit);
}

function toMomentMagnitude(magnitude, type = "") {
  if (!Number.isFinite(magnitude)) return null;
  const key = normalizeMagnitudeType(type);
  const conversions = {
    rawMw: magnitude,
    mbLg: 0.836 * magnitude + 0.676,
    mb: 1.213 * magnitude - 1.528,
  };

  if (key === "mw" || key === "mww" || key === "mwc" || key === "mwr" || key === "mwp" || key === "m") {
    return { mw: conversions.rawMw, method: "magnitud ya expresada como Mw" };
  }
  if (key.includes("mblg") || key === "mlg") {
    return { mw: conversions.mbLg, method: "conversion mbLg -> Mw: Mw = 0,836 M + 0,676" };
  }
  if (key === "mb" || key.startsWith("mb")) {
    return { mw: conversions.mb, method: "conversion mb -> Mw: Mw = 1,213 M - 1,528" };
  }

  const conservative = Math.max(conversions.rawMw, conversions.mbLg, conversions.mb);
  return {
    mw: conservative,
    method: `tipo ${type || "desconocido"} no tabulado; se adopta la mayor estimacion entre Mw directa, conversion mbLg y conversion mb`,
  };
}

function normalizeMagnitudeType(type = "") {
  return String(type)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function coordinate(text, regex) {
  const match = text.match(regex);
  if (!match) return null;
  const value = toNumber(match[1]);
  const dir = (match[3] || "").toLowerCase();
  if (dir === "sur" || dir === "s" || dir === "oeste" || dir === "w" || dir === "o") return -Math.abs(value);
  return value;
}

function normalize(text) {
  return text.replace(/\u0000/g, " ").replace(/[ \t]+/g, " ").replace(/\r/g, "\n");
}

function pick(text, regex) {
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function toNumber(value) {
  if (value == null) return null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function numberValue(value, fallback) {
  const number = toNumber(value);
  return number == null ? fallback : number;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function decision(level, data, reasons) {
  return { level, data, reasons };
}

function render(result) {
  const labels = {
    [ORDINARY]: ["Situacion ordinaria", "ordinary"],
    [EXTRA]: ["Situacion extraordinaria", "extra"],
    [ZERO]: ["Escenario 0", "zero"],
    [UNKNOWN]: ["Revision manual", "unknown"],
  };
  const [title, cls] = result ? labels[result.level] : ["Sin analizar", "ordinary"];
  $("statusTitle").textContent = title;
  $("statusBox").className = `status ${cls}`;
  $("statusDetail").textContent = result ? result.reasons[result.reasons.length - 1] : "Carga un aviso del IGN para calcular el estado.";

  const data = result?.data || {};
  $("eventId").textContent = data.event || "-";
  $("magnitude").textContent = data.magnitude == null ? "-" : `${fmt(data.magnitude)} ${data.magnitudeType || ""}`;
  $("intensity").textContent = data.intensity == null ? "-" : fmt(data.intensity);
  $("extraThreshold").textContent = formatThreshold(data.mapExtra?.threshold);
  $("zeroThreshold").textContent = formatThreshold(data.mapZero?.threshold);
  $("distance").textContent = data.distanceKm == null ? "-" : `${fmt(data.distanceKm)} km`;

  $("reasons").innerHTML = "";
  for (const reason of result?.reasons || []) {
    const li = document.createElement("li");
    li.textContent = reason;
    $("reasons").appendChild(li);
  }

  const fields = [
    ["Evento", data.event],
    ["Hora UTC", data.utc],
    ["Hora local", data.localTime],
    ["Latitud", data.lat],
    ["Longitud", data.lon],
    ["Profundidad", data.depthKm == null ? null : `${fmt(data.depthKm)} km`],
    ["Zona", data.zone],
    ["Mw calculada", data.mw == null ? null : fmt(data.mw)],
    ["PGA", data.pga == null ? null : `${fmt(data.pga)} cm/s2`],
  ];
  $("fields").innerHTML = "";
  for (const [key, value] of fields) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = key;
    dd.textContent = value == null || value === "" ? "-" : value;
    $("fields").append(dt, dd);
  }

  if (!result) {
    if ($("extraMarker")) $("extraMarker").style.display = "none";
    if ($("zeroMarker")) $("zeroMarker").style.display = "none";
  }
}

function formatThreshold(value) {
  if (value == null) return "-";
  if (value === Infinity) return "Fuera de curva";
  return fmt(value);
}

function formatLegendLabel(mapKey, threshold) {
  if (threshold == null) return "Sin leyenda";
  if (threshold === Infinity) return "Fuera de curva";
  const legend = LEGENDS[mapKey]?.find(([value]) => Math.abs(value - threshold) < 0.001);
  return legend ? legend[1] : `I>=${fmt(threshold)}`;
}

function fmt(value) {
  return Number(value).toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

render(null);

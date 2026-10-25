
const MAP_DATA_URL =
  "https://cdn.jsdelivr.net/gh/darmat1/ukraine-geo-data@main/geodata/Ukraine.geojson";

const API_URL = "https://tryvoha.online/api/v1";

const map = L.map("map", {
  zoomControl: true,
  attributionControl: true
}).setView([48.8, 31.4], 6);

// Жодних Google Maps або дорожньої підкладки.
let oblastLayer;
let regions = [];
let lastUpdate = null;

const statusEl = document.getElementById("status");
const alertsEl = document.getElementById("alerts-list");
const updatedEl = document.getElementById("updated");

function normalizeName(value) {
  return String(value || "")
    .toLocaleLowerCase("uk")
    .replace(/область|обл\.|місто|м\.|район/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^а-яіїєґa-z0-9]/gi, "");
}

function getFeatureName(feature) {
  const p = feature.properties || {};
  return p.name_uk || p.name || p.NAME_1 || p.name_en || "";
}

function getOblastName(feature) {
  return getFeatureName(feature);
}

function getFeatureStatus(feature, activeSlugs, regionsData) {
  const featureName = normalizeName(getOblastName(feature));

  const region = regionsData.find(r =>
    normalizeName(r.name_uk) === featureName
  );

  if (!region) return "unknown";

  if (activeSlugs.full.has(region.slug)) return "active";
  if (activeSlugs.partial.has(region.slug)) return "partial";

  return "calm";
}

function styleOblast(feature, activeSlugs, regionsData) {
  const state = getFeatureStatus(feature, activeSlugs, regionsData);

  let fillColor = "#ffffff";
  if (state === "active") fillColor = "#e53935";
  if (state === "partial") fillColor = "#f4c542";
  if (state === "unknown") fillColor = "#bdbdbd";

  return {
    color: "#171717",
    weight: 1.5,
    opacity: 1,
    fillColor,
    fillOpacity: 0.8
  };
}

function addOblastLabels(feature, layer) {
  const name = getOblastName(feature);
  if (!name) return;

  layer.bindTooltip(name, {
    permanent: true,
    direction: "center",
    className: "oblast-label",
    opacity: 1
  });
}

async function loadMap() {
  const response = await fetch(MAP_DATA_URL);
  if (!response.ok) throw new Error("Не вдалося завантажити межі областей");

  const geojson = await response.json();

  oblastLayer = L.geoJSON(geojson, {
    style: {
      color: "#171717",
      weight: 1.5,
      fillColor: "#ffffff",
      fillOpacity: 0.8
    },
    onEachFeature: (feature, layer) => {
      addOblastLabels(feature, layer);
      layer.bindPopup(getOblastName(feature) || "Область");
    }
  }).addTo(map);

  map.fitBounds(oblastLayer.getBounds(), { padding: [10, 10] });
}

async function refreshAlerts() {
  try {
    statusEl.textContent = "Завантаження статусів…";

    const [alertsResponse, regionsResponse] = await Promise.all([
      fetch(`${API_URL}/alerts`, { cache: "no-store" }),
      fetch(`${API_URL}/regions`, { cache: "no-store" })
    ]);

    if (!alertsResponse.ok || !regionsResponse.ok) {
      throw new Error("Джерело статусів тимчасово недоступне");
    }

    const alertData = await alertsResponse.json();
    regions = await regionsResponse.json();

    const activeSlugs = {
      full: new Set(),
      partial: new Set()
    };

    for (const alert of (alertData.alerts || [])) {
      if (alert.type === "state") {
        activeSlugs.full.add(alert.slug);
      } else if (alert.oblast_slug) {
        activeSlugs.partial.add(alert.oblast_slug);
      }
    }

    // Якщо область має загальну тривогу, не позначаємо її частковою.
    for (const slug of activeSlugs.full) {
      activeSlugs.partial.delete(slug);
    }

    if (oblastLayer) {
      oblastLayer.setStyle(feature =>
        styleOblast(feature, activeSlugs, regions)
      );
    }

    const activeAlerts = alertData.alerts || [];

    if (activeAlerts.length === 0) {
      alertsEl.textContent = "Активних тривог у джерелі не зазначено.";
    } else {
      alertsEl.replaceChildren();

      for (const alert of activeAlerts) {
        const item = document.createElement("li");
        const level = alert.level === "yellow" ? "ЖОВТИЙ" : "ЧЕРВОНИЙ";
        item.textContent = `${alert.name_uk || alert.slug} — ${level}`;
        alertsEl.appendChild(item);
      }
    }

    lastUpdate = new Date();
    updatedEl.textContent = lastUpdate.toLocaleTimeString("uk-UA");
    statusEl.textContent = "Дані отримано";
  } catch (error) {
    statusEl.textContent = "Не вдалося оновити дані";
    alertsEl.textContent =
      "Немає зв'язку з джерелом. Статуси на карті можуть бути застарілими.";
    console.error(error);
  }
}

async function start() {
  try {
    await loadMap();
    await refreshAlerts();
    setInterval(refreshAlerts, 60000);
  } catch (error) {
    statusEl.textContent = "Помилка завантаження карти";
    console.error(error);
  }
}

start();

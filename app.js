
"use strict";

const $ = (selector) => document.querySelector(selector);

const API = "https://tryvoha.online/api/v1";
const GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/darmat1/ukraine-geo-data@main/geodata/Ukraine.geojson";

let map = null;
let oblastLayer = null;
let regions = [];
let currentAlerts = [];
let events = [];
let activeFilter = "all";
let geoFeatures = [];

const normalize = (value) =>
  String(value || "")
    .toLocaleLowerCase("uk")
    .replace(/область|обл\.|місто|м\.|район/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^а-яіїєґa-z0-9]/gi, "");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function getFeatureName(feature) {
  const p = feature.properties || {};
  return p.name_uk || p.NAME_1 || p.name || p.name_en ||
    p.shapeName || p.NAME || "";
}

function findRegionForFeature(feature) {
  const featureName = normalize(getFeatureName(feature));
  if (!featureName) return null;

  return regions.find((region) => {
    const candidates = [
      region.name_uk,
      region.name_en,
      region.slug
    ].map(normalize);

    return candidates.some((name) =>
      name && (name === featureName ||
        name.replace(/ska$/, "ska") === featureName)
    );
  }) || null;
}

function getAlertsForOblast(slug) {
  return currentAlerts.filter((alert) =>
    alert.slug === slug ||
    alert.oblast_slug === slug
  );
}

function regionStyle(feature) {
  const region = findRegionForFeature(feature);

  if (!region) {
    return {
      color: "#222",
      weight: 1.2,
      fillColor: "#e5e5e5",
      fillOpacity: 1
    };
  }

  const alerts = getAlertsForOblast(region.slug);
  const hasRed = alerts.some((a) => a.level === "red");
  const hasYellow = alerts.some((a) => a.level === "yellow");

  let fillColor = "#f1f1f1";
  if (hasRed) fillColor = "#e84b50";
  else if (hasYellow) fillColor = "#f0bd45";
  else if (alerts.length) fillColor = "#e84b50";

  return {
    color: "#202020",
    weight: 1.4,
    opacity: 1,
    fillColor,
    fillOpacity: 0.88
  };
}

function addFeatureInteractions(feature, layer) {
  const name = getFeatureName(feature);
  const region = findRegionForFeature(feature);

  if (name) {
    layer.bindTooltip(name, {
      permanent: true,
      direction: "center",
      className: "oblast-label",
      opacity: 1
    });
  }

  layer.bindPopup(
    `<div class="oblast-popup"><strong>${escapeHtml(name || "Регіон")}</strong><br>` +
    `${region ? "Статус: перевіряється за API" : "Статус області не вдалося зіставити з даними API"}</div>`
  );

  layer.on("click", () => {
    if (region) {
      const active = getAlertsForOblast(region.slug);
      layer.setPopupContent(
        `<div class="oblast-popup"><strong>${escapeHtml(name)}</strong><br>` +
        (active.length
          ? `Активних повідомлень у джерелі: ${active.length}`
          : "Активних повідомлень у джерелі не знайдено") +
        "</div>"
      );
    }
  });
}

async function initMap() {
  const mapElement = $("#map");

  if (!window.L) {
    mapElement.innerHTML =
      '<div class="map-loading">Не вдалося завантажити Leaflet. Перевір інтернет.</div>';
    throw new Error("Leaflet не завантажився");
  }

  mapElement.replaceChildren();

  map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true,
    attributionControl: true
  }).setView([48.8, 31.2], 6);

  map.attributionControl.setPrefix(
    '<a href="https://leafletjs.com/">Leaflet</a>'
  );

  const response = await fetch(GEOJSON_URL, { cache: "force-cache" });
  if (!response.ok) throw new Error("Не вдалося завантажити GeoJSON");

  const geojson = await response.json();
  geoFeatures = geojson.features || [];

  if (!geoFeatures.length) {
    throw new Error("GeoJSON не містить географічних об'єктів");
  }

  oblastLayer = L.geoJSON(geojson, {
    style: regionStyle,
    onEachFeature: addFeatureInteractions
  }).addTo(map);

  map.fitBounds(oblastLayer.getBounds(), { padding: [8, 8] });

  setTimeout(() => map.invalidateSize(), 200);
}

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderEvents() {
  const list = $("#event-list");
  const visible = events.filter((event) =>
    activeFilter === "all" || event.category === activeFilter
  );

  $("#event-count").textContent = String(visible.length);
  $("#event-badge").textContent = String(visible.length);
  list.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Подій цієї категорії зараз немає.";
    list.append(empty);
    return;
  }

  for (const event of visible.slice(0, 60)) {
    const article = document.createElement("article");
    article.className = "event-item";

    const icon = document.createElement("div");
    icon.className = `event-icon ${event.category === "alert" ? "alert" : "info"}`;
    icon.textContent = event.category === "alert" ? "!" : "i";

    const body = document.createElement("div");
    body.className = "event-body";

    const meta = document.createElement("div");
    meta.className = "event-meta";

    const label = document.createElement("span");
    label.textContent = event.label;

    const time = document.createElement("time");
    time.textContent = event.time || "—";

    const title = document.createElement("strong");
    title.textContent = event.title;

    const detail = document.createElement("p");
    detail.textContent = event.detail;

    meta.append(label, time);
    body.append(meta, title, detail);
    article.append(icon, body);
    list.append(article);
  }
}

function setSystemEvent(title, detail) {
  events = events.filter((event) => event.category !== "system");
  events.unshift({
    category: "system",
    label: "СИСТЕМА",
    title,
    detail,
    time: formatTime(new Date().toISOString())
  });
}

function updateStatus(ok, title, detail) {
  $("#status-title").textContent = title;
  $("#status-detail").textContent = detail;
  $("#connection-state").textContent = ok ? "ONLINE" : "OFFLINE";
  $("#connection-label").textContent = ok ? "API підключено" : "Помилка з'єднання";
  $("#source-status").textContent = ok
    ? "Tryvoha.online — дані отримано"
    : "Джерело недоступне";
  $("#source-dot").classList.toggle("ok", ok);
  $("#source-dot").classList.toggle("error", !ok);
  $("#mode-pill").querySelector("span").textContent = ok
    ? "ДАНІ ПІДКЛЮЧЕНО"
    : "НЕМАЄ ЗВ'ЯЗКУ";
  $("#map-live").innerHTML = `<i></i> ${ok ? "ОНОВЛЕНО" : "НЕМАЄ ЗВ'ЯЗКУ"}`;
}

async function refreshAlerts() {
  try {
    const [alertsResponse, regionsResponse] = await Promise.all([
      fetch(`${API}/alerts`, { cache: "no-store" }),
      fetch(`${API}/regions`, { cache: "no-store" })
    ]);

    if (!alertsResponse.ok || !regionsResponse.ok) {
      throw new Error("API повернув помилку");
    }

    const alertData = await alertsResponse.json();
    const regionData = await regionsResponse.json();

    if (!Array.isArray(alertData.alerts) || !Array.isArray(regionData)) {
      throw new Error("Непередбачений формат відповіді API");
    }

    regions = regionData;
    currentAlerts = alertData.alerts;

    events = currentAlerts.map((alert) => ({
      category: "alert",
      label: alert.level === "yellow" ? "ЧАСТКОВА ТРИВОГА" : "ТРИВОГА",
      title: alert.name_uk || alert.slug || "Регіон",
      detail: alert.level === "yellow"
        ? "У джерелі позначено жовтий рівень повідомлення."
        : "У джерелі позначено активну тривогу.",
      time: formatTime(alert.started_at)
    }));

    setSystemEvent(
      "Дані успішно оновлено",
      "Статуси отримано з публічного API Tryvoha.online."
    );

    const activeRegions = new Set(
      currentAlerts.map((a) => a.oblast_slug || a.slug)
    );

    $("#alert-count").textContent = String(activeRegions.size);
    $("#alert-caption").textContent = "Регіони з активними повідомленнями";
    $("#last-update").textContent = formatTime(
      alertData.updated_at || new Date().toISOString()
    );

    updateStatus(
      true,
      "Дані тривог отримано",
      `Активних записів у джерелі: ${currentAlerts.length}. Перевіряй офіційні сповіщення.`
    );

    if (oblastLayer) oblastLayer.setStyle(regionStyle);
    renderEvents();
  } catch (error) {
    console.error("AIRWATCH API:", error);

    updateStatus(
      false,
      "Не вдалося оновити дані",
      "Статуси можуть бути застарілими. Перевір інтернет і офіційні сповіщення."
    );

    setSystemEvent(
      "Помилка підключення до API",
      "Актуальні статуси не підтверджено. Колір карти не слід вважати достовірним."
    );

    $("#alert-count").textContent = "—";
    $("#alert-caption").textContent = "Дані недоступні";
    renderEvents();
  }
}

function setupFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      activeFilter = button.dataset.filter;
      renderEvents();
    });
  });
}

function setupSearch() {
  const input = $("#region-search");
  const container = $("#region-results");

  input.addEventListener("input", () => {
    const query = normalize(input.value);
    container.replaceChildren();

    if (!query) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Введи назву області, щоб знайти її на карті.";
      container.append(empty);
      return;
    }

    const matches = geoFeatures.filter((feature) =>
      normalize(getFeatureName(feature)).includes(query)
    ).slice(0, 20);

    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent =
        "Не знайдено серед завантажених географічних об'єктів. Спробуй назву області.";
      container.append(empty);
      return;
    }

    matches.forEach((feature) => {
      const name = getFeatureName(feature);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";

      const title = document.createElement("strong");
      title.textContent = name || "Регіон";

      const hint = document.createElement("small");
      hint.textContent = "Показати на карті ↗";

      button.append(title, hint);
      button.addEventListener("click", () => {
        if (!map || !oblastLayer) return;

        const target = L.geoJSON(feature);
        map.fitBounds(target.getBounds(), { maxZoom: 9 });

        const region = findRegionForFeature(feature);
        const active = region ? getAlertsForOblast(region.slug) : [];

        L.popup()
          .setLatLng(target.getBounds().getCenter())
          .setContent(
            `<strong>${escapeHtml(name)}</strong><br>` +
            (region
              ? `Активних записів: ${active.length}`
              : "Не вдалося зіставити регіон із джерелом статусів")
          )
          .openOn(map);
      });

      container.append(button);
    });
  });
}

async function init() {
  setupFilters();
  setupSearch();

  try {
    await initMap();
  } catch (error) {
    console.error("AIRWATCH map:", error);
    $("#map").innerHTML =
      '<div class="map-loading">Не вдалося завантажити межі карти. Перевір інтернет.</div>';
    updateStatus(
      false,
      "Помилка завантаження карти",
      "Географічні дані тимчасово недоступні."
    );
  }

  await refreshAlerts();
  setInterval(refreshAlerts, 60000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

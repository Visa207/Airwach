
"use strict";

const $ = (selector) => document.querySelector(selector);

const GEOJSON_URL =
  "https://cdn.jsdelivr.net/gh/darmat1/ukraine-geo-data@main/geodata/Ukraine.geojson";

const ALERTS_API =
  "https://tryvoha.online/api/v1/alerts";

const REFRESH_INTERVAL = 30_000;

let events = [];
let map = null;
let boundaryLayer = null;
let glowLayer = null;
let placeMarkers = [];
let loadMessage = null;
let refreshTimer = null;
let lastAlertUpdate = null;
let alertRequestInProgress = false;

const places = [
  { name: "Київ", lat: 50.4501, lng: 30.5234 },
  { name: "Львів", lat: 49.8397, lng: 24.0297 },
  { name: "Ужгород", lat: 48.6208, lng: 22.2879 },
  { name: "Одеса", lat: 46.4825, lng: 30.7233 },
  { name: "Харків", lat: 49.9935, lng: 36.2304 },
  { name: "Дніпро", lat: 48.4647, lng: 35.0462 },
  { name: "Запоріжжя", lat: 47.8388, lng: 35.1396 },
  { name: "Чернігів", lat: 51.4982, lng: 31.2893 },
  { name: "Суми", lat: 50.9077, lng: 34.7981 },
  { name: "Полтава", lat: 49.5883, lng: 34.5514 },
  { name: "Черкаси", lat: 49.4444, lng: 32.0598 },
  { name: "Вінниця", lat: 49.2331, lng: 28.4682 },
  { name: "Житомир", lat: 50.2547, lng: 28.6587 },
  { name: "Рівне", lat: 50.6199, lng: 26.2516 },
  { name: "Луцьк", lat: 50.7472, lng: 25.3254 },
  { name: "Тернопіль", lat: 49.5535, lng: 25.5948 },
  { name: "Івано-Франківськ", lat: 48.9226, lng: 24.7111 },
  { name: "Чернівці", lat: 48.2915, lng: 25.9403 },
  { name: "Миколаїв", lat: 46.975, lng: 31.9946 },
  { name: "Херсон", lat: 46.6354, lng: 32.6169 },
  { name: "Кропивницький", lat: 48.5079, lng: 32.2623 },
  { name: "Хмельницький", lat: 49.4229, lng: 26.9871 },
  { name: "Донецьк", lat: 48.0159, lng: 37.8029 },
  { name: "Луганськ", lat: 48.574, lng: 39.3078 },
  { name: "Сімферополь", lat: 44.9521, lng: 34.1024 }
];

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function formatTime(value) {
  if (!value) return "Час невідомий";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Час невідомий";

  return date.toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Kyiv"
  });
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function renderEvents(filter = "all") {
  const visible = events.filter((event) => {
    if (filter === "all") return true;
    return event.category === filter;
  });

  setText("#event-count", String(visible.length));
  setText("#event-badge", String(visible.length));

  const list = $("#event-list");
  if (!list) return;

  list.replaceChildren();

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Подій цієї категорії зараз немає.";
    list.append(empty);
    return;
  }

  visible.forEach((event) => {
    const article = document.createElement("article");
    article.className = "event-item";

    const icon = document.createElement("div");
    icon.className = `event-icon ${event.category === "info" ? "info" : ""}`;
    icon.textContent =
      event.category === "alert" ? "!" :
      event.category === "system" ? "⌁" : "i";

    const body = document.createElement("div");
    body.className = "event-body";

    const meta = document.createElement("div");
    meta.className = "event-meta";

    const label = document.createElement("span");
    label.textContent = event.label;

    const time = document.createElement("time");
    time.textContent = event.time;

    const title = document.createElement("strong");
    title.textContent = event.title;

    const detail = document.createElement("p");
    detail.textContent = event.detail;

    meta.append(label, time);
    body.append(meta, title, detail);
    article.append(icon, body);
    list.append(article);
  });
}

function setupFilters() {
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      renderEvents(button.dataset.filter || "all");
    });
  });
}

function setConnectionStatus(connected, message) {
  const label = $("#connection-label");
  const source = $("#source-status");

  if (label) label.textContent = message;
  if (source) source.textContent = connected
    ? "Джерело даних доступне"
    : "Не вдалося отримати актуальні дані";
}

function addSystemEvent(title, detail) {
  events.push({
    category: "system",
    label: "СИСТЕМА",
    title,
    detail,
    time: formatTime(new Date().toISOString())
  });
}

async function loadAlerts() {
  if (alertRequestInProgress) return;
  alertRequestInProgress = true;

  try {
    const data = await fetchJson(ALERTS_API);

    if (!data || !Array.isArray(data.alerts)) {
      throw new Error("Непередбачений формат відповіді API");
    }

    const activeAlerts = data.alerts;

    const newEvents = activeAlerts.map((alert) => {
      const isYellow = alert.level === "yellow";
      const regionName = alert.name_uk || alert.name_en || alert.slug ||
        "Невідомий регіон";

      return {
        category: "alert",
        label: isYellow ? "ПОПЕРЕДЖЕННЯ" : "ТРИВОГА",
        title: regionName,
        detail: isYellow
          ? "Джерело повідомляє про жовтий рівень загрози."
          : "Джерело повідомляє про активну повітряну тривогу.",
        time: formatTime(alert.started_at)
      };
    });

    if (newEvents.length === 0) {
      newEvents.push({
        category: "info",
        label: "СТАТУС ДЖЕРЕЛА",
        title: "Активних тривог у відповіді API немає",
        detail: "Це дані незалежного сервісу; перевіряй офіційні сповіщення.",
        time: formatTime(data.updated_at)
      });
    }

    events = newEvents;

    lastAlertUpdate = new Date();
    setConnectionStatus(true, "Зв'язок є");
    setText("#last-update", `Оновлено: ${formatTime(data.updated_at || lastAlertUpdate.toISOString())}`);

    renderEvents(getActiveFilter());

  } catch (error) {
    console.error("Не вдалося отримати дані тривог:", error);

    // Не показуємо старі дані як актуальні.
    events = [{
      category: "info",
      label: "ПОМИЛКА ДЖЕРЕЛА",
      title: "Не вдалося отримати дані тривог",
      detail: "Перевір інтернет або спробуй пізніше. Поточний статус невідомий.",
      time: formatTime(new Date().toISOString())
    }];

    setConnectionStatus(false, "Немає зв'язку");
    setText("#last-update", lastAlertUpdate
      ? `Останній успішний запит: ${formatTime(lastAlertUpdate.toISOString())}`
      : "Актуальність даних не підтверджено");

    renderEvents(getActiveFilter());
  } finally {
    alertRequestInProgress = false;
  }
}

function getActiveFilter() {
  const active = document.querySelector("[data-filter].active");
  return active ? active.dataset.filter || "all" : "all";
}

function showMapMessage(message) {
  const mapElement = $("#map");
  if (!mapElement) return;

  if (!loadMessage) {
    loadMessage = document.createElement("div");
    loadMessage.className = "map-loading";
    mapElement.append(loadMessage);
  }

  loadMessage.textContent = message;
  loadMessage.style.display = "block";
}

function hideMapMessage() {
  if (loadMessage) loadMessage.style.display = "none";
}

async function initMap() {
  const mapElement = $("#map");
  if (!mapElement) return;

  mapElement.style.background = "#02040a";

  if (!window.L) {
    showMapMessage("Leaflet не завантажився. Перевір інтернет.");
    return;
  }

  mapElement.replaceChildren();
  loadMessage = null;

  map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true,
    doubleClickZoom: true,
    attributionControl: false,
    minZoom: 5,
    maxZoom: 11,
    zoomSnap: 0.25
  });

  map.getContainer().style.background = "#02040a";
  map.setView([48.8, 31.2], 6);

  showMapMessage("Завантаження контурів України…");

  try {
    const data = await fetchJson(GEOJSON_URL);

    if (!data || !Array.isArray(data.features) || !data.features.length) {
      throw new Error("GeoJSON не містить географічних об'єктів.");
    }

    glowLayer = L.geoJSON(data, {
      interactive: false,
      style: {
        color: "#007bff",
        weight: 8,
        opacity: 0.2,
        fillColor: "#031126",
        fillOpacity: 0.16,
        lineCap: "round",
        lineJoin: "round"
      }
    }).addTo(map);

    boundaryLayer = L.geoJSON(data, {
      style: {
        color: "#168cff",
        weight: 1.25,
        opacity: 1,
        fillColor: "#020713",
        fillOpacity: 0.12,
        lineCap: "round",
        lineJoin: "round"
      },
      onEachFeature: (feature, layer) => {
        layer.on("mouseover", () => {
          layer.setStyle({
            color: "#72c5ff",
            weight: 2,
            fillColor: "#092044",
            fillOpacity: 0.24
          });
        });

        layer.on("mouseout", () => {
          if (boundaryLayer) boundaryLayer.resetStyle(layer);
        });
      }
    }).addTo(map);

    const bounds = boundaryLayer.getBounds();

    if (!bounds.isValid()) {
      throw new Error("Не вдалося визначити межі карти.");
    }

    map.fitBounds(bounds, { padding: [14, 14], maxZoom: 6 });
    map.setMaxBounds(bounds.pad(0.18));

    hideMapMessage();

    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        if (boundaryLayer) {
          map.fitBounds(boundaryLayer.getBounds(), {
            padding: [14, 14],
            maxZoom: 6
          });
        }
      }
    }, 250);

  } catch (error) {
    console.error("Помилка завантаження контурів:", error);
    showMapMessage(
      "Не вдалося завантажити контури України. Перевір інтернет і спробуй оновити сторінку."
    );
  }
}

function clearPlaceMarkers() {
  if (map) {
    placeMarkers.forEach((marker) => map.removeLayer(marker));
  }
  placeMarkers = [];
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderSearchResults(query) {
  const container = $("#region-results");
  if (!container) return;

  container.replaceChildren();

  const normalized = query.trim().toLocaleLowerCase("uk");

  if (!normalized) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Введи назву міста, щоб знайти його на карті.";
    container.append(empty);
    clearPlaceMarkers();
    return;
  }

  const matches = places.filter((place) =>
    place.name.toLocaleLowerCase("uk").includes(normalized)
  );

  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "Місто не знайдено в локальному списку.";
    container.append(empty);
    clearPlaceMarkers();
    return;
  }

  matches.forEach((place) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";

    const name = document.createElement("strong");
    name.textContent = place.name;

    const hint = document.createElement("small");
    hint.textContent = "Показати на карті ↗";

    button.append(name, hint);

    button.addEventListener("click", () => {
      if (!map) {
        alert("Карта ще завантажується. Спробуй пізніше.");
        return;
      }

      clearPlaceMarkers();
      map.setView([place.lat, place.lng], 8);

      const marker = L.circleMarker([place.lat, place.lng], {
        radius: 5,
        color: "#a8ddff",
        weight: 2,
        fillColor: "#087bff",
        fillOpacity: 1
      }).addTo(map);

      marker.bindPopup(
        `<strong>${escapeHtml(place.name)}</strong><br>` +
        "Географічне розташування.<br>" +
        "Статус тривоги перевіряй у стрічці подій та офіційних сповіщеннях."
      ).openPopup();

      placeMarkers.push(marker);
    });

    container.append(button);
  });
}

function initSearch() {
  const search = $("#region-search");
  if (!search) return;

  search.addEventListener("input", (event) => {
    renderSearchResults(event.target.value);
  });

  renderSearchResults("");
}

function init() {
  setConnectionStatus(false, "Підключення…");

  events = [{
    category: "info",
    label: "СИСТЕМА",
    title: "Підключення до джерела даних",
    detail: "Очікуємо відповідь сервера. Статус тривог поки не підтверджено.",
    time: formatTime(new Date().toISOString())
  }];

  renderEvents();
  setupFilters();
  initSearch();
  initMap();

  loadAlerts();
  refreshTimer = setInterval(loadAlerts, REFRESH_INTERVAL);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

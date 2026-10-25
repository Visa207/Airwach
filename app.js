
"use strict";

const $ = (selector) => document.querySelector(selector);

const events = [
  {
    category: "system",
    label: "СИСТЕМА",
    title: "Інтерфейс готовий",
    detail: "AIRWATCH UA працює в демонстраційному режимі.",
    time: "Зараз"
  },
  {
    category: "info",
    label: "ІНФО",
    title: "Джерело не підключено",
    detail: "Реальні статуси тривог ще не надходять.",
    time: "—"
  }
];

// Координати використовуються тільки для пошуку населених пунктів.
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

let map = null;
let placeMarkers = [];

function renderEvents(filter = "all") {
  const visible = events.filter(
    (event) => filter === "all" || event.category === filter
  );

  $("#event-count").textContent = String(visible.length);
  $("#event-badge").textContent = String(visible.length);

  const list = $("#event-list");

  if (!visible.length) {
    list.innerHTML = '<p class="empty-state">Подій цієї категорії немає.</p>';
    return;
  }

  list.replaceChildren();

  visible.forEach((event) => {
    const article = document.createElement("article");
    article.className = "event-item";

    const icon = document.createElement("div");
    icon.className = `event-icon ${event.category === "info" ? "info" : ""}`;
    icon.textContent = event.category === "system" ? "⌁" : "i";

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

      renderEvents(button.dataset.filter);
    });
  });
}

function initMap() {
  const mapElement = $("#map");

  if (!window.L) {
    mapElement.innerHTML =
      '<div class="map-loading">Не вдалося завантажити карту. Перевір підключення до інтернету.</div>';
    return;
  }

  mapElement.replaceChildren();

  map = L.map("map", {
    zoomControl: true,
    scrollWheelZoom: true
  }).setView([48.8, 31.2], 6);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  L.control.scale({ imperial: false }).addTo(map);

  L.marker([48.8, 31.2])
    .addTo(map)
    .bindPopup(
      "<strong>AIRWATCH UA</strong><br>Центр огляду карти.<br>Дані тривог не підключені."
    );

  // Даємо карті час відобразитися після відкриття сторінки.
  setTimeout(() => map.invalidateSize(), 150);
}

function renderSearchResults(query) {
  const container = $("#region-results");
  container.replaceChildren();

  const normalized = query.trim().toLocaleLowerCase("uk");

  if (!normalized) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent =
      "Введи назву населеного пункту, щоб знайти його на карті.";
    container.append(message);
    clearPlaceMarkers();
    return;
  }

  const matches = places.filter((place) =>
    place.name.toLocaleLowerCase("uk").includes(normalized)
  );

  if (!matches.length) {
    const message = document.createElement("p");
    message.className = "empty-state";
    message.textContent = "Населений пункт не знайдено в локальному списку.";
    container.append(message);
    clearPlaceMarkers();
    return;
  }

  matches.forEach((place) => {
    const button = document.createElement("button");
    button.className = "search-result";
    button.type = "button";

    const name = document.createElement("strong");
    name.textContent = place.name;

    const hint = document.createElement("small");
    hint.textContent = "Показати на карті ↗";

    button.append(name, hint);

    button.addEventListener("click", () => {
      if (!map) {
        alert("Карта ще завантажується. Спробуй трохи пізніше.");
        return;
      }

      map.setView([place.lat, place.lng], 10);

      L.popup()
        .setLatLng([place.lat, place.lng])
        .setContent(
          `<strong>${escapeHtml(place.name)}</strong><br>Географічне розташування.<br>Статус тривоги невідомий.`
        )
        .openOn(map);
    });

    container.append(button);
  });
}

function clearPlaceMarkers() {
  placeMarkers.forEach((marker) => marker.remove());
  placeMarkers = [];
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function initSearch() {
  $("#region-search").addEventListener("input", (event) => {
    renderSearchResults(event.target.value);
  });
}

function init() {
  renderEvents();
  setupFilters();
  initSearch();
  initMap();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

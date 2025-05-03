document.addEventListener("DOMContentLoaded", function() {
    document.getElementById("back-button").addEventListener("click", goBack);
    document.getElementById("download-data").addEventListener("click", refreshData);
    document.getElementById("delete-data").addEventListener("click", deleteData);
});

const baseUrl = "https://www.dnd5eapi.co";
const dbName = "dnd5e-cache";
const storeName = "categories";
let db = null;
let currentData = null;
// liveMode: true, wenn keine lokale DB existiert
let liveMode = false;
// Speichert den aktuellen API-Pfad im Live-Modus (Standard: "/api/2014/")
let liveApiPath = "/api/2014/";

const statusEl = document.getElementById("status");
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");

// IndexedDB öffnen
async function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    request.onsuccess = (e) => {
      db = e.target.result;
      resolve();
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

// Daten im Cache speichern
function saveToCache(data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readwrite");
    const store = tx.objectStore(storeName);
    const request = store.put(data, "data");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Daten aus dem Cache abrufen
function getFromCache() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get("data");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Cache leeren
async function clearCache() {
  const tx = db.transaction([storeName], "readwrite");
  const store = tx.objectStore(storeName);
  store.clear();
  liveMode = true;
}

// JSON-Daten abrufen
async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

// Endpunkte abrufen
async function fetchEndpoints() {
  const response = await fetch(`${baseUrl}/api`);
  const json = await response.json();
  return Object.entries(json);
}

async function fetchAllData() {
    const results = new Map();
    const endpoints = await fetchEndpoints();
    console.log(document.getElementById("progress"));
    progressContainer.style.display = "block";
    let currentStep = 0;
  
    for (const [categoryName, endpoint] of endpoints) {
      const categoryUrl = `${baseUrl}${endpoint}`;
      const categoryData = await fetchJSON(categoryUrl);
  
      const detailedResults = new Map();
      if (Array.isArray(categoryData.results)) {
        for (let i = 0; i < categoryData.results.length; i++) {
          const item = categoryData.results[i];
          try {
            const detailData = await fetchJSON(`${baseUrl}${item.url}`);
            detailedResults.set(item.url, detailData);
            statusEl.textContent = `Lade ${detailData.name || item.index} aus ${categoryName} (${i + 1}/${categoryData.results.length})`;
          } catch (err) {
            console.warn("Fehler bei Detailabruf", item.url);
          }
        }
      }
  
      results.set(categoryName, {
        count: categoryData.count,
        results: Object.fromEntries(detailedResults)
      });
      progressBar.style.width = ((++currentStep / endpoints.length) * 100) + '%';
    }
  
    // Warte 250ms, bevor der Ladeprozess als fertig markiert wird.
    await new Promise(resolve => setTimeout(resolve, 250));
  
    const data = Object.fromEntries(results);
    await saveToCache(data);
    currentData = data;
    displayCategories();
    hideLoadingScreen();
    liveMode = false;
}

// Live-Daten direkt laden (Live-Modus, ohne Caching) von liveApiPath
async function loadDirectData() {
  try {
    // Hier wird liveApiPath genutzt (im Root-Fall "/api/2014/")
    const data = await fetchJSON(`${baseUrl}${liveApiPath}`);
    // Im Live‑Modus ist die Antwort beim Root-Aufruf ein Objekt, das alle Kategorien als Schlüssel enthält.
    currentData = data;
    displayCategories();
    hideLoadingScreen();
  } catch (err) {
    console.error("Fehler beim Laden der Live-Daten:", err);
    statusEl.textContent = "Fehler beim Laden der Live-Daten.";
    hideLoadingScreen();
  }
}

// Kategorien anzeigen
function displayCategories() {
  const container = document.getElementById("category-list");
  container.innerHTML = "";
  if (liveMode) {
    // Im Live-Modus gehen wir davon aus, dass currentData ein Objekt mit Kategorien als Keys ist.
    if (currentData) {
      for (const [category, endpoint] of Object.entries(currentData)) {
        const btn = document.createElement("button");
        btn.textContent = category;
        btn.onclick = () => showCategory(category);
        container.appendChild(btn);
      }
    } else {
      container.innerHTML = "<p>Keine Daten verfügbar.</p>";
    }
  } else {
    // Caching-Modus: gehe wie bisher vor
    if (currentData) {
      for (const category of Object.keys(currentData)) {
        const btn = document.createElement("button");
        btn.textContent = category;
        btn.onclick = () => showCategory(category);
        container.appendChild(btn);
      }
    } else {
      container.innerHTML = "<p>Keine Daten verfügbar.</p>";
    }
  }
  container.style.display = "flex";
  document.getElementById("sub-category-list").style.display = "none";
  document.getElementById("rendered-content").style.display = "none";
  document.getElementById("separator").style.display = "none";
  document.getElementById("back-button").style.display = "none";
  // "Lösche Daten"-Button nur im Caching-Modus anzeigen
  document.getElementById("delete-data").style.display = liveMode ? "none" : "inline-block";
  document.getElementById("download-data").textContent = liveMode ? "daten herunterladen" : "daten neu laden";
}

// Kategorie anzeigen
async function showCategory(category) {
  if (liveMode) {
    // Setze den API-Pfad für die ausgewählte Kategorie
    liveApiPath = "/api/2014/" + category + "/";
    // Lade den Ladebildschirm und rufe die Daten vom Live-Pfad ab
    showLoadingScreen();
    try {
      const data = await fetchJSON(baseUrl + liveApiPath);
      // Angenommen, die API liefert ein Objekt mit einem Array in "results"
      const subData = data.results ? data.results : (Array.isArray(data) ? data : []);
      // Aktualisiere currentData (optional, falls später benötigt)
      currentData = data;
      hideLoadingScreen();
      // Erstelle die Liste für die Unterkategorie
      const container = document.getElementById("sub-category-list");
      container.innerHTML = "";
      for (const item of subData) {
        const btn = document.createElement("button");
        btn.textContent = item.name || item.index || "Unbekannt";
        btn.onclick = () => showSubCategory(item.url, item);
        container.appendChild(btn);
      }
      // Hauptmenü ausblenden, Unterkategorie anzeigen
      document.getElementById("category-list").style.display = "none";
      container.style.display = "flex";
      document.getElementById("back-button").style.display = "inline-block";
    } catch (err) {
      console.error("Fehler beim Laden der Daten:", err);
      statusEl.textContent = "Fehler beim Abrufen der Kategorie-Daten.";
      hideLoadingScreen();
    }
  } else {
    // Caching-Modus wie bisher
    const subData = currentData[category]?.results;
    const container = document.getElementById("sub-category-list");
    container.innerHTML = "";
    for (const [url, data] of Object.entries(subData)) {
      const btn = document.createElement("button");
      btn.textContent = data.name || data.index || url;
      btn.onclick = () => showSubCategory(url, data);
      container.appendChild(btn);
    }
    document.getElementById("category-list").style.display = "none";
    container.style.display = "flex";
    document.getElementById("back-button").style.display = "inline-block";
  }
}

// Unterkategorie anzeigen
async function showSubCategory(url, data) {
  if (liveMode) {
    // Erweitere liveApiPath um das ausgewählte Element (z.B. "fireball")
    const detailPath = liveApiPath + (data.index || data.name);
    showLoadingScreen();
    try {
      const detailData = await fetchJSON(`${baseUrl}${detailPath}`);
      hideLoadingScreen();
      const contentEl = document.getElementById("rendered-content");
      contentEl.innerHTML = "";
      renderJSON(detailData, contentEl, 1);
      contentEl.style.display = "block";
      document.getElementById("separator").style.display = "block";
    } catch (err) {
      console.error("Fehler beim Laden der Detaildaten:", err);
      statusEl.textContent = "Fehler beim Abrufen der Detaildaten.";
      hideLoadingScreen();
    }
  } else {
    // Caching-Modus: Zeige die bereits vorhandenen Daten an.
    const contentEl = document.getElementById("rendered-content");
    contentEl.innerHTML = "";
    renderJSON(data, contentEl, 1);
    contentEl.style.display = "block";
    document.getElementById("separator").style.display = "block";
  }
}

// JSON-Daten rendern
function renderJSON(obj, parent, level) {
  const wrapper = document.createElement("div");
  wrapper.className = `content-level-${level}`;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      renderJSON(item, wrapper, level + 1);
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (key === "url" && typeof value === "string") {
        const button = document.createElement("button");
        button.textContent = `Gehe zu ${value}`;
        button.addEventListener("click", () => navigateToURL(value));
        wrapper.appendChild(button);
      } else if (typeof value === "object" && value !== null) {
        const subWrapper = document.createElement("div");
        const label = document.createElement("div");
        label.className = "content-info";
        label.textContent = key;
        subWrapper.appendChild(label);
        renderJSON(value, subWrapper, level + 1);
        wrapper.appendChild(subWrapper);
      } else {
        const info = document.createElement("div");
        info.className = "content-info";
        info.textContent = `${key}: ${value}`;
        wrapper.appendChild(info);
      }
    }
  } else {
    const info = document.createElement("div");
    info.className = "content-info";
    info.textContent = obj;
    wrapper.appendChild(info);
  }
  parent.appendChild(wrapper);
}

// Zurück zur Kategorieübersicht
function goBack() {
  if (liveMode) {
    liveApiPath = "/api/2014/";
    loadDirectData();
  } else {
    displayCategories();
  }
}

// Daten neu laden (Caching-Modus)
async function refreshData() {
  if (!liveMode){
    const confirmed = confirm("Daten wirklich neu laden?");
    if (confirmed) {
      await clearCache();
      showLoadingScreen();
      await fetchAllData();
    }
  } else {
      showLoadingScreen();
      await fetchAllData();
    }
}

// "Lösche Daten" Funktion, löscht den Cache und setzt den Live-Modus ein
async function deleteData() {
  const confirmed = confirm("Cache wirklich löschen?");
  if (confirmed) {
    await clearCache();
    // Nach dem Löschen in den Live-Modus wechseln und Live-Daten laden
    liveMode = true;
    showLoadingScreen();
    loadDirectData();
  }
}

// Ladebildschirm anzeigen
function showLoadingScreen() {
  document.getElementById("loading-container").style.display = "block";
  document.getElementById("main-content").style.display = "none";
}

// Ladebildschirm ausblenden
function hideLoadingScreen() {
  document.getElementById("loading-container").style.display = "none";
  document.getElementById("main-content").style.display = "block";
}

// Beim Laden der Seite:
// Prüfe, ob lokale Daten vorhanden sind und setze liveMode entsprechend.
openDB().then(async () => {
  const cached = await getFromCache();
  if (cached) {
    currentData = cached;
    liveMode = false;
  } else {
    liveMode = true;
  }
  if (liveMode) {
    loadDirectData();
  } else {
    displayCategories();
    hideLoadingScreen();
  }
}).catch(err => {
  console.error("Fehler:", err);
  statusEl.textContent = "Fehler beim Laden.";
  hideLoadingScreen();
});

async function navigateToURL(url) {
  const fixedUrl = url;
  const parts = fixedUrl.split("/");
  // Beispiel: bei "/api/2014/spells/fireball":
  // parts[3] = "spells", parts[4] = "fireball"
  const category = parts[3];
  const detailName = parts.slice(4).join("/") || "";
  const fullDetailPath = "/api/2014/" + category + "/" + detailName;
  
  if (!liveMode) {
    // Caching-Modus: suche im Cache nach dem Eintrag
    if (currentData[category] && currentData[category].results[fullDetailPath]) {
      showCategory(category);
      showSubCategory(fullDetailPath, currentData[category].results[fullDetailPath]);
    } else {
      alert("Eintrag nicht im Cache gefunden: " + fullDetailPath);
      console.log("Gesuchte Kategorie:", category);
      console.log("Gesuchte URL:", fullDetailPath);
      console.log("Verfügbare Keys:", Object.keys(currentData[category]?.results || {}));
    }
  } else {
    // Live-Modus: zuerst den Kategorie-Endpoint laden
    liveApiPath = "/api/2014/" + category + "/";
    try {
      // Warten, bis die Kategorie geladen wurde (zeigt Unterkategorie-Liste)
      await showCategory(category);
      // Anschließend Detailseite anzeigen
      // Wir übergeben als dummy data ein Objekt mit name, damit showSubCategory den richtigen detailPath baut
      showSubCategory(fullDetailPath, { name: detailName });
    } catch (err) {
      console.error("Fehler beim Navigieren zu URL:", err);
    }
  }
}

function debugLoading(percentage) {
    const loadingContainer = document.getElementById("loading-container");
    const mainContent = document.getElementById("main-content");
    const progressContainer = document.getElementById("progress-container");
    const progressBar = document.getElementById("progress-bar");

    if (loadingContainer && mainContent && progressBar && progressContainer) {
        loadingContainer.style.display = "block";
        mainContent.style.display = "none";
        progressContainer.style.display = "block";  // sicherstellen, dass der Container sichtbar ist
        progressBar.style.width = percentage + "%";
        console.log(`Ladebildschirm angezeigt, Fortschritt: ${percentage}%`);
    } else {
        console.error("Ein oder mehrere erforderliche Elemente wurden nicht gefunden.");
    }
}

window.debugLoading = debugLoading; // Exportiere die Funktion für den Debugging-Zweck

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/dnd5eexplorer/sw.js').then(() => {
      console.log('Service Worker registriert!');
    });
  }

  let deferredPrompt;
  const installButton = document.getElementById('installButton');
  
  // Überprüfe direkt beim Laden, ob die App im Standalone-Modus läuft
  if (window.matchMedia('(display-mode: standalone)').matches) {
    installButton.style.display = 'none';  // Button ausblenden
  } else {
    installButton.style.display = 'inline';  // Button anzeigen
  }
  
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  
    // Zeige den Installations-Button an
    installButton.style.display = 'block';
  
    installButton.addEventListener('click', () => {
      installButton.style.display = 'none';  // Button ausblenden
      deferredPrompt.prompt();  // Zeigt das Installationsprompt
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('Benutzer hat die Installation akzeptiert.');
        } else {
          console.log('Benutzer hat die Installation abgelehnt.');
        }
        deferredPrompt = null;
      });
    });
  });  
  

/*setInterval(function() {
  console.log("current API path:", liveApiPath);
  console.log("live mode:", liveMode);
  // Oder beliebige Funktionalität hier ausführen
}, 1000); // 5000 Millisekunden = 5 Sekunden */
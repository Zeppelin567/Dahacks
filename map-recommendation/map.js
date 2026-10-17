/* ============================================================
   map.js — Green Destination Discovery
   ============================================================
   Responsibilities:
   1. Request GPS location (or fall back to De Anza College).
   2. Show a pulsing blue user marker and a faint blue proximity circle.
   3. Call the Python backend (/api/recommendations) which queries live
      OpenStreetMap Overpass API, filters campus quads, and scores parks.
   4. Render green leaf pins with score tooltips on the map.
   5. Show a rich destination card (score, distance, amenities) on click.
   6. Provide a search bar powered by the backend search proxy.
   ============================================================ */

// --------------- Constants ---------------

const DEFAULT_LAT = 37.3195;
const DEFAULT_LNG = -122.0450;
const PROXIMITY_RADIUS_M = 5000;       // 5.0 km radius (encompasses parks, reservoirs, lakes, and mountain peaks)

// Detect API base: if served directly from FastAPI (port 8000), use relative path; otherwise hit localhost:8000
const API_BASE = window.location.port === '8000' ? '' : 'http://localhost:8000';
const RECOMMENDATIONS_ENDPOINT = `${API_BASE}/api/recommendations`;
const SEARCH_ENDPOINT = `${API_BASE}/api/search`;
const NOMINATIM_DIRECT = 'https://nominatim.openstreetmap.org/search';

// Category mapping fallback
const CATEGORY_MAP = {
  park:              { icon: '🌳', badge: 'Public Park' },
  nature_reserve:    { icon: '🌿', badge: 'Nature Reserve' },
  national_park:     { icon: '🌲', badge: 'National Park' },
  peak:              { icon: '⛰️', badge: 'Mountain Peak' },
  viewpoint:         { icon: '🌅', badge: 'Scenic Viewpoint' },
  water:             { icon: '💧', badge: 'Lake & Reservoir' },
  garden:            { icon: '🌸', badge: 'Public Garden' },
  recreation_ground: { icon: '🏞️', badge: 'Recreation Ground' },
  wood:              { icon: '🌲', badge: 'Woodland' },
  wetland:           { icon: '🌊', badge: 'Wetland' },
  default:           { icon: '🌿', badge: 'Nature Spot' },
};

// --------------- State ---------------

let map;
let userLat = DEFAULT_LAT;
let userLng = DEFAULT_LNG;
let userMarker = null;
let proximityCircle = null;
let greenMarkers = [];        // Leaflet markers for green pins
let recentMarkers = [];       // Leaflet markers for recent visits pins
let searchResultMarker = null; // single marker for search results
let selectedDestination = null;
let searchDebounceTimer = null;
let searchVersion = 0;
let cachedRecommendations = null; // Cached green recommendations
let recommendationsEnabled = false; // Default: OFF (shows recent visits only)

const RECENT_VISITS_KEY = 'bikemap_recent_visits';

// --------------- DOM refs ---------------

const gpsOverlay           = document.getElementById('gps-overlay');
const gpsEnableBtn         = document.getElementById('gps-enable-btn');
const gpsSkipBtn           = document.getElementById('gps-skip-btn');
const searchInput          = document.getElementById('search-input');
const searchClear          = document.getElementById('search-clear');
const searchResults        = document.getElementById('search-results');
const locateBtn            = document.getElementById('locate-btn');
const destCard             = document.getElementById('destination-card');
const cardIcon             = document.getElementById('card-icon');
const cardName             = document.getElementById('card-name');
const cardBadge            = document.getElementById('card-badge');
const cardScore            = document.getElementById('card-score');
const cardDistance         = document.getElementById('card-distance');
const cardAmenities        = document.getElementById('card-amenities');
const cardClose            = document.getElementById('card-close');
const cardRouteBtn         = document.getElementById('card-route-btn');
const liveStatusPill       = document.getElementById('live-status-pill');
const liveStatusText       = document.getElementById('live-status-text');
const recommendationToggle = document.getElementById('recommendation-toggle');
const recentHistoryBtn     = document.getElementById('recent-history-btn');
const recentCountBadge     = document.getElementById('recent-count-badge');
const recentModal          = document.getElementById('recent-modal');
const recentModalClose     = document.getElementById('recent-modal-close');
const recentModalBackdrop  = document.getElementById('recent-modal-backdrop');
const recentPlacesList     = document.getElementById('recent-places-list');
const clearRecentBtn       = document.getElementById('clear-recent-btn');

// ============================================================
//  1. Initialise the map
// ============================================================

function initMap(lat, lng) {
  map = L.map('map', {
    center: [lat, lng],
    zoom: 14,
    zoomControl: false,
  });

  // Standard OSM tile layer (darkened via CSS filter in style.css)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
}

// ============================================================
//  2. GPS Permission Flow
// ============================================================

function requestGPS() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: DEFAULT_LAT, lng: DEFAULT_LNG });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      ()    => resolve({ lat: DEFAULT_LAT, lng: DEFAULT_LNG }),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

gpsEnableBtn.addEventListener('click', async () => {
  gpsEnableBtn.textContent = 'Locating…';
  gpsEnableBtn.disabled = true;
  gpsSkipBtn.disabled = true;
  const coords = await requestGPS();
  userLat = coords.lat;
  userLng = coords.lng;
  startApp();
});

gpsSkipBtn.addEventListener('click', () => {
  userLat = DEFAULT_LAT;
  userLng = DEFAULT_LNG;
  startApp();
});

// ============================================================
//  3. Start: place user marker, proximity circle, initialize mode
// ============================================================

function startApp() {
  if (map) return;
  gpsOverlay.classList.add('hidden');
  initMap(userLat, userLng);
  placeUserMarker(userLat, userLng);
  drawProximityCircle(userLat, userLng);

  // Toggle is OFF by default: recommendations off, showing recent visits only
  if (recommendationToggle) {
    recommendationToggle.checked = false;
    recommendationToggle.addEventListener('change', () => applyMode());
  }

  // Setup Recent Visits drawer events
  if (recentHistoryBtn) recentHistoryBtn.addEventListener('click', openRecentModal);
  if (recentModalClose) recentModalClose.addEventListener('click', closeRecentModal);
  if (recentModalBackdrop) recentModalBackdrop.addEventListener('click', closeRecentModal);
  if (clearRecentBtn) clearRecentBtn.addEventListener('click', clearAllRecentVisits);

  // Apply default mode (Recent Visits)
  applyMode();

  // Background-fetch live green recommendations so turning the toggle ON is instant
  fetchGreenDestinations(userLat, userLng);
}

// --------------- User marker (pulsing blue dot) ---------------

function placeUserMarker(lat, lng) {
  if (userMarker) map.removeLayer(userMarker);

  const icon = L.divIcon({
    className: '',
    html: '<div class="user-pin"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  userMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 })
    .addTo(map)
    .bindTooltip('You are here', {
      direction: 'top',
      offset: [0, -12],
      className: 'user-tooltip',
    });
}

// --------------- Blue proximity circle ---------------

function drawProximityCircle(lat, lng) {
  if (proximityCircle) map.removeLayer(proximityCircle);

  proximityCircle = L.circle([lat, lng], {
    radius: PROXIMITY_RADIUS_M,
    color: 'rgba(96, 165, 250, 0.35)',
    weight: 1.5,
    fillColor: 'rgba(96, 165, 250, 0.07)',
    fillOpacity: 1,
    dashArray: '6 4',
  }).addTo(map);
}

// --------------- Live status updater ---------------

function updateLiveStatus(text, statusType = true) {
  if (!liveStatusPill || !liveStatusText) return;
  liveStatusText.textContent = text;
  const dot = liveStatusPill.querySelector('.live-status-dot');
  if (dot) {
    if (statusType === true || statusType === 'green') {
      dot.style.background = '#10b981';
      dot.style.boxShadow = '0 0 8px #10b981';
    } else if (statusType === 'recent') {
      dot.style.background = '#a855f7';
      dot.style.boxShadow = '0 0 8px #a855f7';
    } else {
      dot.style.background = '#f59e0b';
      dot.style.boxShadow = '0 0 8px #f59e0b';
    }
  }
}

// ============================================================
//  3B. Local Storage Recent Visits System
// ============================================================

function getRecentVisits() {
  const raw = localStorage.getItem(RECENT_VISITS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.warn('Failed to parse recent visits from localStorage', e);
    }
  }

  // First time visiting site: Seed with 3 realistic Cupertino destinations
  const defaultSeeds = [
    {
      id: 'recent-1',
      name: 'Cupertino Memorial Park',
      lat: 37.3242,
      lng: -122.0401,
      icon: '🌳',
      category_label: 'Public Park',
      score: 89,
      distance_km: 0.6,
      amenities: ['Restrooms', 'Drinking Water', 'Benches'],
      visitedAt: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
      visitedFormatted: 'Yesterday, 4:15 PM'
    },
    {
      id: 'recent-2',
      name: 'McClellan Ranch Preserve',
      lat: 37.3140,
      lng: -122.0680,
      icon: '🌿',
      category_label: 'Nature Reserve',
      score: 94,
      distance_km: 1.7,
      amenities: ['Nature Trails', 'Benches'],
      visitedAt: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
      visitedFormatted: '2 days ago'
    },
    {
      id: 'recent-3',
      name: 'Blackberry Farm Park',
      lat: 37.3130,
      lng: -122.0635,
      icon: '🌳',
      category_label: 'Public Park',
      score: 88,
      distance_km: 1.5,
      amenities: ['Picnic Tables', 'Restrooms'],
      visitedAt: new Date(Date.now() - 3600 * 1000 * 96).toISOString(),
      visitedFormatted: '4 days ago'
    }
  ];
  localStorage.setItem(RECENT_VISITS_KEY, JSON.stringify(defaultSeeds));
  return defaultSeeds;
}

function saveRecentVisit(place) {
  if (!place || !place.name) return;
  const visits = getRecentVisits();
  const filtered = visits.filter(v => v.name.toLowerCase() !== place.name.toLowerCase());

  const now = new Date();
  const newVisit = {
    id: place.id || `visit-${Date.now()}`,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    icon: place.icon || '📍',
    category_label: place.category_label || place.badge || 'Recent Destination',
    score: place.score || 85,
    distance_km: place.distance_km || (haversineM(userLat, userLng, place.lat, place.lng) / 1000).toFixed(1),
    amenities: place.amenities && place.amenities.length > 0 ? place.amenities : ['Scenic Nature', 'Bike Accessible'],
    visitedAt: now.toISOString(),
    visitedFormatted: 'Just now'
  };

  const updated = [newVisit, ...filtered].slice(0, 25);
  localStorage.setItem(RECENT_VISITS_KEY, JSON.stringify(updated));
  updateRecentBadge(updated.length);

  // If recommendations are OFF, refresh recent pins on the map immediately
  if (!recommendationsEnabled) {
    renderRecentPins(updated);
    updateLiveStatus(`Recent Visits Mode — ${updated.length} Places Saved`, 'recent');
  }
}

function updateRecentBadge(count) {
  if (recentCountBadge) {
    recentCountBadge.textContent = count;
  }
}

function clearRecentPins() {
  recentMarkers.forEach((m) => map.removeLayer(m));
  recentMarkers = [];
}

function clearGreenPins() {
  greenMarkers.forEach((m) => map.removeLayer(m));
  greenMarkers = [];
}

function renderRecentPins(places) {
  clearRecentPins();

  for (const place of places) {
    const iconChar = place.icon || '📍';
    const distText = place.distance_km != null
      ? `${place.distance_km} km`
      : `${(haversineM(userLat, userLng, place.lat, place.lng) / 1000).toFixed(1)} km`;

    const icon = L.divIcon({
      className: '',
      html: `
        <div class="recent-pin">
          <div class="recent-pin-dot">${iconChar}</div>
          <span class="recent-pin-label">${escapeHTML(place.name)}</span>
        </div>
      `,
      iconSize: [36, 52],
      iconAnchor: [18, 26],
    });

    const marker = L.marker([place.lat, place.lng], { icon })
      .addTo(map)
      .on('click', () => selectRecentDestination(place));

    marker.bindTooltip(
      `<b>${escapeHTML(place.name)}</b><br/>🕒 Visited: ${escapeHTML(place.visitedFormatted || 'Recent')}<br/>Distance: ${distText}`,
      {
        direction: 'top',
        offset: [0, -28],
        className: 'user-tooltip',
      }
    );

    recentMarkers.push(marker);
  }
}

function selectRecentDestination(place) {
  selectedDestination = place;

  cardName.textContent = place.name;
  if (cardIcon) cardIcon.textContent = place.icon || '🕒';

  // Highlight badge as Recent Visit
  cardBadge.textContent = `Recent Visit • ${place.visitedFormatted || 'Saved'}`;
  cardBadge.className = 'card-badge card-badge--recent';

  if (cardScore) {
    const score = place.score || 85;
    cardScore.textContent = `Score: ${score}/100`;
  }

  if (cardDistance) {
    const distKm = place.distance_km || (haversineM(userLat, userLng, place.lat, place.lng) / 1000).toFixed(1);
    cardDistance.textContent = `${distKm} km away`;
    cardDistance.style.display = 'inline-block';
  }

  if (cardAmenities) {
    const amenities = place.amenities || [];
    const listHtml = amenities.length > 0
      ? amenities.map(a => `<span class="amenity-tag">${escapeHTML(a)}</span>`).join('')
      : '<span class="amenity-tag">Scenic Nature</span><span class="amenity-tag">Bike Accessible</span>';
    cardAmenities.innerHTML = listHtml + `<span class="amenity-tag" style="color: #c4b5fd; border-color: rgba(139,92,246,0.3)">🕒 ${escapeHTML(place.visitedFormatted || 'Recent Visit')}</span>`;
    cardAmenities.classList.remove('hidden');
  }

  cardRouteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
    Route Again
  `;

  destCard.classList.remove('hidden');
  map.panTo([place.lat, place.lng], { animate: true, duration: 0.5 });
}

// --------------- Mode Application: Recommendations vs. Recent Visits ---------------

function applyMode() {
  if (recommendationToggle && recommendationToggle.checked) {
    // RECOMMENDATIONS MODE (ON)
    recommendationsEnabled = true;
    clearRecentPins();

    if (cachedRecommendations && cachedRecommendations.length > 0) {
      renderGreenPins(cachedRecommendations);
      updateLiveStatus(`Live OSM Backend — ${cachedRecommendations.length} Nature Spots Found`, true);
    } else {
      fetchGreenDestinations(userLat, userLng);
    }
  } else {
    // RECENT VISITS MODE (OFF - DEFAULT)
    recommendationsEnabled = false;
    clearGreenPins();

    const visits = getRecentVisits();
    renderRecentPins(visits);
    updateLiveStatus(`Recent Visits Mode — ${visits.length} Places Saved`, 'recent');
    updateRecentBadge(visits.length);
  }
}

// --------------- Recent Visits Drawer Handlers ---------------

function openRecentModal() {
  const visits = getRecentVisits();
  if (visits.length === 0) {
    recentPlacesList.innerHTML = `
      <div class="recent-empty-state">
        <div class="recent-empty-icon">📍</div>
        <h4>No Recent Visits Yet</h4>
        <p>Turn on Recommendations or search for a destination, then click "Route Here" to save destinations.</p>
      </div>
    `;
  } else {
    recentPlacesList.innerHTML = visits.map((v) => {
      const dist = v.distance_km != null
        ? `${v.distance_km} km`
        : `${(haversineM(userLat, userLng, v.lat, v.lng) / 1000).toFixed(1)} km`;
      return `
        <div class="recent-item" data-id="${v.id}">
          <div class="recent-item-left">
            <div class="recent-item-icon">${v.icon || '📍'}</div>
            <div class="recent-item-details">
              <div class="recent-item-name">${escapeHTML(v.name)}</div>
              <div class="recent-item-meta">
                <span class="recent-item-badge">${escapeHTML(v.category_label || 'Destination')}</span>
                <span>• ${dist} away</span>
                <span>• ${escapeHTML(v.visitedFormatted || 'Recent')}</span>
              </div>
            </div>
          </div>
          <button class="recent-item-action" data-id="${v.id}">View</button>
        </div>
      `;
    }).join('');

    recentPlacesList.querySelectorAll('.recent-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const place = visits.find((v) => v.id === id);
        if (place) {
          closeRecentModal();
          selectRecentDestination(place);
        }
      });
    });
  }

  recentModal.classList.remove('hidden');
}

function closeRecentModal() {
  recentModal.classList.add('hidden');
}

function clearAllRecentVisits() {
  if (confirm('Clear all recent visits history from local storage?')) {
    localStorage.setItem(RECENT_VISITS_KEY, '[]');
    updateRecentBadge(0);
    if (!recommendationsEnabled) {
      clearRecentPins();
      updateLiveStatus('Recent Visits Mode — 0 Places Saved', 'recent');
    }
    openRecentModal();
  }
}

// ============================================================
//  4. Fetch green destinations from Live OSM Backend
// ============================================================

async function fetchGreenDestinations(lat, lng) {
  if (recommendationsEnabled) {
    showLoading('Finding live nature destinations from OSM…');
    updateLiveStatus('Querying live OSM Overpass…', false);
  }

  try {
    const url = `${RECOMMENDATIONS_ENDPOINT}?lat=${lat}&lng=${lng}&radius=${PROXIMITY_RADIUS_M}&limit=35`;
    console.log('Fetching live OSM recommendations from backend:', url);

    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`Backend returned HTTP ${resp.status}`);
    const data = await resp.json();

    if (data.success && data.recommendations && data.recommendations.length > 0) {
      console.log(`Received ${data.recommendations.length} live OSM parks from ${data.mirror}`);
      cachedRecommendations = data.recommendations;
      if (recommendationsEnabled) {
        renderGreenPins(data.recommendations);
        updateLiveStatus(`Live OSM Backend — ${data.recommendations.length} Nature Spots Found`, true);
      }
      hideLoading();
      return;
    }
    throw new Error('No recommendations in backend response');
  } catch (err) {
    console.warn('Backend query failed, trying direct fallback:', err);
    cachedRecommendations = getFallbackPlaces();
    if (recommendationsEnabled) {
      updateLiveStatus('⚠️ Offline fallback mode (8 parks)', false);
      renderGreenPins(cachedRecommendations);
    }
    hideLoading();
  }
}

// --------------- Hardcoded fallback (offline demo safety net) ---------------

function getFallbackPlaces() {
  return [
    { name: 'Cupertino Memorial Park',    lat: 37.3242, lng: -122.0401, icon: '🌳', category_label: 'Public Park', badge: 'Public Park', score: 89, distance_km: 0.6, distM: 600, amenities: ['Restrooms', 'Drinking Water', 'Benches'] },
    { name: 'McClellan Ranch Preserve',   lat: 37.3140, lng: -122.0680, icon: '🌿', category_label: 'Nature Reserve', badge: 'Nature Reserve', score: 94, distance_km: 1.7, distM: 1700, amenities: ['Nature Trails', 'Benches'] },
    { name: 'Blackberry Farm Park',       lat: 37.3130, lng: -122.0635, icon: '🌳', category_label: 'Public Park', badge: 'Public Park', score: 88, distance_km: 1.5, distM: 1500, amenities: ['Picnic Tables', 'Restrooms'] },
    { name: 'Stevens Creek County Park',  lat: 37.3100, lng: -122.0760, icon: '🌲', category_label: 'County Park', badge: 'County Park', score: 96, distance_km: 3.1, distM: 3100, amenities: ['Nature Trails', 'Drinking Water'] },
    { name: 'Linda Vista Park',           lat: 37.3300, lng: -122.0600, icon: '🌳', category_label: 'Public Park', badge: 'Public Park', score: 88, distance_km: 1.9, distM: 1900, amenities: ['Playground', 'Benches'] },
    { name: 'Jollyman Park',              lat: 37.3100, lng: -122.0310, icon: '🌳', category_label: 'Public Park', badge: 'Public Park', score: 88, distance_km: 1.1, distM: 1100, amenities: ['Natural Grass', 'Benches'] },
    { name: 'Portal Park',                lat: 37.3280, lng: -122.0380, icon: '🌳', category_label: 'Public Park', badge: 'Public Park', score: 87, distance_km: 2.2, distM: 2200, amenities: ['Natural Grass'] },
    { name: 'Wilson Park',                lat: 37.3210, lng: -122.0520, icon: '🌳', category_label: 'Public Park', badge: 'Public Park', score: 87, distance_km: 2.1, distM: 2100, amenities: ['Playground'] },
  ];
}

// ============================================================
//  5. Render green pins on the map
// ============================================================

function renderGreenPins(places) {
  // Clear previous markers
  greenMarkers.forEach((m) => map.removeLayer(m));
  greenMarkers = [];

  for (const place of places) {
    const iconChar = place.icon || '🌳';
    const scoreVal = place.score ? `★ ${place.score}` : '';

    const icon = L.divIcon({
      className: '',
      html: `
        <div class="green-pin">
          <div class="green-pin-dot">${iconChar}</div>
          <span class="green-pin-label">${escapeHTML(place.name)}</span>
        </div>
      `,
      iconSize: [36, 52],
      iconAnchor: [18, 26],
    });

    const marker = L.marker([place.lat, place.lng], { icon })
      .addTo(map)
      .on('click', () => selectDestination(place));

    if (place.score) {
      marker.bindTooltip(`<b>${escapeHTML(place.name)}</b><br/>Score: ${place.score}/100`, {
        direction: 'top',
        offset: [0, -28],
        className: 'user-tooltip',
      });
    }

    greenMarkers.push(marker);
  }
}

// ============================================================
//  6. Destination selection (card popup)
// ============================================================

function selectDestination(place) {
  selectedDestination = place;

  cardName.textContent = place.name;
  if (cardIcon) cardIcon.textContent = place.icon || '🌿';

  const badgeText = place.category_label || place.badge || 'Green Space';
  cardBadge.textContent = badgeText;
  cardBadge.className = 'card-badge';

  if (cardScore) {
    const score = place.score || 85;
    cardScore.textContent = `Score: ${score}/100`;
  }

  if (cardDistance) {
    const dist = place.distance_km != null
      ? `${place.distance_km} km away`
      : place.distM != null
        ? `${(place.distM / 1000).toFixed(1)} km away`
        : '';
    cardDistance.textContent = dist;
    cardDistance.style.display = dist ? 'inline-block' : 'none';
  }

  if (cardAmenities) {
    const amenities = place.amenities || [];
    if (amenities.length > 0) {
      cardAmenities.innerHTML = amenities
        .map((a) => `<span class="amenity-tag">${escapeHTML(a)}</span>`)
        .join('');
      cardAmenities.classList.remove('hidden');
    } else {
      cardAmenities.innerHTML = '<span class="amenity-tag">Scenic Nature</span><span class="amenity-tag">Bike Accessible</span>';
      cardAmenities.classList.remove('hidden');
    }
  }

  cardRouteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
    Route Here
  `;

  destCard.classList.remove('hidden');

  // Smoothly pan the map to center on the selected pin
  map.panTo([place.lat, place.lng], { animate: true, duration: 0.5 });
}

cardClose.addEventListener('click', () => {
  destCard.classList.add('hidden');
  selectedDestination = null;
});

cardRouteBtn.addEventListener('click', () => {
  if (!selectedDestination) return;

  const dest = selectedDestination;
  console.log('Route requested to destination:', {
    from: { lat: userLat, lng: userLng },
    to:   { lat: dest.lat, lng: dest.lng },
    name: dest.name,
    score: dest.score,
  });

  // Save to recent visits in local storage
  saveRecentVisit(dest);

  alert(
    `Routing from your location to ${dest.name}!\n\n` +
    `Destination: ${dest.name}\n` +
    `Saved to Recent Visits in Local Storage.\n` +
    `Green Recommendation Score: ${dest.score || 88}/100\n` +
    `Straight-line Distance: ${dest.distance_km || ((dest.distM || 0)/1000).toFixed(1)} km\n\n` +
    `Ready to connect with bike routing engine.`
  );
});

// ============================================================
//  7. Search bar — Backend Proxy with Nominatim Fallback
// ============================================================

searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim();
  const version = ++searchVersion;
  searchClear.classList.toggle('hidden', q.length === 0);

  clearTimeout(searchDebounceTimer);
  if (q.length < 2) {
    searchResults.classList.add('hidden');
    return;
  }
  searchDebounceTimer = setTimeout(() => searchPlaces(q, version), 350);
});

searchClear.addEventListener('click', () => {
  ++searchVersion;
  clearTimeout(searchDebounceTimer);
  searchInput.value = '';
  searchClear.classList.add('hidden');
  searchResults.classList.add('hidden');
  if (searchResultMarker) {
    map.removeLayer(searchResultMarker);
    searchResultMarker = null;
  }
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-container')) {
    searchResults.classList.add('hidden');
  }
});

async function searchPlaces(query, version = ++searchVersion) {
  try {
    // Try our backend search proxy first (handles CORS and biases to current location)
    const backendUrl = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&lat=${userLat}&lng=${userLng}`;
    const resp = await fetch(backendUrl, { signal: AbortSignal.timeout(12000) });
    if (version !== searchVersion) return;
    if (resp.ok) {
      const data = await resp.json();
      if (version !== searchVersion) return;
      if (Array.isArray(data.results)) {
        renderSearchResults(data.results);
        return;
      }
    }
  } catch (err) {
    console.warn('Backend search proxy unavailable, falling back to direct Nominatim:', err);
  }

  if (version !== searchVersion) return;

  // Direct Nominatim fallback
  try {
    const params = new URLSearchParams({
      q: query + ', Cupertino, CA',
      format: 'json',
      addressdetails: '1',
      limit: '6',
      viewbox: '-122.10,37.29,-122.00,37.36',
      bounded: '0',
      countrycodes: 'us',
    });
    const resp = await fetch(`${NOMINATIM_DIRECT}?${params}`, { signal: AbortSignal.timeout(12000) });
    if (!resp.ok) throw new Error(`Nominatim returned ${resp.status}`);
    const data = await resp.json();
    if (version !== searchVersion) return;
    renderSearchResults(data);
  } catch (err) {
    if (version !== searchVersion) return;
    console.error('All search options failed:', err);
    searchResults.innerHTML = '<li class="no-results">Search unavailable — try again</li>';
    searchResults.classList.remove('hidden');
  }
}

function renderSearchResults(results) {
  if (results.length === 0) {
    searchResults.innerHTML = '<li class="no-results">No results found</li>';
    searchResults.classList.remove('hidden');
    return;
  }

  searchResults.innerHTML = results.map((r) => {
    const name = r.display_name.split(',')[0];
    const address = r.display_name.split(',').slice(1, 3).join(',').trim();
    const isGreen = ['park', 'garden', 'nature_reserve', 'forest', 'wood'].some(
      (t) => (r.type || '').includes(t) || (r.class || '').includes(t)
    );
    const icon = isGreen ? '🌿' : '📍';

    return `
      <li data-lat="${r.lat}" data-lng="${r.lon}" data-name="${escapeHTML(name)}" data-type="${isGreen ? 'green' : 'place'}">
        <span class="result-icon">${icon}</span>
        <div class="result-text">
          <div class="result-name">${escapeHTML(name)}</div>
          <div class="result-address">${escapeHTML(address)}</div>
        </div>
      </li>
    `;
  }).join('');

  searchResults.querySelectorAll('li[data-lat]').forEach((li) => {
    li.addEventListener('click', () => {
      const lat = parseFloat(li.dataset.lat);
      const lng = parseFloat(li.dataset.lng);
      const name = li.dataset.name;
      const isGreen = li.dataset.type === 'green';

      ++searchVersion;
      clearTimeout(searchDebounceTimer);
      placeSearchPin(lat, lng, name, isGreen);
      searchResults.classList.add('hidden');
      searchInput.value = name;
    });
  });

  searchResults.classList.remove('hidden');
}

function placeSearchPin(lat, lng, name, isGreen) {
  if (searchResultMarker) map.removeLayer(searchResultMarker);

  const icon = L.divIcon({
    className: '',
    html: `<div class="${isGreen ? 'green-pin-dot' : 'search-pin'}">${isGreen ? '🌿' : ''}</div>`,
    iconSize: isGreen ? [36, 36] : [14, 14],
    iconAnchor: isGreen ? [18, 18] : [7, 7],
  });

  searchResultMarker = L.marker([lat, lng], { icon, zIndexOffset: 900 })
    .addTo(map);

  map.flyTo([lat, lng], 15, { animate: true, duration: 0.8 });

  selectDestination({
    name,
    lat,
    lng,
    icon: isGreen ? '🌿' : '📍',
    category_label: isGreen ? 'Green Destination' : 'Search Result',
    badge: isGreen ? 'Green Destination' : 'Search Result',
    score: isGreen ? 88 : 75,
    distance_km: (haversineM(userLat, userLng, lat, lng) / 1000).toFixed(1),
    amenities: ['Custom Location'],
  });
}

// ============================================================
//  8. Locate-me button
// ============================================================

locateBtn.addEventListener('click', () => {
  if (!map) return;
  map.flyTo([userLat, userLng], 14, { animate: true, duration: 0.6 });
});

// ============================================================
//  9. Loading indicator
// ============================================================

function showLoading(text) {
  let el = document.querySelector('.loading-indicator');
  if (!el) {
    el = document.createElement('div');
    el.className = 'loading-indicator';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="loading-spinner"></div>${escapeHTML(text)}`;
  el.classList.remove('hidden');
}

function hideLoading() {
  const el = document.querySelector('.loading-indicator');
  if (el) el.classList.add('hidden');
}

// ============================================================
//  10. Utility
// ============================================================

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

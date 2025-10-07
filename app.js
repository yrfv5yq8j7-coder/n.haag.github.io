// Karte initialisieren
const map = L.map('map').setView([51.1657, 10.4515], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Array für alle Marker
let markers = [];

// Event: PDF hochladen
document.getElementById('pdfInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // Alte Marker entfernen
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  // PDF auslesen
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(i => i.str).join(' ');
  }

  // Adresse erkennen (einfacher Ansatz: PLZ + Stadt)
  const addressMatch = text.match(/\d{5}\s+[A-ZÄÖÜa-zäöüß]+/);
  if (!addressMatch) {
    alert("Keine Adresse gefunden 😕");
    return;
  }

  const address = addressMatch[0];
  console.log("Gefundene Adresse:", address);

  // Adresse geokodieren mit Nominatim
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Deutschland')}`);
  const data = await response.json();

  if (!data.length) {
    alert("Adresse nicht gefunden 😕");
    return;
  }

  const { lat, lon, display_name } = data[0];

  // Marker setzen
  const marker = L.marker([lat, lon]).addTo(map)
    .bindPopup(`📍 ${display_name}`)
    .openPopup();

  markers.push(marker);
  map.setView([lat, lon], 12);
});;

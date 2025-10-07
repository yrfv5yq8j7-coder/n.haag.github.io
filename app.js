// PDF.js Worker definieren
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist/build/pdf.worker.min.js';

// Karte initialisieren
const map = L.map('map').setView([51.1657, 10.4515], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Array für Marker
let markers = [];

// PDF-Upload Event
document.getElementById('pdfInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  // Alte Marker entfernen
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  map.setView([51.1657, 10.4515], 6); // Deutschland zentrieren

  // PDF auslesen
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(i => i.str).join(' ') + ' ';
  }

  // Daten automatisch extrahieren
  const adresseMatch = text.match(/\d{5}\s+[A-ZÄÖÜa-zäöüß]+/); // einfache PLZ+Stadt-Erkennung
  const zrdMatch = text.match(/ZRD[:\s]*([\w-]+)/i);
  const gerätMatch = text.match(/Gerätenummer[:\s]*([\w-]+)/i);

  if (!adresseMatch) { 
    alert("Keine Adresse gefunden 😕"); 
    return; 
  }

  const address = adresseMatch[0];
  const zrd = zrdMatch ? zrdMatch[1] : "–";
  const geraet = gerätMatch ? gerätMatch[1] : "–";

  // Adresse geokodieren über OpenStreetMap
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address + ', Deutschland')}`);
  const data = await response.json();

  if (!data.length) {
    alert("Adresse nicht gefunden 😕");
    return;
  }

  const { lat, lon, display_name } = data[0];

  // Marker setzen mit Popup + OK-Button
  const marker = L.marker([lat, lon]).addTo(map);
  markers.push(marker);

  const popupContent = document.createElement('div');
  popupContent.innerHTML = `
    <b>${display_name}</b><br>
    ZRD: ${zrd}<br>
    Gerätenummer: ${geraet}<br>
  `;

  const okButton = document.createElement('button');
  okButton.textContent = "OK";
  okButton.style.marginTop = "5px";
  okButton.onclick = () => {
    alert(`Eintrag für ZRD ${zrd} bestätigt ✅`);
    marker.closePopup();
  };

  popupContent.appendChild(okButton);
  marker.bindPopup(popupContent).openPopup();

  map.setView([lat, lon], 12);
});

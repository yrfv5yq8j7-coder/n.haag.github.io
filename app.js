// app.js
document.addEventListener('DOMContentLoaded', () => {
  // Karte initialisieren (Deutschland)
  const map = L.map('map').setView([51.1657,10.4515],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Icons
  function iconFor(status){
    const color = status==='high' ? '#dc3545' : status==='medium' ? '#ff8c00' : '#28a745';
    return L.divIcon({
      className:'custom-marker',
      html:`<div style="width:18px;height:18px;border-radius:50%;background:${color};border:2px solid white;"></div>`,
      iconSize:[18,18], iconAnchor:[9,9]
    });
  }

  // Storage key
  const STORAGE_KEY = 'lieferungen_v1';

  function loadStored(){ return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'); }
  function saveStored(arr){ localStorage.setItem(STORAGE_KEY, JSON.stringify(arr)); }

  // Entries anzeigen
  let markers = {};
  function renderAll(){
    // clear map markers
    Object.values(markers).forEach(m=>map.removeLayer(m));
    markers = {};
    const data = loadStored();
    const list = document.getElementById('entries');
    list.innerHTML = '';
    data.slice().reverse().forEach(entry => {
      // add marker if coords exist
      if (entry.lat && entry.lon){
        const m = L.marker([entry.lat, entry.lon], { icon: iconFor(entry.status) }).addTo(map);
        m.bindPopup(`<b>ZRD:</b> ${entry.zrd||'—'}<br/><b>Kontakt:</b> ${entry.contact||'—'}<br/><b>Adresse:</b> ${entry.address||'—'}<br/><b>Ticket:</b> ${entry.ticket||'—'}<br/><b>Auftrag:</b> ${entry.auftrag||'—'}`);
        markers[entry.id] = m;
      }
      // list element
      const el = document.createElement('div'); el.className='entry';
      el.innerHTML = `<h4>${entry.zrd||'ZRD: —'} <small class="small-muted">[${entry.status}]</small></h4>
        <div><b>${entry.contact||'kein Ansprechpartner'}</b></div>
        <div class="small-muted">${entry.address||''}</div>
        <div class="small-muted">Hochgeladen: ${new Date(entry.createdAt).toLocaleString()}</div>`;
      // if no coords add a button to set marker by click
      if (!entry.lat || !entry.lon){
        const btn = document.createElement('button'); btn.textContent='Marker setzen (auf Karte klicken)';
        btn.addEventListener('click', () => enablePlaceMode(entry.id));
        el.appendChild(btn);
      }
      list.appendChild(el);
    });
  }

  // click-to-place mode
  let placeModeId = null;
  function enablePlaceMode(id){
    placeModeId = id;
    map.getContainer().style.cursor = 'crosshair';
    alert('Tippe nun auf die Karte, um den Marker für diesen Eintrag zu setzen.');
  }
  map.on('click', (e) => {
    if (!placeModeId) return;
    const data = loadStored();
    const idx = data.findIndex(it=>it.id===placeModeId);
    if (idx===-1) { placeModeId = null; map.getContainer().style.cursor=''; return; }
    data[idx].lat = e.latlng.lat; data[idx].lon = e.latlng.lng;
    saveStored(data);
    placeModeId = null;
    map.getContainer().style.cursor='';
    renderAll();
  });

  // PDF → Text (PDF.js)
  async function extractTextFromPDF(file){
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data:arrayBuffer}).promise;
    let full = '';
    for (let i=1;i<=pdf.numPages;i++){
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      const strs = tc.items.map(it=>it.str);
      full += strs.join(' ') + '\n';
    }
    return full;
  }

  // heuristische Extraktion (ZRD, Ansprechpartner, Adresse)
  function extractFields(text){
    const lines = text.replace(/\r/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean);
    const whole = lines.join('\n');

    // ZRD
    const zrdMatch = /(?:ZRD|Zrd|Zrd\.?|Zrd:?)\s*[-:]?\s*([A-Z0-9\-]{3,30})/i.exec(whole);
    const zrd = zrdMatch ? zrdMatch[1] : null;

    // Ansprechpartner
    const contactMatch = /(?:Ansprechpartner|Kontaktperson|Kontakt|Contact)[:\s]*([A-ZÄÖÜa-zäöüß\.\- ,]{3,80})/i.exec(whole);
    const contact = contactMatch ? contactMatch[1].trim() : null;

    // Adresse: suche Zeile mit 5-stelliger PLZ
    let address = null;
    for (let l of lines){
      if (/\b\d{5}\b/.test(l)) { address = l; break; }
    }
    // fallback: suche Straße + nr pattern
    if (!address){
      const addrMatch = whole.match(/([A-Za-zÄÖÜäöüß\.\- ]+\s+\d{1,4}[a-zA-Z]?\s*,?\s*\d{5}\s+[A-Za-zÄÖÜäöüß\-\s]+)/i);
      if (addrMatch) address = addrMatch[0];
    }

    return { zrd, contact, address };
  }

  // Geocode über Photon (CORS-freundlich)
  async function geocode(address){
    if (!address) return null;
    const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(address) + '&limit=1';
    try {
      const r = await fetch(url);
      const j = await r.json();
      if (j && j.features && j.features.length){
        const coords = j.features[0].geometry.coordinates; // [lon,lat]
        return { lat: coords[1], lon: coords[0], name: j.features[0].properties.name || j.features[0].properties.city || address };
      }
    } catch(e){
      console.warn('Geocode error', e);
    }
    return null;
  }

  // Form handler
  document.getElementById('uploadForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const file = form.querySelector('input[type=file]').files[0];
    if (!file) { alert('Bitte PDF auswählen'); return; }
    const ticket = form.ticket.value.trim();
    const auftrag = form.auftrag.value.trim();
    const status = form.status.value || 'low';

    // extract text
    let text = '';
    try {
      text = await extractTextFromPDF(file);
    } catch(err){
      alert('Fehler beim Lesen der PDF. Vielleicht ist es ein Scan (keine eingebetteten Texte).');
      return;
    }

    const fields = extractFields(text);
    let geo = null;
    if (fields.address) {
      geo = await geocode(fields.address);
    }

    // create entry
    const entry = {
      id: 'e'+Date.now()+Math.floor(Math.random()*1000),
      filename: file.name,
      zrd: fields.zrd,
      contact: fields.contact,
      address: fields.address,
      lat: geo ? geo.lat : null,
      lon: geo ? geo.lon : null,
      ticket: ticket || null,
      auftrag: auftrag || null,
      status: status,
      createdAt: new Date().toISOString()
    };

    const arr = loadStored();
    arr.push(entry);
    saveStored(arr);
    form.reset();
    alert('Ergebnis hinzugefügt. Wenn keine Position gesetzt wurde, klicke im Eintrag "Marker setzen" und tippe auf die Karte.');
    renderAll();
  });

  // Export JSON
  document.getElementById('downloadJson').addEventListener('click', () => {
    const data = loadStored();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'lieferungen.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  // initial render
  renderAll();
});

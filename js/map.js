// map.js - Draw route with extra info: user's exact location, estimated time, next 3 stops
(function(){

  // small helper: parse query params
  function getQueryParams(){
    const q = {};
    location.search.substring(1).split("&").forEach(pair=>{
      if(!pair) return;
      const [k,v] = pair.split("=");
      q[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
    return q;
  }

  // haversine (meters)
  function haversine(a,b){
    const toRad = v => v * Math.PI/180;
    const R = 6371000;
    const dLat = toRad(b[0]-a[0]);
    const dLon = toRad(b[1]-a[1]);
    const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
    const h =
      Math.sin(dLat/2)**2 +
      Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
  }

  // compute total distance of route (km)
  function routeDistanceKm(coords){
    if(!coords || coords.length<2) return 0;
    let sum = 0;
    for (let i=1;i<coords.length;i++){
      sum += haversine(coords[i-1], coords[i]);
    }
    return sum / 1000;
  }

  function safeParseLine(param){
    if(!param) return null;
    try { return JSON.parse(decodeURIComponent(param)); }
    catch(e){
      try { return JSON.parse(param); }
      catch(e2){ return null; }
    }
  }

  // fills desktop & mobile UI
  function populateUI(routeInfo, nextStops){
    const rn = document.getElementById('routeNumber');
    const rname = document.getElementById('routeName');
    const dist = document.getElementById('statDistanceValue');
    const time = document.getElementById('statTimeValue');
    const nearest = document.getElementById('nearestStopText');

    if(rn) rn.textContent = `Linha ${routeInfo.number || ''}`;
    if(rname) rname.textContent = routeInfo.name || '';
    if(dist) dist.textContent = routeInfo.distance;
    if(time) time.textContent = routeInfo.time;
    if(nearest) nearest.textContent = routeInfo.nearest_stop;

    // render next stops (desktop)
    const nextBlock = document.getElementById('nextStopsBlock');
    if(nextBlock){
      nextBlock.innerHTML = '';
      if(nextStops && nextStops.length){
        const header = document.createElement('div');
        header.innerHTML = `
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <div style="width:10px;height:10px;border-radius:50%;background:#FF9933"></div>
            <strong>Próximas ${nextStops.length} paradas</strong>
          </div>`;
        nextBlock.appendChild(header);

        nextStops.forEach((s, idx)=>{
          const isLast = idx === nextStops.length - 1;
          const div = document.createElement('div');
          div.style = `
            display:flex;align-items:center;justify-content:space-between;
            padding:10px;border-radius:10px;margin-bottom:8px;
            border:1px solid ${isLast ? '#FF9933':'#eee'};
            background:${isLast ? 'rgba(255,153,51,0.06)' : '#fff'}
          `;
          div.innerHTML = `
            <div style="display:flex;gap:10px;align-items:center">
              <div style="
                width:36px;height:36px;border-radius:8px;
                display:flex;align-items:center;justify-content:center;
                background:${isLast ? '#FF9933' : '#6A1B9A'};
                color:#fff;font-weight:700"
              >${s.order}</div>
              <div>
                <div style="font-weight:700">${s.name}</div>
                <div style="font-size:12px;color:#666">Parada ${s.order}</div>
              </div>
            </div>
            ${isLast ? '<div style="color:#FF9933;font-weight:700;font-size:12px;padding:6px 8px;border-radius:8px;background:rgba(255,153,51,0.12)">SEU DESTINO</div>' : ''}
          `;
          nextBlock.appendChild(div);
        });
      }
    }
  }

  // main
  function init(){
    const params = getQueryParams();
    const lineObj = safeParseLine(params.line);

    const busStops = (lineObj?.stops?.length)
      ? lineObj.stops.map((s,i)=>({
          id: s.id || i+1,
          name: s.name || `Parada ${i+1}`,
          position: s.position || [-27.5954, -48.5480],
          order: s.order || (i+1)
        }))
      : [
          { id:1, position: [-27.5954, -48.5480], name: "TICEN", order: 1 },
          { id:2, position: [-27.5969, -48.5495], name: "Praça XV", order: 2 },
          { id:3, position: [-27.5920, -48.5500], name: "Beiramar Shopping", order: 3 },
          { id:4, position: [-27.5850, -48.5550], name: "CIC", order: 4 },
          { id:5, position: [-27.6100, -48.5650], name: "Costeira do Pirajubaé", order: 5 }
        ];

    const destCoord =
      params.destLat && params.destLng
        ? [parseFloat(params.destLat), parseFloat(params.destLng)]
        : null;

    const userCoordParam =
      params.userLat && params.userLng
        ? [parseFloat(params.userLat), parseFloat(params.userLng)]
        : null;

    function getUserLocation(timeout=6000){
      return new Promise(resolve=>{
        if(userCoordParam){
          resolve(userCoordParam);
          return;
        }
        if(!navigator.geolocation){
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          p => resolve([p.coords.latitude, p.coords.longitude]),
          ()=> resolve(null),
          { enableHighAccuracy:true, timeout }
        );
      });
    }

    const center = busStops[0].position;
    const map = L.map('map', { zoomControl:false }).setView(center, 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'&copy; OpenStreetMap'
    }).addTo(map);

    const coords = busStops.map(b=>b.position);
    const poly = L.polyline(coords, {
      color:'#6A1B9A',
      weight:6,
      opacity:0.95,
      lineJoin:'round'
    }).addTo(map);

    map.fitBounds(poly.getBounds(), { padding:[30,30] });

    // Draw stops
    busStops.forEach((s,idx)=>{
      const isLast = idx === busStops.length - 1;
      const marker = L.circleMarker(s.position, {
        radius:8,
        fillColor: isLast ? '#FF9933' : '#6A1B9A',
        color:'#fff',
        weight:1,
        fillOpacity:1
      }).addTo(map);
      marker.bindPopup(`<strong>${s.name}</strong><div class="small">Ordem ${s.order}</div>`);
    });

    // compute distance + time
    const distKm = routeDistanceKm(coords);
    const speedKmh = 25;
    const timeMin = Math.round((distKm / speedKmh) * 60);

    const distanceText = `${Math.round(distKm)} km`;
    const timeText = `${timeMin} min`;

    (async()=>{
      const userLoc = await getUserLocation();

      // show user on map
      if(userLoc){
        L.marker(userLoc).addTo(map).bindPopup("Você (aprox.)").openPopup();
      }

      // nearest stop
      let userIndex = 0;

      if(userLoc){
        let minD = Infinity;
        busStops.forEach((s,i)=>{
          const d = haversine(userLoc, s.position);
          if(d < minD){
            minD = d; userIndex = i;
          }
        });
      }

      const nextStops = busStops.slice(userIndex+1, userIndex+4);

      const routeInfo = {
        number: lineObj?.number || '330',
        name: lineObj?.name || 'TICEN - Costeira',
        distance: distanceText,
        time: timeText,
        origin: lineObj?.origin || 'TICEN',
        destination: lineObj?.destination || 'Costeira do Pirajubaé',
        nearest_stop: busStops[userIndex]?.name || ''
      };

      populateUI(routeInfo, nextStops);

      // walking circle
      if(userLoc){
        const nearestStop = busStops[userIndex].position;
        const walkDist = haversine(userLoc, nearestStop);
        const walkMin = Math.round((walkDist/1000)/5 * 60);

        L.circle(userLoc, {
          radius: Math.min(500, Math.max(80, walkDist + 20)),
          color:'#cfe6ff',
          weight:1,
          fill:false
        }).addTo(map);

        const nearestTextEl = document.getElementById('nearestStopText');
        if(nearestTextEl)
          nearestTextEl.textContent =
            `${busStops[userIndex].name} · ${Math.round(walkDist)} m (${walkMin} min camin.)`;
      }
    })();

    // demo moving bus
    if(coords.length > 2){
      const mid = Math.floor(coords.length * 0.6);
      L.circleMarker(coords[mid], {
        radius:10,
        fillColor:'#FF9800',
        color:'#fff',
        weight:1
      }).addTo(map).bindPopup("Ônibus próximo");
    }

    // UI buttons
    const btnBack = document.getElementById('btnBack');
    if(btnBack) btnBack.addEventListener('click', ()=> window.location.href='home.html');
  }

  if(document.readyState === 'complete' || document.readyState === 'interactive')
    setTimeout(init, 80);
  else
    document.addEventListener('DOMContentLoaded', init);

})();


// js/app.js
(function(){
  const MOCK_RESULTS = [
    { id:"330", number:"330", name:"TICEN - Costeira", origin:"TICEN", destination:"Costeira", estimated_time:"35 min",
      stops:[{name:"TICEN",position:[-27.5954,-48.5480],order:1},{name:"Praça XV",position:[-27.5969,-48.5495],order:2},{name:"Costeira",position:[-27.6100,-48.5650],order:5}]
    },
    { id:"1224", number:"1224", name:"TICEN - Trindade", origin:"TICEN", destination:"Trindade", estimated_time:"25 min",
      stops:[{name:"TICEN",position:[-27.5954,-48.5480],order:1},{name:"Praça XV",position:[-27.5969,-48.5495],order:2},{name:"Trindade",position:[-27.6050,-48.5150],order:4}]
    }
  ];

  const $ = id => document.getElementById(id);
  const debounce = (fn, wait=350)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), wait); }; };

  async function nominatimSearch(q,limit=6){
    if(!q || q.length<2) return [];
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=${limit}&addressdetails=1`;
    try {
      const res = await fetch(url,{headers:{'Accept':'application/json'}});
      if(!res.ok) return [];
      const json = await res.json();
      return json.map(i=>({name:i.display_name,lat:parseFloat(i.lat),lon:parseFloat(i.lon)}));
    } catch(e){ console.warn(e); return []; }
  }

  // render suggestions
  function renderSuggestions(list, containerId){
    const root = $(containerId);
    if(!root) return;
    if(!list || list.length===0){ root.style.display='none'; root.innerHTML=''; return; }
    root.style.display='block';
    root.innerHTML = list.map(i=>`<div class="suggestion-item" data-lat="${i.lat}" data-lon="${i.lon}">${i.name}</div>`).join('');
    root.querySelectorAll('.suggestion-item').forEach(el=>{
      el.addEventListener('click', ()=>{
        const name = el.textContent;
        const lat = el.getAttribute('data-lat');
        const lon = el.getAttribute('data-lon');
        if(containerId==='originSuggestions'){
          $('origin').value = name; $('origin').dataset.lat = lat; $('origin').dataset.lon = lon;
        } else {
          $('destination').value = name; $('destination').dataset.lat = lat; $('destination').dataset.lon = lon;
        }
        renderSuggestions([], containerId);
      });
    });
  }

  // Haversine
  function haversine(a,b){ const toRad=v=>v*Math.PI/180; const R=6371000; const dLat=toRad(b[0]-a[0]); const dLon=toRad(b[1]-a[1]); const lat1=toRad(a[0]), lat2=toRad(b[0]); const h=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2; return 2*R*Math.atan2(Math.sqrt(h), Math.sqrt(1-h)); }

  function findLinesNearCoord(lines, coord, radiusMeters=900){
    if(!coord) return [];
    const [lat,lon] = coord;
    const matches = [];
    for(const line of lines){
      const near = line.stops.filter(s => haversine([lat,lon], s.position) <= radiusMeters);
      if(near.length) matches.push({...line, nearestStops:near, nearestDist: Math.min(...near.map(s=>haversine([lat,lon], s.position)))});
    }
    matches.sort((a,b)=>a.nearestDist - b.nearestDist);
    return matches;
  }

  // LocalStorage helpers
  const RECENTS_KEY = 'helpbus_recents_v1', FAVS_KEY = 'helpbus_favs_v1';
  function saveRecent(r){ if(!r || !r.destination) return; const cur = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); cur.unshift(r); const uniq=[]; for(const it of cur){ const key=(it.destination||'')+'||'+(it.bus_line_number||''); if(!uniq.find(u=>u.key===key)) uniq.push({key,data:it}); if(uniq.length>=8) break;} const out=uniq.map(u=>u.data); localStorage.setItem(RECENTS_KEY, JSON.stringify(out)); renderRecents(); }
  function loadRecents(){ return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); }
  function loadFavs(){ return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]'); }
  function toggleFav(line){ const cur=loadFavs(); const found=cur.find(f=>f.id===line.id); if(found) localStorage.setItem(FAVS_KEY, JSON.stringify(cur.filter(f=>f.id!==line.id))); else { cur.push({id:line.id,name:line.name,address:line.destination}); localStorage.setItem(FAVS_KEY, JSON.stringify(cur)); } renderFavs(); }

  // render results (lines)
  function renderSearchResults(lines, destCoord){
    const root = document.getElementById('searchResults');
    root.innerHTML = '';
    if(!lines || lines.length===0){ root.innerHTML = '<div class="result-card">Nenhuma linha sugerida</div>'; return; }
    for(const line of lines){
      const closest = (line.nearestStops && line.nearestStops[0]) || null;
      const distText = closest ? `${Math.round(line.nearestDist)} m` : '';
      const el = document.createElement('div'); el.className='result-card';
      el.innerHTML = `<div style="display:flex;gap:12px;align-items:center"><div class="line-badge">${line.number}</div><div><div style="font-weight:700">${line.name}</div><div class="small">${line.origin} → ${line.destination}</div><div class="small">Parada próxima: ${closest?closest.name:'-'} · ${distText}</div></div></div><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end"><button class="btn-outline select-line">Ver rota</button><button class="btn-icon fav-toggle" title="Favoritar">★</button></div>`;
      el.querySelector('.select-line').addEventListener('click', ()=>{
        const qs=[]; qs.push('line='+encodeURIComponent(JSON.stringify(line)));
        if(destCoord){ qs.push('destLat='+destCoord[0]); qs.push('destLng='+destCoord[1]); }
        const user = JSON.parse(localStorage.getItem('helpbus_userloc_v1') || 'null');
        if(user){ qs.push('userLat='+user.lat); qs.push('userLng='+user.lng); }
        saveRecent({ origin: $('origin').value || 'Sua localização', destination: $('destination').value, bus_line_id: line.id, bus_line_number: line.number });
        window.location.href = 'map.html?' + qs.join('&');
      });
      el.querySelector('.fav-toggle').addEventListener('click', ()=> toggleFav(line));
      root.appendChild(el);
    }
  }

  function renderRecents(){ const root=$('recentList'); const list=loadRecents(); root.innerHTML=''; if(!list||list.length===0){ root.innerHTML='<div class="empty-text">Nenhuma busca recente</div>'; return; } for(const r of list){ const b=document.createElement('button'); b.className='recent-item'; b.innerHTML = `<div class="meta">${r.destination}</div><div class="sub">${r.origin}</div>`; b.addEventListener('click', ()=> { window.location.href = `map.html?origin=${encodeURIComponent(r.origin)}&destination=${encodeURIComponent(r.destination)}`; }); root.appendChild(b); } }

  function renderFavs(){ const root=$('favList'); root.innerHTML=''; const favs=loadFavs(); if(!favs||favs.length===0){ root.innerHTML='<div class="empty-text">Nenhum favorito</div>'; return; } for(const f of favs){ const el=document.createElement('button'); el.className='fav-item'; el.innerHTML = `<div class="fav-title">${f.name}</div><div class="fav-sub small">${f.address}</div>`; el.addEventListener('click', ()=> { $('destination').value = f.address; }); root.appendChild(el); } }

  // cache user location
  function cacheUserLocation(lat,lng){ localStorage.setItem('helpbus_userloc_v1', JSON.stringify({lat,lng,ts:Date.now()})); }
  function tryCacheUserLocation(){ if(!navigator.geolocation) return; navigator.geolocation.getCurrentPosition(p=>cacheUserLocation(p.coords.latitude,p.coords.longitude), ()=>{}, {timeout:5000, enableHighAccuracy:true}); }

  // handle destination GO
  async function handleDestGo(){
    const text = $('destination').value.trim();
    if(!text){ alert('Digite um destino'); return; }
    const dLat = $('destination').dataset.lat ? parseFloat($('destination').dataset.lat) : null;
    const dLon = $('destination').dataset.lon ? parseFloat($('destination').dataset.lon) : null;
    let destCoord = null;
    if(dLat && dLon) destCoord = [dLat,dLon];
    else {
      const res = await nominatimSearch(text,4);
      if(res && res.length){ destCoord=[res[0].lat,res[0].lon]; $('destination').value=res[0].name; $('destination').dataset.lat=res[0].lat; $('destination').dataset.lon=res[0].lon; }
      else { alert('Não encontrei esse lugar. Tente incluir cidade.'); return; }
    }
    const suggestions = findLinesNearCoord(MOCK_RESULTS, destCoord, 900);
    renderSearchResults(suggestions.length?suggestions:MOCK_RESULTS, destCoord);
    saveRecent({ origin: $('origin').value || 'Sua localização', destination: $('destination').value, bus_line_id:'', bus_line_number:'' });
  }

  async function handleOriginGo(){
    const text = $('origin').value.trim();
    if(!text){ alert('Digite uma origem'); return; }
    if($('origin').dataset.lat && $('origin').dataset.lon) return;
    const res = await nominatimSearch(text,3);
    if(res && res.length){ $('origin').value=res[0].name; $('origin').dataset.lat=res[0].lat; $('origin').dataset.lon=res[0].lon; }
    else alert('Não encontrei essa origem. Seja mais específico.');
  }

  function bind(){
    tryCacheUserLocation(); renderRecents(); renderFavs();
    const originInput = $('origin'); const destInput = $('destination');
    originInput.addEventListener('input', debounce(async ()=>{ const q=originInput.value.trim(); if(!q) { renderSuggestions([], 'originSuggestions'); return;} const res = await nominatimSearch(q,6); renderSuggestions(res,'originSuggestions'); },350));
    destInput.addEventListener('input', debounce(async ()=>{ const q=destInput.value.trim(); if(!q) { renderSuggestions([], 'destSuggestions'); return;} const res = await nominatimSearch(q,6); renderSuggestions(res,'destSuggestions'); },300));
    originInput.addEventListener('blur', ()=> setTimeout(()=>renderSuggestions([], 'originSuggestions'),250));
    destInput.addEventListener('blur', ()=> setTimeout(()=>renderSuggestions([], 'destSuggestions'),250));
    $('goDest').addEventListener('click', handleDestGo);
    $('goOrigin').addEventListener('click', handleOriginGo);
    const openPreview = $('openMapPreview'); if(openPreview) openPreview.addEventListener('click', ()=> { const line = MOCK_RESULTS[0]; window.location.href = 'map.html?line='+encodeURIComponent(JSON.stringify(line)); });
    const navMapBtn = $('navMapBtn') || $('navMap'); if(navMapBtn) navMapBtn.addEventListener('click', ()=> window.location.href = 'map.html');
    const clearBtn = $('clearRecents'); if(clearBtn) clearBtn.addEventListener('click', ()=> { localStorage.removeItem(RECENTS_KEY); renderRecents(); });
    destInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); handleDestGo(); }});
    originInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); handleOriginGo(); }});
  }

  if(document.readyState==='complete' || document.readyState==='interactive') setTimeout(bind,60);
  else document.addEventListener('DOMContentLoaded', bind);

})();

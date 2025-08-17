
// Safer init with defer and error reporting
window.addEventListener('error', (e)=>{
  console.error('Error global:', e.message);
});

(() => {
// Storage key bump + migration
const OLD_KEY = "tennis_matches_v1";
const KEY = "tennis_matches_v2"; // new key to avoid collisions/corrupt data
let matches = load();

function load(){
  try{
    const rawNew = localStorage.getItem(KEY);
    if(rawNew){
      return JSON.parse(rawNew);
    }
    const rawOld = localStorage.getItem(OLD_KEY);
    if(rawOld){
      const data = JSON.parse(rawOld);
      localStorage.setItem(KEY, JSON.stringify(data));
      localStorage.removeItem(OLD_KEY);
      return data;
    }
    return [];
  }catch(e){
    console.error('Error al cargar almacenamiento. Limpiando...', e);
    try{
      localStorage.removeItem(KEY);
      localStorage.removeItem(OLD_KEY);
    }catch(_){}
    return [];
  }
}
function save(){
  localStorage.setItem(KEY, JSON.stringify(matches));
  render();
  toast("Guardado ✅");
}

// Elements
const tbody = document.getElementById('tbody');
const dlg = document.getElementById('dlg');
const frm = document.getElementById('frm');
const setsContainer = document.getElementById('sets-container');

// Filters
const fSearch = document.getElementById('search');
const fSuperficie = document.getElementById('f-superficie');
const fResultado = document.getElementById('f-resultado');
const fDesde = document.getElementById('f-desde');
const fHasta = document.getElementById('f-hasta');

document.getElementById('btn-reset').addEventListener('click', ()=>{
  if(confirm('Esto borrará los datos locales de la app y recargará la página. ¿Continuar?')){
    try{
      localStorage.removeItem(KEY);
      localStorage.removeItem(OLD_KEY);
      sessionStorage.clear();
    }catch(_){}
    location.reload();
  }
});

document.getElementById('btn-add').addEventListener('click', ()=>openDialog());
document.getElementById('btn-clear-filters').addEventListener('click', ()=>{
  fSearch.value = ""; fSuperficie.value=""; fResultado.value="";
  fDesde.value=""; fHasta.value="";
  render();
});

// Sample data
document.getElementById('btn-sample').addEventListener('click', ()=>{
  const sample = {
    id: uid(),
    fecha: new Date().toISOString().slice(0,10),
    hora_inicio: "11:00",
    duracion_min: 95,
    rival: "Rival de Prueba",
    superficie: "Arcilla",
    ubicacion: "Club",
    formato: "BO3_STB",
    rpe: 7,
    tags: "amistoso",
    notas: "Saqué bien, drive sólido. Fallé revés cruzado.",
    sets: [{me:6,rival:3,tb:""},{me:4,rival:6,tb:""},{me:10,rival:7,tb:"STB"}]
  };
  sample.resultado = computeResult(sample.sets);
  matches.push(sample);
  save();
});

// Import/Export
document.getElementById('btn-export-json').addEventListener('click', ()=>{
  downloadText(JSON.stringify(matches, null, 2), `tenis_diario_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
});
document.getElementById('btn-export-csv').addEventListener('click', ()=>{
  const csv = toCSV(matches);
  downloadText(csv, `tenis_diario_${new Date().toISOString().slice(0,10)}.csv`, 'text/csv');
});
document.getElementById('file-import-json').addEventListener('change', importJSON);
document.getElementById('file-import-csv').addEventListener('change', importCSV);

// Novedades
document.getElementById('btn-novedades').addEventListener('click', ()=>{
  document.getElementById('dlg-novedades').showModal();
});
document.getElementById('btn-close-nov').addEventListener('click', ()=>{
  document.getElementById('dlg-novedades').close();
});

// Dialog controls
document.getElementById('btn-add-set').addEventListener('click', addSetRow);
document.getElementById('btn-clear-sets').addEventListener('click', ()=>{ setsContainer.innerHTML=""; });

document.getElementById('btn-cancel').addEventListener('click', ()=> dlg.close());
document.getElementById('btn-save').addEventListener('click', (e)=>{
  e.preventDefault();
  saveFromForm();
});
frm.addEventListener('submit', (e)=>{
  e.preventDefault();
  saveFromForm();
});

// Render
function render(){
  let filtered=[];
  try{
    filtered = getFiltered(matches);
  }catch(e){
    console.error('Error durante render/getFiltered', e);
    filtered = [];
  }
  tbody.innerHTML = "";
  for(const m of filtered){
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.fecha||""}</td>
      <td><span class="badge">${fmtFormato(m.formato)}</span></td>
      <td>${esc(m.rival||"")}</td>
      <td>${esc(m.superficie||"")}</td>
      <td>${fmtSets(m.sets||[])}</td>
      <td class="result-${m.resultado==='W'?'W':(m.resultado==='L'?'L':'')}">${esc(m.resultado||"")}</td>
      <td>${m.duracion_min? (m.duracion_min+' min'):""}</td>
      <td>${m.rpe||""}</td>
      <td>${esc([m.notas,m.tags].filter(Boolean).join(" • "))}</td>
      <td>
        <button onclick="edit('${m.id}')">Editar</button>
        <button onclick="delItem('${m.id}')">Borrar</button>
      </td>
    `;
    tbody.appendChild(tr);
  }
  renderKPIs(filtered);
}

function renderKPIs(rows){
  try{
    const total = rows.length;
    const wins = rows.filter(r=>r.resultado==='W').length;
    document.getElementById('kpi-winrate').textContent = total? ((wins/total*100).toFixed(0)+'%') : '—';

    const bySurf = groupBy(rows, r=>r.superficie||'—');
    const surfTxt = Object.entries(bySurf).map(([k,arr])=>{
      const w = arr.filter(r=>r.resultado==='W').length;
      return `${k}: ${arr.length? (Math.round(100*w/arr.length)+'%'):'—'}`;
    }).join('\n');
    document.getElementById('kpi-superficie').textContent = surfTxt || '—';

    const sorted = [...rows].sort((a,b)=> (a.fecha||"") < (b.fecha||"") ? -1 : 1);
    let streak=0, type=null;
    for(let i=sorted.length-1;i>=0;i--){
      const r = sorted[i].resultado;
      if(!r || r==='RET') break;
      if(type===null){ type=r; streak=1; }
      else if(r===type){ streak++; } else break;
    }
    document.getElementById('kpi-streak').textContent = type? `${type==='W'?'W':'L'} ${streak}` : '—';

    const withDur = rows.filter(r=>Number.isFinite(Number(r.duracion_min)));
    const avgDur = withDur.length ? Math.round(withDur.reduce((s,r)=>s+Number(r.duracion_min),0)/withDur.length) : null;
    document.getElementById('kpi-duracion').textContent = avgDur? `${avgDur} min`:'—';

    const withRpe = rows.filter(r=>Number.isFinite(Number(r.rpe)));
    const avgRpe = withRpe.length ? (withRpe.reduce((s,r)=>s+Number(r.rpe),0)/withRpe.length).toFixed(1) : null;
    document.getElementById('kpi-rpe').textContent = avgRpe? `${avgRpe}`:'—';
  }catch(e){
    console.error('Error renderKPIs', e);
  }
}

function getFiltered(arr){
  const q = (fSearch.value||"").toLowerCase().trim();
  const sup = fSuperficie.value;
  const res = fResultado.value;
  const d1 = fDesde.value ? new Date(fDesde.value) : null;
  const d2 = fHasta.value ? new Date(fHasta.value) : null;
  return arr.filter(m=>{
    if(q){
      const hay = [m.rival, m.notas, m.tags].filter(Boolean).join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    if(sup && m.superficie!==sup) return false;
    if(res && m.resultado!==res) return false;
    if(d1 && (!m.fecha || new Date(m.fecha) < d1)) return false;
    if(d2 && (!m.fecha || new Date(m.fecha) > d2)) return false;
    return true;
  });
}

// Helpers
function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function fmtSets(sets){
  if(!sets || !sets.length) return '';
  return sets.map(s=> `${s.me}-${s.rival}` + (s.tb?`(${s.tb})`:'') ).join(', ');
}
function fmtFormato(code){
  switch(code){
    case 'BO3_TB': return 'Mejor de 3 (TB)';
    case 'BO3_STB': return 'Mejor de 3 (Super TB)';
    case 'PRO8': return 'Pro set a 8';
    case 'SET6': return 'Set único a 6';
    default: return code || '—';
  }
}
function groupBy(arr, fn){
  return arr.reduce((acc,x)=>{ const k = fn(x); (acc[k]||(acc[k]=[])).push(x); return acc; },{});
}
function uid(){ return Math.random().toString(36).slice(2,10); }

// Dialog open/edit
function openDialog(editing=null){
  frm.reset();
  setsContainer.innerHTML = "";
  document.getElementById('dlg-title').textContent = editing? 'Editar partido' : 'Nuevo partido';
  dlg.showModal();
  if(editing){
    const m = matches.find(x=>x.id===editing);
    if(!m) return;
    document.getElementById('fecha').value = m.fecha || '';
    document.getElementById('hora_inicio').value = m.hora_inicio || '';
    document.getElementById('duracion_min').value = m.duracion_min || '';
    document.getElementById('rival').value = m.rival || '';
    document.getElementById('superficie').value = m.superficie || '';
    document.getElementById('ubicacion').value = m.ubicacion || '';
    document.getElementById('formato').value = m.formato || 'BO3_TB';
    document.getElementById('rpe').value = m.rpe || '';
    document.getElementById('tags').value = m.tags || '';
    document.getElementById('notas').value = m.notas || '';
    (m.sets||[]).forEach(s=> addSetRow(s.me, s.rival, s.tb||''));
    dlg.dataset.editing = editing;
  }else{
    document.getElementById('fecha').valueAsDate = new Date();
    document.getElementById('formato').value = 'BO3_TB';
    dlg.dataset.editing = "";
  }
}

function addSetRow(me="", rival="", tb=""){
  const row = document.createElement('div');
  row.className = 'set-row';
  row.innerHTML = `
    <span>Yo</span><input type="number" min="0" step="1" value="${esc(me)}">
    <span>-</span>
    <input type="number" min="0" step="1" value="${esc(rival)}"><span>Rival</span>
    <input type="text" placeholder="TB (opcional)" value="${esc(tb)}">
    <button type="button" class="x" title="Eliminar">✕</button>
  `;
  row.querySelector('.x').addEventListener('click', ()=> row.remove());
  setsContainer.appendChild(row);
}

function collectSets(){
  const rows = [...setsContainer.querySelectorAll('.set-row')];
  return rows.map(r=>{
    const [meInput, , rivalInput, , tbInput] = r.querySelectorAll('input');
    return { me: Number(meInput.value||0), rival: Number(rivalInput.value||0), tb: (tbInput.value||"").trim() };
  }).filter(s=> !(s.me===0 && s.rival===0) );
}

function computeResult(sets){
  if(!sets.length) return "";
  let mySets = 0, oppSets = 0;
  for(const s of sets){
    if(s.me > s.rival) mySets++; else if(s.rival > s.me) oppSets++;
  }
  if(mySets===oppSets) return "RET";
  return mySets>oppSets ? "W" : "L";
}

function saveFromForm(){
  try{
    const m = {
      id: dlg.dataset.editing || uid(),
      fecha: document.getElementById('fecha').value || "",
      hora_inicio: document.getElementById('hora_inicio').value || "",
      duracion_min: Number(document.getElementById('duracion_min').value||"") || "",
      rival: document.getElementById('rival').value.trim(),
      superficie: document.getElementById('superficie').value,
      ubicacion: document.getElementById('ubicacion').value.trim(),
      formato: document.getElementById('formato').value,
      rpe: Number(document.getElementById('rpe').value||"") || "",
      tags: document.getElementById('tags').value.trim(),
      notas: document.getElementById('notas').value.trim(),
      sets: collectSets()
    };
    m.resultado = computeResult(m.sets);

    if(!m.fecha){ alert("La fecha es obligatoria."); return; }

    const idx = matches.findIndex(x=>x.id===m.id);
    if(idx>=0) matches[idx] = m; else matches.push(m);
    save();
    dlg.close();
  }catch(e){
    console.error('Error en saveFromForm', e);
    alert('Ocurrió un error al guardar. Prueba el botón "Reset datos" y vuelve a intentarlo.');
  }
}

// Global ops
window.edit = openDialog;
window.delItem = function(id){
  if(!confirm("¿Borrar este partido?")) return;
  matches = matches.filter(x=>x.id!==id);
  save();
}

// Export helpers
function downloadText(text, filename, type){
  const blob = new Blob([text], {type});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toCSV(arr){
  const headers = ["id","fecha","hora_inicio","duracion_min","rival","superficie","ubicacion","formato","rpe","tags","notas","sets","resultado"];
  const rows = arr.map(m=>{
    const copy = {...m};
    copy.sets = (m.sets||[]).map(s=>`${s.me}-${s.rival}${s.tb?`(${s.tb})`:""}`).join(" | ");
    return headers.map(h=> (copy[h]!==undefined? String(copy[h]).replaceAll('"','""') : "") );
  });
  const csvRows = [headers.join(","), ...rows.map(r=> r.map(x=>`"${x}"`).join(","))];
  return csvRows.join("\n");
}

// Import JSON
async function importJSON(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const text = await file.text();
  try{
    const data = JSON.parse(text);
    if(!Array.isArray(data)) throw new Error("El JSON debe ser un arreglo.");
    const map = Object.fromEntries(matches.map(m=>[m.id,m]));
    for(const item of data){
      if(item && item.id){
        map[item.id] = item;
      }
    }
    matches = Object.values(map);
    save();
    alert("Importación JSON completada.");
  }catch(err){
    console.error(err);
    alert("No se pudo importar JSON: " + err.message);
  }finally{
    ev.target.value="";
  }
}

// Import CSV
async function importCSV(ev){
  const file = ev.target.files[0];
  if(!file) return;
  const text = await file.text();
  try{
    const lines = text.split(/\r?\n/).filter(x=>x.trim().length);
    const headers = lines[0].split(",").map(h=>h.replace(/^"|"$/g,""));
    const idx = (h)=> headers.indexOf(h);
    const arr = [];
    for(let i=1;i<lines.length;i++){
      const row = parseCSVLine(lines[i]);
      const obj = {
        id: row[idx("id")] || uid(),
        fecha: row[idx("fecha")] || "",
        hora_inicio: row[idx("hora_inicio")] || "",
        duracion_min: Number(row[idx("duracion_min")]||"") || "",
        rival: row[idx("rival")] || "",
        superficie: row[idx("superficie")] || "",
        ubicacion: row[idx("ubicacion")] || "",
        formato: row[idx("formato")] || "BO3_TB",
        rpe: Number(row[idx("rpe")]||"") || "",
        tags: row[idx("tags")] || "",
        notas: row[idx("notas")] || "",
        sets: parseSets(row[idx("sets")] || ""),
        resultado: row[idx("resultado")] || ""
      };
      if(!obj.resultado) obj.resultado = computeResult(obj.sets);
      arr.push(obj);
    }
    const map = Object.fromEntries(matches.map(m=>[m.id,m]));
    for(const item of arr){
      map[item.id] = item;
    }
    matches = Object.values(map);
    save();
    alert("Importación CSV completada.");
  }catch(err){
    console.error(err);
    alert("No se pudo importar CSV: " + err.message);
  }finally{
    ev.target.value="";
  }
}

function parseCSVLine(line){
  const out = [];
  let cur = "", inQuotes=false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(inQuotes){
      if(ch==='"'){
        if(line[i+1]==='"'){ cur+='"'; i++; } else { inQuotes=false; }
      }else cur+=ch;
    }else{
      if(ch==='"'){ inQuotes=true; }
      else if(ch===','){ out.push(cur); cur=""; }
      else cur+=ch;
    }
  }
  out.push(cur);
  return out;
}
function parseSets(text){
  const parts = text.split("|").map(s=>s.trim()).filter(Boolean);
  const arr = [];
  for(const p of parts){
    const m = p.match(/^(\d+)\-(\d+)(?:\(([^)]+)\))?$/);
    if(m){
      arr.push({ me:Number(m[1]), rival:Number(m[2]), tb:m[3]||"" });
    }
  }
  return arr;
}

// Toast
let toastTimer=null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.hidden = true; }, 1500);
}

// Initial paint
try{
  render();
}catch(e){
  console.error('Error en render inicial', e);
  alert('Hubo un problema inicial. Prueba el botón "Reset datos".');
}
})(); // IIFE

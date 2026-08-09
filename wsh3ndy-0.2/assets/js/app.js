const DAYS = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس"];
const DAY_START = 7;   // 7 AM
const DAY_END = 23;    // 11 PM
const HOUR_PX = 56;
const COLORS = ["#7A2E2E","#1D5C4B","#1B3A6B","#8A5A1B","#5C3B7A","#2E6B6B"];
const EMOJIS = ["📘","💻","🧪","📐","🎨","🌍","⚖️","🩺"];

let courses = [];
let editingId = null;
let use24Hour = false;
let currentCode = null;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون أحرف/أرقام متشابهة

function generateCode(){
  let code='';
  for(let i=0;i<6;i++){ code += CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]; }
  return code;
}

function formatHourLabel(hour24){
  if(use24Hour){
    return String(hour24).padStart(2,'0')+':00';
  }
  const ampm = hour24<12? 'ص':'م';
  const hour12 = ((hour24+11)%12)+1;
  return hour12+':00 '+ampm;
}

function formatTimeDisplay(t){
  const [h,m] = t.split(':').map(Number);
  if(use24Hour){
    return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0');
  }
  const ampm = h<12? 'ص':'م';
  const hour12 = ((h+11)%12)+1;
  return hour12+':'+String(m).padStart(2,'0')+' '+ampm;
}

const grid = document.getElementById('grid');
const listContainer = document.getElementById('listContainer');
const overlay = document.getElementById('overlay');
const warnBox = document.getElementById('warnBox');

document.documentElement.style.setProperty('--daycount', DAYS.length);
document.documentElement.style.setProperty('--hourpx', HOUR_PX+'px');

function uid(){ return 'c'+Math.random().toString(36).slice(2,10); }

function shadeHex(hex, percent){
  const num = parseInt(hex.slice(1),16);
  let r = (num>>16) + Math.round(255*percent);
  let g = ((num>>8)&0xff) + Math.round(255*percent);
  let b = (num&0xff) + Math.round(255*percent);
  r = Math.max(0,Math.min(255,r));
  g = Math.max(0,Math.min(255,g));
  b = Math.max(0,Math.min(255,b));
  return '#'+(0x1000000 + r*0x10000 + g*0x100 + b).toString(16).slice(1);
}

function gradientFor(hex){
  return 'linear-gradient(135deg, '+shadeHex(hex,0.16)+' 0%, '+hex+' 55%, '+shadeHex(hex,-0.22)+' 100%)';
}

function customConfirm(message){
  return new Promise(resolve=>{
    const ov = document.getElementById('confirmOverlay');
    document.getElementById('confirmMsg').textContent = message;
    ov.classList.add('show');
    const yesBtn = document.getElementById('confirmYesBtn');
    const noBtn = document.getElementById('confirmNoBtn');
    function cleanup(result){
      ov.classList.remove('show');
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      resolve(result);
    }
    function onYes(){ cleanup(true); }
    function onNo(){ cleanup(false); }
    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
  });
}

function toMinutes(t){
  const [h,m] = t.split(':').map(Number);
  return h*60+m;
}

async function loadCourses(){
  try{
    const mine = await window.storage.get('schedule:mycode');
    currentCode = (mine && mine.value) ? mine.value : null;
  }catch(e){ currentCode = null; }

  if(!currentCode){
    currentCode = generateCode();
    try{ await window.storage.set('schedule:mycode', currentCode); }catch(e){}
  }

  try{
    const res = await window.storage.get('schedule:shared:'+currentCode, true);
    if(res && res.value){ courses = JSON.parse(res.value); }
  }catch(e){ courses = []; }

  try{
    const settings = await window.storage.get('schedule:settings');
    if(settings && settings.value){
      const parsed = JSON.parse(settings.value);
      use24Hour = !!parsed.use24Hour;
    }
  }catch(e){ use24Hour = false; }

  updateFormatBtn();
  updateCodeDisplay();
  render();
}

async function saveCourses(){
  try{
    await window.storage.set('schedule:shared:'+currentCode, JSON.stringify(courses), true);
  }catch(e){ console.error('تعذر الحفظ', e); }
}

function updateCodeDisplay(){
  const el = document.getElementById('codeValue');
  if(el) el.textContent = currentCode || '------';
}

async function restoreByCode(rawCode){
  const restoreMsg = document.getElementById('restoreMsg');
  restoreMsg.classList.remove('show');
  const code = rawCode.trim().toUpperCase().replace(/\s+/g,'');
  if(code.length<4 || code.length>12 || !/^[A-Z0-9]+$/.test(code)){
    restoreMsg.textContent='الرمز يتكون من 4 إلى 12 حرف/رقم إنجليزي';
    restoreMsg.classList.add('show');
    return;
  }
  let res;
  try{
    res = await window.storage.get('schedule:shared:'+code, true);
  }catch(e){
    restoreMsg.textContent='لم يتم العثور على جدول بهذا الرمز';
    restoreMsg.classList.add('show');
    return;
  }
  if(!res || !res.value){
    restoreMsg.textContent='لم يتم العثور على جدول بهذا الرمز';
    restoreMsg.classList.add('show');
    return;
  }
  const ok = await customConfirm('سيتم استبدال الجدول الحالي بالجدول المرتبط بهذا الرمز. متابعة؟');
  if(!ok) return;

  currentCode = code;
  try{ await window.storage.set('schedule:mycode', currentCode); }catch(e){}
  courses = JSON.parse(res.value);
  updateCodeDisplay();
  document.getElementById('restoreCodeInput').value='';
  render();
}

async function saveSettings(){
  try{
    await window.storage.set('schedule:settings', JSON.stringify({use24Hour}));
  }catch(e){ console.error('تعذر حفظ الإعدادات', e); }
}

function updateFormatBtn(){
  const btn = document.getElementById('formatBtn');
  btn.textContent = use24Hour ? 'عرض 12 ساعة' : 'عرض 24 ساعة';
  btn.classList.toggle('active', use24Hour);
}

function findConflicts(course){
  return courses.filter(c=>{
    if(c.id===course.id) return false;
    if(c.day!==course.day) return false;
    const aS=toMinutes(course.start), aE=toMinutes(course.end);
    const bS=toMinutes(c.start), bE=toMinutes(c.end);
    return aS < bE && bS < aE;
  });
}

function buildGrid(){
  grid.innerHTML = '';
  const corner = document.createElement('div');
  corner.className='corner';
  grid.appendChild(corner);

  DAYS.forEach(d=>{
    const el=document.createElement('div');
    el.className='daylabel';
    el.textContent=d;
    grid.appendChild(el);
  });

  const totalHours = DAY_END - DAY_START;
  const hourCol = document.createElement('div');
  hourCol.style.gridColumn='1';
  hourCol.style.gridRow='2';
  hourCol.style.position='relative';
  hourCol.style.height = (totalHours*HOUR_PX)+'px';
  for(let h=0; h<=totalHours; h++){
    const lbl=document.createElement('div');
    lbl.className='hourlabel';
    lbl.style.position='absolute';
    lbl.style.top=(h*HOUR_PX)+'px';
    lbl.style.right='0';
    const hour24 = DAY_START+h;
    lbl.textContent = formatHourLabel(hour24);
    hourCol.appendChild(lbl);
  }
  grid.appendChild(hourCol);

  DAYS.forEach((d,i)=>{
    const col=document.createElement('div');
    col.className='daycol';
    col.style.gridColumn=(i+2);
    col.style.gridRow='2';
    col.style.height=(totalHours*HOUR_PX)+'px';
    col.dataset.day=d;
    grid.appendChild(col);
  });
}

function renderCards(){
  const cols = grid.querySelectorAll('.daycol');
  cols.forEach(c=> c.querySelectorAll('.course-card').forEach(el=>el.remove()));

  courses.forEach(course=>{
    const col = grid.querySelector('.daycol[data-day="'+course.day+'"]');
    if(!col) return;
    const startMin = toMinutes(course.start) - DAY_START*60;
    const endMin = toMinutes(course.end) - DAY_START*60;
    const top = (startMin/60)*HOUR_PX;
    const height = Math.max(((endMin-startMin)/60)*HOUR_PX, 30);

    const conflicts = findConflicts(course);
    const card = document.createElement('div');
    card.className='course-card'+(conflicts.length? ' conflict':'');
    card.dataset.courseId = course.id;
    card.style.top = top+'px';
    card.style.height = height+'px';
    card.style.background = gradientFor(course.color);
    card.innerHTML = `
      ${conflicts.length? '<span class="conflict-tag">تعارض</span>' : ''}
      <b>${course.emoji? '<span class="card-emoji">'+course.emoji+'</span>':''}${escapeHtml(course.name)}</b>
      <div class="meta">${formatTimeDisplay(course.start)} - ${formatTimeDisplay(course.end)}${course.room? ' • '+escapeHtml(course.room):''}</div>
    `;
    card.addEventListener('click', ()=> openModal(course.id));
    col.appendChild(card);
  });
}

function escapeHtml(s){
  const d=document.createElement('div');
  d.textContent = s||'';
  return d.innerHTML;
}

function formatDate(iso){
  const [y,m,d] = iso.split('-');
  return d+'/'+m;
}

function formatDateRange(c){
  if(c.dateStart && c.dateEnd) return ' • '+formatDate(c.dateStart)+' - '+formatDate(c.dateEnd);
  if(c.dateStart) return ' • من '+formatDate(c.dateStart);
  if(c.dateEnd) return ' • حتى '+formatDate(c.dateEnd);
  return '';
}

function renderList(){
  listContainer.innerHTML='';
  if(courses.length===0){
    listContainer.innerHTML = '<div class="empty-msg">لا توجد مواد بعد — اضغط "إضافة مادة" للبدء</div>';
    return;
  }
  const sorted = [...courses].sort((a,b)=> DAYS.indexOf(a.day)-DAYS.indexOf(b.day) || toMinutes(a.start)-toMinutes(b.start));
  sorted.forEach(c=>{
    const row=document.createElement('div');
    row.className='course-row';
    row.style.borderRightColor = c.color;
    row.innerHTML = `
      <div class="dot" style="background:${gradientFor(c.color)}"></div>
      <div class="info">
        <b>${c.emoji? c.emoji+' ':''}${escapeHtml(c.name)}</b>
        <small>${c.day} • ${formatTimeDisplay(c.start)} - ${formatTimeDisplay(c.end)}${c.room? ' • '+escapeHtml(c.room):''}${c.instructor? ' • '+escapeHtml(c.instructor):''}${formatDateRange(c)}</small>
      </div>
      <div class="row-actions">
        <button class="icon-btn" data-edit="${c.id}" title="تعديل">✎</button>
        <button class="icon-btn danger" data-del="${c.id}" title="حذف">✕</button>
      </div>
    `;
    listContainer.appendChild(row);
  });
  listContainer.querySelectorAll('[data-edit]').forEach(b=>
    b.addEventListener('click', ()=> openModal(b.dataset.edit)));
  listContainer.querySelectorAll('[data-del]').forEach(b=>
    b.addEventListener('click', ()=> deleteCourse(b.dataset.del)));
}

function updateTotalHours(){
  const total = courses.reduce((sum,c)=> sum + (toMinutes(c.end)-toMinutes(c.start)), 0);
  document.getElementById('totalHours').textContent = Math.round(total/60*10)/10;
}

function render(){
  buildGrid();
  renderCards();
  renderList();
  updateTotalHours();
}

/* ===== Modal logic ===== */
const daySelect = document.getElementById('f_day');
DAYS.forEach(d=>{
  const opt=document.createElement('option');
  opt.value=d; opt.textContent=d;
  daySelect.appendChild(opt);
});

const colorPicker = document.getElementById('colorPicker');
let selectedColor = COLORS[0];
COLORS.forEach(col=>{
  const sw=document.createElement('div');
  sw.className='swatch'+(col===selectedColor?' active':'');
  sw.style.background=gradientFor(col);
  sw.dataset.color=col;
  sw.addEventListener('click', ()=>{
    selectedColor=col;
    colorPicker.querySelectorAll('.swatch').forEach(s=>s.classList.remove('active'));
    sw.classList.add('active');
  });
  colorPicker.appendChild(sw);
});

const emojiPicker = document.getElementById('emojiPicker');
let selectedEmoji = EMOJIS[0];
function buildEmojiPicker(){
  emojiPicker.innerHTML='';
  EMOJIS.forEach(em=>{
    const btn=document.createElement('div');
    btn.className='emoji-btn'+(em===selectedEmoji?' active':'');
    btn.textContent=em;
    btn.addEventListener('click', ()=>{
      selectedEmoji=em;
      emojiPicker.querySelectorAll('.emoji-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
    });
    emojiPicker.appendChild(btn);
  });
}
buildEmojiPicker();

function openModal(id){
  editingId = id || null;
  warnBox.classList.remove('show');
  const deleteBtn = document.getElementById('deleteInModalBtn');
  deleteBtn.style.display = id ? 'block' : 'none';
  if(id){
    const c = courses.find(x=>x.id===id);
    document.getElementById('modalTitle').textContent='تعديل مادة';
    document.getElementById('f_name').value=c.name;
    document.getElementById('f_day').value=c.day;
    document.getElementById('f_room').value=c.room||'';
    document.getElementById('f_start').value=c.start;
    document.getElementById('f_end').value=c.end;
    document.getElementById('f_dateStart').value=c.dateStart||'';
    document.getElementById('f_dateEnd').value=c.dateEnd||'';
    document.getElementById('f_instructor').value=c.instructor||'';
    selectedColor=c.color;
    selectedEmoji=c.emoji||EMOJIS[0];
  } else {
    document.getElementById('modalTitle').textContent='إضافة مادة';
    document.getElementById('f_name').value='';
    document.getElementById('f_day').value=DAYS[0];
    document.getElementById('f_room').value='';
    document.getElementById('f_start').value='09:00';
    document.getElementById('f_end').value='10:30';
    document.getElementById('f_dateStart').value='';
    document.getElementById('f_dateEnd').value='';
    document.getElementById('f_instructor').value='';
    selectedColor=COLORS[Math.floor(Math.random()*COLORS.length)];
    selectedEmoji=EMOJIS[Math.floor(Math.random()*EMOJIS.length)];
  }
  colorPicker.querySelectorAll('.swatch').forEach(s=> s.classList.toggle('active', s.dataset.color===selectedColor));
  buildEmojiPicker();
  overlay.classList.add('show');
}


function closeModal(){
  overlay.classList.remove('show');
  editingId=null;
}

document.getElementById('addBtn').addEventListener('click', ()=>openModal(null));
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('deleteInModalBtn').addEventListener('click', async ()=>{
  if(!editingId) return;
  const idToDelete = editingId;
  const ok = await customConfirm('هل تريد حذف هذه المادة؟');
  if(!ok) return;
  closeModal();
  courses = courses.filter(c=>c.id!==idToDelete);
  await saveCourses();
  render();
});
overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeModal(); });

document.getElementById('saveBtn').addEventListener('click', async ()=>{
  const formMsg = document.getElementById('formMsg');
  formMsg.classList.remove('show');
  const name = document.getElementById('f_name').value.trim();
  const day = document.getElementById('f_day').value;
  const room = document.getElementById('f_room').value.trim();
  const start = document.getElementById('f_start').value;
  const end = document.getElementById('f_end').value;
  const dateStart = document.getElementById('f_dateStart').value;
  const dateEnd = document.getElementById('f_dateEnd').value;
  const instructor = document.getElementById('f_instructor').value.trim();

  if(!name){ formMsg.textContent='الرجاء إدخال اسم المادة'; formMsg.classList.add('show'); return; }
  if(toMinutes(end) <= toMinutes(start)){ formMsg.textContent='وقت النهاية يجب أن يكون بعد وقت البداية'; formMsg.classList.add('show'); return; }
  if(dateStart && dateEnd && dateEnd < dateStart){ formMsg.textContent='تاريخ النهاية يجب أن يكون بعد تاريخ البداية'; formMsg.classList.add('show'); return; }

  const courseData = {
    id: editingId || uid(),
    name, day, room, start, end, dateStart, dateEnd, instructor, color: selectedColor, emoji: selectedEmoji
  };

  if(editingId){
    const idx = courses.findIndex(c=>c.id===editingId);
    courses[idx] = courseData;
  } else {
    courses.push(courseData);
  }

  await saveCourses();
  closeModal();
  render();
});

async function deleteCourse(id){
  const ok = await customConfirm('هل تريد حذف هذه المادة؟');
  if(!ok) return;
  courses = courses.filter(c=>c.id!==id);
  await saveCourses();
  render();
}

document.getElementById('editCodeBtn').addEventListener('click', ()=>{
  const input = document.getElementById('customCodeInput');
  const msg = document.getElementById('codeModalMsg');
  input.value = currentCode || '';
  msg.classList.remove('show');
  document.getElementById('codeModalOverlay').classList.add('show');
  input.focus();
});

document.getElementById('codeModalCancelBtn').addEventListener('click', ()=>{
  document.getElementById('codeModalOverlay').classList.remove('show');
});

document.getElementById('customCodeInput').addEventListener('input', (e)=>{
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
});

document.getElementById('codeModalSaveBtn').addEventListener('click', async ()=>{
  const msg = document.getElementById('codeModalMsg');
  msg.classList.remove('show');
  const newCode = document.getElementById('customCodeInput').value.trim();

  if(newCode.length<4 || newCode.length>12){
    msg.textContent='الرمز يتكون من 4 إلى 12 حرف/رقم إنجليزي';
    msg.classList.add('show');
    return;
  }
  if(newCode===currentCode){
    document.getElementById('codeModalOverlay').classList.remove('show');
    return;
  }

  // تحقق إذا الرمز الجديد مستخدم من قبل لجدول آخر
  let taken = false;
  try{
    const existing = await window.storage.get('schedule:shared:'+newCode, true);
    taken = !!(existing && existing.value);
  }catch(e){ taken = false; }

  if(taken){
    document.getElementById('codeModalOverlay').classList.remove('show');
    const ok = await customConfirm('هذا الرمز مستخدم بجدول آخر بالفعل. إذا كملت، جدولك الحالي بيحل محله. متابعة؟');
    if(!ok) return;
  }

  currentCode = newCode;
  try{ await window.storage.set('schedule:mycode', currentCode); }catch(e){}
  await saveCourses(); // ينقل بيانات الجدول الحالي للرمز الجديد
  updateCodeDisplay();
  document.getElementById('codeModalOverlay').classList.remove('show');
});

document.getElementById('copyCodeBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('copyCodeBtn');
  try{
    await navigator.clipboard.writeText(currentCode);
    const original = btn.textContent;
    btn.textContent='✓';
    setTimeout(()=>{ btn.textContent = original; }, 1200);
  }catch(e){
    // fallback: select the text so the user can copy manually
    const range = document.createRange();
    const el = document.getElementById('codeValue');
    range.selectNode(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }
});

document.getElementById('restoreBtn').addEventListener('click', ()=>{
  restoreByCode(document.getElementById('restoreCodeInput').value);
});
document.getElementById('restoreCodeInput').addEventListener('input', (e)=>{
  e.target.value = e.target.value.toUpperCase();
});
document.getElementById('restoreCodeInput').addEventListener('keydown', (e)=>{
  if(e.key==='Enter') restoreByCode(document.getElementById('restoreCodeInput').value);
});

document.getElementById('formatBtn').addEventListener('click', async ()=>{
  use24Hour = !use24Hour;
  updateFormatBtn();
  await saveSettings();
  render();
});

document.getElementById('clearBtn').addEventListener('click', async ()=>{
  if(courses.length===0) return;
  const ok = await customConfirm('سيتم حذف جميع المواد من الجدول. هل أنت متأكد؟');
  if(!ok) return;
  courses = [];
  await saveCourses();
  render();
});

loadCourses();
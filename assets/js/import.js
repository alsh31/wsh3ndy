/*
  استيراد الجدول من نص تصدير خدمة الطالب الجامعية
  ---------------------------------------------------
  يحلّل النص الخام الذي يُنسخ من صفحة جدول التسجيل بموقع الجامعة،
  ويستخرج منه كل محاضرة/اختبار: الاسم، اليوم، الوقت، القاعة،
  المبنى، الأستاذ، وتاريخ بداية/نهاية الشعبة، ثم يضيفها تلقائياً
  للجدول (إضافة أو استبدال حسب اختيار المستخدم).
*/

const MONTHS_EN = {
  January:'01', February:'02', March:'03', April:'04', May:'05', June:'06',
  July:'07', August:'08', September:'09', October:'10', November:'11', December:'12'
};

function toIsoDate(dd, monthName, yyyy){
  const mm = MONTHS_EN[monthName];
  if(!mm) return '';
  return `${yyyy}-${mm}-${String(dd).padStart(2,'0')}`;
}

function normalizeDayName(d){
  const stripped = d.replace(/[إأآ]/g,'ا').trim();
  const map = {
    'الاحد':'الأحد',
    'الاثنين':'الاثنين',
    'الثلاثاء':'الثلاثاء',
    'الاربعاء':'الأربعاء',
    'الخميس':'الخميس'
  };
  return map[stripped] || null; // نتجاهل الجمعة/السبت لأن الجدول لا يعرضهما
}

function importTo24Hour(hh, mm, ampm){
  let h = Number(hh);
  const isPM = ampm.startsWith('م');
  if(isPM){ if(h!==12) h+=12; } else { if(h===12) h=0; }
  return String(h).padStart(2,'0')+':'+mm;
}

function parseScheduleText(raw){
  const rawLines = raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0);
  const lines = rawLines.filter(l => !/^[حنثرخجس]$/.test(l));

  const blocks = [];
  let current = null;
  for(const line of lines){
    const isHeader = line.includes('بداية الشعبة:') && line.includes('نهاية الشعبة:');
    if(isHeader){
      if(current) blocks.push(current);
      current = [line];
    } else if(current){
      current.push(line);
    }
  }
  if(current) blocks.push(current);

  const sessionLineRe = /^(\d{2}):(\d{2})\s*(صباحا|صباحاً|مساءً|مساء)\s*-\s*(\d{2}):(\d{2})\s*(صباحا|صباحاً|مساءً|مساء)\s*النوع:\s*(\S+)\s*الموقع:\s*(.+?)\s*المبنى:\s*(.+?)\s*الغرفة:\s*(.+)$/;
  const dateRangeRe = /^(\d{2})\/(\w+)\/(\d{4})\s*--\s*(\d{2})\/(\w+)\/(\d{4})\s+(\S+)$/;

  const results = [];
  let skippedDay = 0;

  blocks.forEach(block=>{
    const header = block[0];
    let name = header.split('|')[0].trim().replace(/^سس\s+/, '').trim();
    if(!name) return;

    let instructor = '';
    const instrLine = block.find(l => l.startsWith('المحاضر:'));
    if(instrLine){
      instructor = instrLine.replace('المحاضر:','').replace(/\(أساسي\)/,'').trim();
    }

    for(let i=1;i<block.length;i++){
      const dm = block[i].match(dateRangeRe);
      if(!dm) continue;
      const nextLine = block[i+1];
      if(!nextLine) continue;
      const sm = nextLine.match(sessionLineRe);
      if(!sm) continue;

      const day = normalizeDayName(dm[7]);
      if(!day){ skippedDay++; continue; }

      const dateStart = toIsoDate(dm[1], dm[2], dm[3]);
      const dateEnd = toIsoDate(dm[4], dm[5], dm[6]);
      const start = importTo24Hour(sm[1], sm[2], sm[3]);
      const end = importTo24Hour(sm[4], sm[5], sm[6]);
      const type = sm[7];
      const building = sm[9];
      let room = sm[10];
      if(room === 'لا يوجد') room = '';
      const roomFull = [building, room].filter(Boolean).join(' - ');
      const isExam = type.includes('اختبار');

      results.push({
        baseName: name,
        name: name,
        day, start, end,
        room: roomFull,
        instructor,
        dateStart, dateEnd,
        isExam
      });
    }
  });

  return { results, coursesFound: blocks.length, skippedDay };
}

/* ==================================================================
   محلل مرن (fuzzy) — يستخدم لنصوص غير منظمة (خصوصاً نتائج OCR من
   الصور) حيث لا يمكن الاعتماد على ترتيب الأسطر الدقيق. يبحث عن كل
   نمط وقت بالنص، ثم يستخرج من حوله (اليوم، التاريخ، القاعة، المبنى،
   النوع، الأستاذ، واسم المادة) بدل الاعتماد على بنية سطر-بسطر صارمة.
   ================================================================== */
const MONTH_INDEX = {
  January:0, February:1, March:2, April:3, May:4, June:5,
  July:6, August:7, September:8, October:9, November:10, December:11
};

function weekdayFromDate(dd, monthName, yyyy){
  const mi = MONTH_INDEX[monthName];
  if(mi===undefined) return null;
  const d = new Date(Number(yyyy), mi, Number(dd));
  const dow = d.getDay(); // 0=الأحد .. 6=السبت
  if(dow>=0 && dow<=4) return DAYS[dow]; // نعرض فقط الأحد-الخميس
  return null;
}

function cleanCourseName(text){
  let name = text.replace(/^سس\s+/, '').trim();
  name = name.replace(/^[\d\s\|:\-]+/, '').trim();
  const segments = name.split(/\s{2,}|\n/).filter(Boolean);
  if(segments.length) name = segments[segments.length-1].trim();
  return name || 'مادة بدون اسم';
}

function findCourseNameFuzzy(flat, beforeIndex){
  const shubaIdx = flat.lastIndexOf('الشعبة', beforeIndex);
  if(shubaIdx === -1) return 'مادة بدون اسم';
  const windowStart = Math.max(0, shubaIdx-150);
  const windowText = flat.slice(windowStart, shubaIdx);
  const pipeIdx = windowText.indexOf('|');
  const candidate = pipeIdx!==-1 ? windowText.slice(0,pipeIdx) : windowText;
  return cleanCourseName(candidate);
}

function parseFuzzySchedule(raw){
  const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l.length>0 && !/^[حنثرخجس]$/.test(l));
  const flat = lines.join(' \n ');

  const timeRe = /(\d{1,2})[:٫.](\d{2})\s*(صباحا|صباحاً|ص|مساء|مساءً|م)\s*-\s*(\d{1,2})[:٫.](\d{2})\s*(صباحا|صباحاً|ص|مساء|مساءً|م)/g;
  const dayRe = /(الأحد|الاحد|الإثنين|الاثنين|الثلاثاء|الأربعاء|الاربعاء|الخميس)/;
  const typeRe = /النوع\s*:?\s*(محاضرة|اختبار)/;
  const roomRe = /الغرفة\s*:?\s*([^\n|]+?)(?:$|\n|الرقم|المحاضر|لا يوجد محاضر)/;
  const buildingRe = /المبنى\s*:?\s*([^\n|]+?)(?:\s*الغرفة|$|\n)/;
  const instructorRe = /المحاضر\s*:?\s*([^\n|(]+)/;

  const seen = new Set();
  const results = [];
  let skippedDay = 0;
  let m;

  while((m = timeRe.exec(flat)) !== null){
    const idx = m.index;
    const windowBefore = flat.slice(Math.max(0, idx-220), idx);
    const windowAfter = flat.slice(idx, idx+260);

    const dateRangePairRe = /(\d{1,2})\/(\w+)\/(\d{4})\s*-{1,2}\s*(\d{1,2})\/(\w+)\/(\d{4})/g;
    let lastPairMatch = null;
    let pmatch;
    while((pmatch = dateRangePairRe.exec(windowBefore)) !== null){
      lastPairMatch = pmatch;
    }

    let dateStart = '', dateEnd = '', day = null;

    if(lastPairMatch){
      dateStart = toIsoDate(lastPairMatch[1], lastPairMatch[2], lastPairMatch[3]);
      dateEnd = toIsoDate(lastPairMatch[4], lastPairMatch[5], lastPairMatch[6]);

      const searchFrom = lastPairMatch.index + lastPairMatch[0].length;
      const narrowDayWindow = windowBefore.slice(searchFrom, searchFrom+30);
      const dayTextMatch = narrowDayWindow.match(dayRe);

      if(dateStart === dateEnd){
        day = weekdayFromDate(lastPairMatch[1], lastPairMatch[2], lastPairMatch[3]);
        if(!day && dayTextMatch) day = normalizeDayName(dayTextMatch[1]);
      } else {
        if(dayTextMatch) day = normalizeDayName(dayTextMatch[1]);
      }
    }

    if(!day){
      const dm = windowBefore.match(dayRe) || windowAfter.match(dayRe);
      if(dm) day = normalizeDayName(dm[1]);
    }
    if(!day){ skippedDay++; continue; }

    const start = importTo24Hour(m[1], m[2], m[3]);
    const end = importTo24Hour(m[4], m[5], m[6]);

    const typeMatch = windowAfter.match(typeRe);
    const isExam = !!(typeMatch && typeMatch[1]==='اختبار');

    const roomMatch = windowAfter.match(roomRe);
    let room = roomMatch ? roomMatch[1].trim() : '';
    if(room === 'لا يوجد' || /^لا\s*يوجد/.test(room)) room = '';
    const buildingMatch = windowAfter.match(buildingRe);
    const building = buildingMatch ? buildingMatch[1].trim() : '';
    const roomFull = [building, room].filter(Boolean).join(' - ');

    const instrMatch = windowAfter.match(instructorRe);
    const instructor = instrMatch ? instrMatch[1].replace(/\(أساسي\)/,'').trim() : '';

    const baseName = findCourseNameFuzzy(flat, idx);

    const dedupeKey = baseName+'|'+day+'|'+start+'|'+end;
    if(seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({ baseName, name: baseName, day, start, end, room: roomFull, instructor, dateStart, dateEnd, isExam });
  }

  return { results, coursesFound: new Set(results.map(r=>r.baseName)).size, skippedDay };
}

/* يختار الأدق: يجرب المحلل الصارم أولاً (مثالي للنص المنسوخ المنظم)،
   وإذا ما لقى نتائج كافية يجرب المحلل المرن (أفضل مع نص OCR المشوّش) */
function parseScheduleTextSmart(raw){
  const strict = parseScheduleText(raw);
  if(strict.results.length > 0) return strict;
  return parseFuzzySchedule(raw);
}

/* ===================== ربط الواجهة ===================== */
let importParsedResults = [];
let importMode = 'text'; // 'text' | 'image'

function openImportModal(){
  document.getElementById('importTextarea').value = '';
  document.getElementById('importMsg').classList.remove('show');
  document.getElementById('ocrMsg').classList.remove('show');
  document.getElementById('importImageInput').value = '';
  document.getElementById('importStepChoice').style.display = 'block';
  document.getElementById('importStepInput').style.display = 'none';
  document.getElementById('importStepPreview').style.display = 'none';
  document.getElementById('importOverlay').classList.add('show');
}

function closeImportModal(){
  document.getElementById('importOverlay').classList.remove('show');
}

function showInputStep(mode){
  importMode = mode;
  document.getElementById('importStepChoice').style.display = 'none';
  document.getElementById('importStepInput').style.display = 'block';
  document.getElementById('importImageArea').style.display = (mode==='image') ? 'block' : 'none';
  document.getElementById('importTextHint').textContent = (mode==='image')
    ? 'بعد استخراج النص من الصورة، راجعه وصحّح أي خطأ قبل الضغط على "تحليل النص".'
    : 'افتح جدولك بموقع الجامعة (خدمة الطالب)، انسخ نص الجدول كامل، والصقه هنا.';
}

function parsedToCourses(results){
  const nameStyle = {}; // اسم المادة الأساسي -> {color, emoji}
  const list = [];
  results.forEach(r=>{
    if(!nameStyle[r.baseName]){
      nameStyle[r.baseName] = {
        color: COLORS[Object.keys(nameStyle).length % COLORS.length],
        emoji: EMOJIS[Object.keys(nameStyle).length % EMOJIS.length]
      };
    }
    const style = nameStyle[r.baseName];
    list.push({
      id: uid(),
      name: r.name,
      day: r.day,
      room: r.room,
      start: r.start,
      end: r.end,
      dateStart: r.dateStart,
      dateEnd: r.dateEnd,
      instructor: r.instructor,
      color: style.color,
      emoji: r.isExam ? '📝' : style.emoji,
      isExam: r.isExam
    });
  });
  return list;
}

document.getElementById('importBtn').addEventListener('click', openImportModal);
document.getElementById('importChoiceCancelBtn').addEventListener('click', closeImportModal);
document.getElementById('chooseTextBtn').addEventListener('click', ()=> showInputStep('text'));
document.getElementById('chooseImageBtn').addEventListener('click', ()=> showInputStep('image'));

document.getElementById('importCancelBtn').addEventListener('click', ()=>{
  document.getElementById('importStepChoice').style.display = 'block';
  document.getElementById('importStepInput').style.display = 'none';
});
document.getElementById('importBackBtn').addEventListener('click', ()=>{
  document.getElementById('importStepInput').style.display = 'block';
  document.getElementById('importStepPreview').style.display = 'none';
});

document.getElementById('ocrRunBtn').addEventListener('click', async ()=>{
  const fileInput = document.getElementById('importImageInput');
  const ocrMsg = document.getElementById('ocrMsg');
  const btn = document.getElementById('ocrRunBtn');
  ocrMsg.classList.remove('show');

  if(!fileInput.files || !fileInput.files[0]){
    ocrMsg.textContent = 'اختر صورة أولاً';
    ocrMsg.classList.add('show');
    return;
  }
  if(typeof Tesseract === 'undefined'){
    ocrMsg.textContent = 'تعذر تحميل أداة قراءة الصور. تأكد من اتصالك بالإنترنت وحاول مرة ثانية.';
    ocrMsg.classList.add('show');
    return;
  }

  const original = btn.textContent;
  btn.disabled = true;

  try{
    const { data } = await Tesseract.recognize(fileInput.files[0], 'ara+eng', {
      logger: (m)=>{
        if(m.status && m.progress!==undefined){
          const pct = Math.round(m.progress*100);
          btn.textContent = 'جاري القراءة... '+pct+'%';
        }
      }
    });
    document.getElementById('importTextarea').value = data.text || '';
    if(!data.text || !data.text.trim()){
      ocrMsg.textContent = 'ما قدرنا نقرأ نص واضح من الصورة. جرّب صورة أوضح، أو الصق النص يدوياً.';
      ocrMsg.classList.add('show');
    } else {
      const detected = runParseAndPreview();
      if(!detected){
        ocrMsg.textContent = 'تم استخراج النص لكن ما لقينا محاضرات واضحة فيه تلقائياً. راجع النص وصحّح أي خطأ ثم اضغط "تحليل النص".';
        ocrMsg.classList.add('show');
      }
    }
  }catch(err){
    console.error('OCR error', err);
    ocrMsg.textContent = 'حصل خطأ أثناء قراءة الصورة. جرّب مرة ثانية أو استخدم استيراد النص مباشرة.';
    ocrMsg.classList.add('show');
  }finally{
    btn.disabled = false;
    btn.textContent = original;
  }
});

function runParseAndPreview(){
  const msg = document.getElementById('importMsg');
  msg.classList.remove('show');
  const raw = document.getElementById('importTextarea').value;

  if(!raw.trim()){
    msg.textContent = 'الصق نص الجدول أولاً';
    msg.classList.add('show');
    return false;
  }

  const { results, skippedDay } = parseScheduleTextSmart(raw);
  importParsedResults = results;

  if(results.length===0){
    msg.textContent = 'ما قدرت ألقى أي محاضرات بهذا النص. تأكد إنك نسخت نص الجدول كامل من صفحة خدمة الطالب، أو راجع النص المستخرج من الصورة وصحّح أي خطأ واضح.';
    msg.classList.add('show');
    return false;
  }

  const lecturesCount = results.filter(r=>!r.isExam).length;
  const examsCount = results.filter(r=>r.isExam).length;
  const uniqueCourses = new Set(results.map(r=>r.baseName)).size;

  let summary = `تم العثور على <b>${uniqueCourses}</b> مادة بإجمالي <b>${results.length}</b> جلسة `
    + `(${lecturesCount} محاضرة، ${examsCount} اختبار).`;
  if(skippedDay>0){
    summary += `<br><span style="color:var(--burgundy);">تم تجاهل ${skippedDay} جلسة بيوم غير مدعوم بالجدول (الجمعة/السبت).</span>`;
  }
  if(importMode==='image'){
    summary += `<br><span style="color:var(--sage);">مستخرجة من صورة — راجع الأسماء والقاعات بعد الإضافة للتأكد من دقتها.</span>`;
  }
  summary += '<br><br>اختر: تضيفها لجدولك الحالي، أو تستبدل الجدول بالكامل بها؟';

  document.getElementById('importSummary').innerHTML = summary;
  document.getElementById('importStepInput').style.display = 'none';
  document.getElementById('importStepPreview').style.display = 'block';
  return true;
}

document.getElementById('importParseBtn').addEventListener('click', runParseAndPreview);

async function commitImport(replace){
  const newCourses = parsedToCourses(importParsedResults);
  if(replace){
    courses = newCourses;
  } else {
    courses = courses.concat(newCourses);
  }
  await saveCourses();
  closeImportModal();
  render();
}

document.getElementById('importAppendBtn').addEventListener('click', ()=> commitImport(false));
document.getElementById('importReplaceBtn').addEventListener('click', async ()=>{
  const ok = await customConfirm('سيتم حذف جدولك الحالي بالكامل واستبداله بالمواد المستوردة. متابعة؟');
  if(!ok) return;
  commitImport(true);
});

document.getElementById('importOverlay').addEventListener('click', (e)=>{
  if(e.target.id==='importOverlay') closeImportModal();
});

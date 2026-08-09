/*
  تصدير الجدول
  ------------------------------------------
  - exportJPG(): يحوّل الجدول (الشبكة الأسبوعية) لصورة JPG وينزّلها
  - exportPDF(): ينشئ ملف PDF من صفحتين فأكثر:
      صفحة 1: صورة الجدول الأسبوعي كامل
      الصفحات التالية: تفاصيل كل محاضرة (بطاقة مستقلة لكل مادة)
    مع روابط داخلية حقيقية: الضغط على أي محاضرة بالجدول (داخل قارئ
    PDF يدعم الروابط الداخلية مثل Adobe Acrobat أو متصفح Chrome)
    ينقلك مباشرة لمكان تفاصيلها.

  ملاحظة تقنية: النصوص العربية تُرسم عبر تحويل عناصر HTML الفعلية
  لصور (html2canvas) بدل رسم نص مباشر داخل PDF، لأن مكتبات PDF
  الخفيفة (مثل pdf-lib) لا تدعم تشكيل الحروف العربية المتصلة بشكل
  صحيح عند رسم النص مباشرة.
*/

const PDF_PAGE_W = 595;   // عرض صفحة تفاصيل A4 (نقطة)
const PDF_PAGE_H = 842;   // ارتفاع صفحة تفاصيل A4 (نقطة)
const GRID_PAGE_MAX_W = 842; // أقصى عرض لصفحة الجدول (أفقي)

function todayStamp(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}

async function rasterize(el, scale){
  return await html2canvas(el, {
    scale: scale || 2,
    backgroundColor: '#EDE6D6',
    useCORS: true,
    logging: false,
    width: el.scrollWidth,
    height: el.scrollHeight,
    windowWidth: el.scrollWidth
  });
}

function canvasToBlob(canvas, type, quality){
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/* ===================== تصدير JPG ===================== */
async function exportJPG(){
  const btn = document.getElementById('downloadJpgBtn');
  const original = btn.textContent;
  btn.textContent = 'جاري التجهيز...';
  btn.disabled = true;
  try{
    const board = document.querySelector('.board');
    const canvas = await rasterize(board, 2);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'جدولي-'+todayStamp()+'.jpg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }catch(e){
    console.error('تعذر تصدير الصورة', e);
    await customConfirm('حصل خطأ أثناء إنشاء الصورة. حاول مرة ثانية.');
  }finally{
    btn.textContent = original;
    btn.disabled = false;
  }
}

/* ============== بناء قائمة تفاصيل مخفية للطباعة ============== */
function buildDetailsContainer(){
  const container = document.createElement('div');
  container.id = 'exportDetailsContainer';
  container.style.position = 'fixed';
  container.style.top = '-99999px';
  container.style.left = '-99999px';
  container.style.width = '760px';
  container.style.background = '#F6F1E4';
  container.style.padding = '28px';
  container.style.fontFamily = "'IBM Plex Sans Arabic', sans-serif";
  container.style.direction = 'rtl';
  container.dir = 'rtl';

  const title = document.createElement('h2');
  title.textContent = 'تفاصيل المحاضرات';
  title.style.cssText = 'color:#14213D;font-size:1.4rem;margin:0 0 18px;border-bottom:2px solid #C9A227;padding-bottom:10px;';
  container.appendChild(title);

  const sorted = [...courses].filter(c=>!c.isExam).sort((a,b)=> DAYS.indexOf(a.day)-DAYS.indexOf(b.day) || toMinutes(a.start)-toMinutes(b.start));

  const entries = [];
  sorted.forEach(c=>{
    const card = document.createElement('div');
    card.dataset.courseId = c.id;
    card.style.cssText = 'background:#fff;border-radius:10px;padding:16px 18px;margin-bottom:14px;'
      +'border-right:6px solid '+c.color+';box-shadow:0 2px 6px rgba(0,0,0,0.08);';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-size:1.05rem;font-weight:700;color:#14213D;margin-bottom:6px;';
    nameEl.textContent = (c.emoji? c.emoji+' ' : '') + c.name;
    card.appendChild(nameEl);

    const rows = [
      ['اليوم', c.day],
      ['الوقت', formatTimeDisplay(c.start)+' - '+formatTimeDisplay(c.end)],
    ];
    if(c.room) rows.push(['القاعة', c.room]);
    if(c.instructor) rows.push(['الأستاذ', c.instructor]);
    const dateRange = formatDateRange(c);
    if(dateRange) rows.push(['الفترة', dateRange.replace(/^ • /,'')]);

    rows.forEach(([label,val])=>{
      const rowEl = document.createElement('div');
      rowEl.style.cssText = 'font-size:.85rem;color:#5C6B73;margin-top:3px;';
      rowEl.textContent = label+': '+val;
      card.appendChild(rowEl);
    });

    container.appendChild(card);
    entries.push({ id: c.id, el: card });
  });

  document.body.appendChild(container);
  return { container, entries };
}

/* ===================== تصدير PDF ===================== */
async function exportPDF(){
  const btn = document.getElementById('downloadPdfBtn');
  const original = btn.textContent;
  btn.textContent = 'جاري التجهيز...';
  btn.disabled = true;

  let detailsData = null;
  try{
    if(courses.length===0){
      await customConfirm('أضف محاضرة واحدة على الأقل قبل التصدير.');
      return;
    }

    const board = document.querySelector('.board');
    const gridCanvas = await rasterize(board, 2);

    detailsData = buildDetailsContainer();
    const detailsCanvas = await rasterize(detailsData.container, 2);

    // إحداثيات كل محاضرة داخل صورة الجدول (نسبة لعنصر .board)
    const boardRect = board.getBoundingClientRect();
    const gridScaleX = gridCanvas.width / board.scrollWidth;
    const gridScaleY = gridCanvas.height / board.scrollHeight;
    const cardPositions = {};
    document.querySelectorAll('.course-card').forEach(card=>{
      const r = card.getBoundingClientRect();
      cardPositions[card.dataset.courseId] = {
        x: (r.left - boardRect.left) * gridScaleX,
        y: (r.top - boardRect.top) * gridScaleY,
        w: r.width * gridScaleX,
        h: r.height * gridScaleY
      };
    });

    // إحداثيات كل بطاقة تفاصيل داخل صورة التفاصيل (نسبة لحاوية التفاصيل)
    const detailsRect = detailsData.container.getBoundingClientRect();
    const detailScale = detailsCanvas.width / detailsData.container.scrollWidth;
    const detailPositions = {};
    detailsData.entries.forEach(entry=>{
      const r = entry.el.getBoundingClientRect();
      detailPositions[entry.id] = (r.top - detailsRect.top) * detailScale;
    });

    const { PDFDocument, PDFName, PDFNumber, PDFArray } = PDFLib;
    const pdfDoc = await PDFDocument.create();

    // ---------- صفحة الجدول ----------
    const gridAspect = gridCanvas.height / gridCanvas.width;
    const gridPageW = GRID_PAGE_MAX_W;
    const gridPageH = gridPageW * gridAspect;
    const gridPage = pdfDoc.addPage([gridPageW, gridPageH]);
    const gridJpgBlob = await canvasToBlob(gridCanvas, 'image/jpeg', 0.92);
    const gridImg = await pdfDoc.embedJpg(await gridJpgBlob.arrayBuffer());
    gridPage.drawImage(gridImg, { x:0, y:0, width: gridPageW, height: gridPageH });

    // ---------- صفحات التفاصيل (مقسّمة على شكل صفحات A4) ----------
    const pxPerPt = detailsCanvas.width / PDF_PAGE_W;
    const sliceHeightPx = Math.round(PDF_PAGE_H * pxPerPt);
    const totalSlices = Math.max(1, Math.ceil(detailsCanvas.height / sliceHeightPx));

    const detailPageRefs = [];
    for(let i=0;i<totalSlices;i++){
      const sliceCanvas = document.createElement('canvas');
      const thisSliceH = Math.min(sliceHeightPx, detailsCanvas.height - i*sliceHeightPx);
      sliceCanvas.width = detailsCanvas.width;
      sliceCanvas.height = thisSliceH;
      const ctx = sliceCanvas.getContext('2d');
      ctx.fillStyle = '#F6F1E4';
      ctx.fillRect(0,0,sliceCanvas.width, sliceCanvas.height);
      ctx.drawImage(detailsCanvas, 0, i*sliceHeightPx, detailsCanvas.width, thisSliceH, 0, 0, detailsCanvas.width, thisSliceH);

      const sliceBlob = await canvasToBlob(sliceCanvas, 'image/jpeg', 0.92);
      const sliceImg = await pdfDoc.embedJpg(await sliceBlob.arrayBuffer());
      const dPage = pdfDoc.addPage([PDF_PAGE_W, PDF_PAGE_H]);
      const drawH = thisSliceH / pxPerPt;
      dPage.drawImage(sliceImg, { x:0, y: PDF_PAGE_H - drawH, width: PDF_PAGE_W, height: drawH });
      detailPageRefs.push(dPage);
    }

    // ---------- روابط داخلية: من كل محاضرة بالجدول إلى تفاصيلها ----------
    Object.keys(cardPositions).forEach(courseId=>{
      const pos = cardPositions[courseId];
      const detailTopPx = detailPositions[courseId];
      if(detailTopPx === undefined) return;

      const pageIndex = Math.min(totalSlices-1, Math.floor(detailTopPx / sliceHeightPx));
      const localPx = detailTopPx - (pageIndex*sliceHeightPx);
      const localPt = localPx / pxPerPt;
      const destY = Math.max(0, Math.min(PDF_PAGE_H, PDF_PAGE_H - localPt + 24));
      const targetPage = detailPageRefs[pageIndex];

      // Rect بنظام إحداثيات PDF (الأصل أسفل يسار)
      const rectX1 = pos.x / gridScaleX * (gridPageW / board.scrollWidth);
      const rectX2 = (pos.x+pos.w) / gridScaleX * (gridPageW / board.scrollWidth);
      const rectY2 = gridPageH - (pos.y / gridScaleY) * (gridPageH / board.scrollHeight);
      const rectY1 = gridPageH - ((pos.y+pos.h) / gridScaleY) * (gridPageH / board.scrollHeight);

      try{
        const linkDict = pdfDoc.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [rectX1, rectY1, rectX2, rectY2],
          Border: [0,0,0],
          Dest: [targetPage.ref, PDFName.of('XYZ'), 0, destY, 0]
        });
        const linkRef = pdfDoc.context.register(linkDict);
        const existing = gridPage.node.Annots();
        if(existing){
          existing.push(linkRef);
        }else{
          gridPage.node.set(PDFName.of('Annots'), pdfDoc.context.obj([linkRef]));
        }
      }catch(err){
        console.warn('تعذر إنشاء رابط لمحاضرة', courseId, err);
      }
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'جدولي-'+todayStamp()+'.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

  }catch(e){
    console.error('تعذر تصدير PDF', e);
    await customConfirm('حصل خطأ أثناء إنشاء ملف PDF. حاول مرة ثانية.');
  }finally{
    if(detailsData && detailsData.container && detailsData.container.parentNode){
      detailsData.container.parentNode.removeChild(detailsData.container);
    }
    btn.textContent = original;
    btn.disabled = false;
  }
}

document.getElementById('downloadJpgBtn').addEventListener('click', ()=>{
  closeDownloadMenu();
  exportJPG();
});
document.getElementById('downloadPdfBtn').addEventListener('click', ()=>{
  closeDownloadMenu();
  exportPDF();
});

function closeDownloadMenu(){
  document.getElementById('downloadMenu').classList.remove('show');
  document.getElementById('downloadMenuBtn').classList.remove('open');
}

const downloadMenuBtn = document.getElementById('downloadMenuBtn');
const downloadMenu = document.getElementById('downloadMenu');

downloadMenuBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  const isOpen = downloadMenu.classList.toggle('show');
  downloadMenuBtn.classList.toggle('open', isOpen);
});

document.addEventListener('click', (e)=>{
  if(!downloadMenu.contains(e.target) && e.target!==downloadMenuBtn){
    closeDownloadMenu();
  }
});

document.addEventListener('keydown', (e)=>{
  if(e.key==='Escape') closeDownloadMenu();
});

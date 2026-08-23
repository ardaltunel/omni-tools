(function initPdfToolbox(root) {
    "use strict";
    const panel = document.getElementById("pdf-toolbox"); if (!panel) return;
    const el = {}; ["pdf-toolbox-file-input","pdf-toolbox-drop-zone","pdf-toolbox-browse","pdf-toolbox-status","pdf-toolbox-accepted-types","pdf-toolbox-upload-title","pdf-toolbox-upload-help","pdf-toolbox-file-list","pdf-toolbox-empty-options","pdf-toolbox-options","pdf-toolbox-result-state","pdf-toolbox-split-ranges","pdf-toolbox-page-order","pdf-toolbox-delete-pages","pdf-toolbox-rotate-pages","pdf-toolbox-rotation","pdf-toolbox-add-text","pdf-toolbox-text","pdf-toolbox-text-pages","pdf-toolbox-text-position","pdf-toolbox-text-size","pdf-toolbox-text-color","pdf-toolbox-add-watermark","pdf-toolbox-watermark-text","pdf-toolbox-watermark-pages","pdf-toolbox-watermark-size","pdf-toolbox-watermark-opacity","pdf-toolbox-watermark-angle","pdf-toolbox-watermark-color","pdf-toolbox-add-signature","pdf-toolbox-signature-file","pdf-toolbox-signature-pages","pdf-toolbox-signature-position","pdf-toolbox-signature-width","pdf-toolbox-signature-opacity","pdf-toolbox-process","pdf-toolbox-live"].forEach((id)=>{el[id]=document.getElementById(id);});
    const modes = ["merge","split","organize","annotate","images"]; const state={mode:"merge",files:[],nextId:1};
    const unicodeFontUrl="https://pdf-lib.js.org/assets/ubuntu/Ubuntu-R.ttf";
    let unicodeFontBytesPromise=null;
    panel.querySelectorAll("[data-pdf-mode]").forEach((tab)=>tab.addEventListener("click",()=>setMode(tab.dataset.pdfMode)));
    el["pdf-toolbox-browse"].addEventListener("click",(event)=>{event.stopPropagation();el["pdf-toolbox-file-input"].click();});el["pdf-toolbox-file-input"].addEventListener("change",()=>addFiles(el["pdf-toolbox-file-input"].files));el["pdf-toolbox-drop-zone"].addEventListener("click",()=>el["pdf-toolbox-file-input"].click());el["pdf-toolbox-drop-zone"].addEventListener("keydown",(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();el["pdf-toolbox-file-input"].click();}});["dragenter","dragover"].forEach((name)=>el["pdf-toolbox-drop-zone"].addEventListener(name,(event)=>{event.preventDefault();el["pdf-toolbox-drop-zone"].classList.add("is-dragging");}));["dragleave","drop"].forEach((name)=>el["pdf-toolbox-drop-zone"].addEventListener(name,(event)=>{event.preventDefault();el["pdf-toolbox-drop-zone"].classList.remove("is-dragging");}));el["pdf-toolbox-drop-zone"].addEventListener("drop",(event)=>addFiles(event.dataTransfer?.files));el["pdf-toolbox-file-list"].addEventListener("click",handleFileAction);el["pdf-toolbox-process"].addEventListener("click",process);
    initializeAnnotationOptions();
    function initializeAnnotationOptions(){
        const features=[
            {toggle:el["pdf-toolbox-add-text"],trigger:el["pdf-toolbox-text"],event:"input",hasValue:()=>Boolean(el["pdf-toolbox-text"].value.trim())},
            {toggle:el["pdf-toolbox-add-watermark"],trigger:el["pdf-toolbox-watermark-text"],event:"input",hasValue:()=>Boolean(el["pdf-toolbox-watermark-text"].value.trim())},
            {toggle:el["pdf-toolbox-add-signature"],trigger:el["pdf-toolbox-signature-file"],event:"change",hasValue:()=>Boolean(el["pdf-toolbox-signature-file"].files?.length)},
        ];
        features.forEach(({toggle,trigger,event,hasValue})=>{
            const sync=()=>toggle.closest(".pdf-toolbox-annotation-group")?.classList.toggle("is-enabled",toggle.checked);
            toggle.addEventListener("change",sync);
            trigger.addEventListener(event,()=>{if(hasValue())toggle.checked=true;sync();});
            sync();
        });
    }
    function setMode(mode){if(!modes.includes(mode))return;state.mode=mode;state.files=[];el["pdf-toolbox-file-input"].value="";panel.querySelectorAll("[data-pdf-mode]").forEach((tab)=>{const active=tab.dataset.pdfMode===mode;tab.classList.toggle("is-active",active);tab.setAttribute("aria-selected",String(active));});modes.forEach((name)=>document.getElementById(`pdf-toolbox-mode-${name}`).hidden=name!==mode);const isImages=mode==="images";const allowsMultiple=mode==="merge"||isImages;el["pdf-toolbox-file-input"].multiple=allowsMultiple;el["pdf-toolbox-file-input"].accept=isImages?"image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp":"application/pdf,.pdf";el["pdf-toolbox-accepted-types"].textContent=isImages?"PNG · JPG · JPEG · WEBP":allowsMultiple?"PDF · Birden çok dosya seçebilirsiniz":"PDF · Tek dosya seçin";el["pdf-toolbox-upload-title"].textContent=isImages?"Görsellerinizi buraya sürükleyin":"PDF dosyanızı buraya sürükleyin";el["pdf-toolbox-upload-help"].textContent=isImages?"veya cihazınızdan görsel seçin":"veya cihazınızdan dosya seçin";renderFiles();setStatus("Dosyalarınız yalnızca bu cihazda işlenir.");setResult("Hazır");announce(`${modeLabel()} modu seçildi.`);}
    function addFiles(fileList){const incoming=Array.from(fileList||[]);const isImages=state.mode==="images";const allowed=incoming.filter((file)=>isImages?isImage(file):isPdf(file));if(!allowed.length)return showError(isImages?"PNG, JPG, JPEG veya WEBP görsel seçin.":"Geçerli bir PDF dosyası seçin.");const allowsMultiple=state.mode==="merge"||isImages;const selected=allowsMultiple?allowed:[allowed[0]];const entries=selected.map((file)=>({id:state.nextId++,file,pages:null}));if(allowsMultiple)state.files.push(...entries);else state.files=entries;renderFiles();updateOptions();setStatus(`${selected.length} dosya eklendi.`,"success");if(!isImages)loadPageCounts(selected);}
    function isPdf(file){return file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf");}function isImage(file){const ext=file.name.split(".").pop()?.toLowerCase();return ["image/jpeg","image/png","image/webp"].includes(file.type)||["jpg","jpeg","png","webp"].includes(ext);}
    async function loadPageCounts(files){if(!root.PDFLib)return;for(const file of files){try{const pdf=await root.PDFLib.PDFDocument.load(await file.arrayBuffer());const item=state.files.find((entry)=>entry.file===file);if(item){item.pages=pdf.getPageCount();renderFiles();}}catch{}}}
    function renderFiles(){el["pdf-toolbox-file-list"].replaceChildren(...state.files.map((entry,index)=>{const item=document.createElement("li");item.className="pdf-toolbox-file";item.dataset.fileId=entry.id;const copy=document.createElement("div");copy.className="pdf-toolbox-file-copy";const name=document.createElement("strong");name.className="pdf-toolbox-file-name";name.textContent=entry.file.name;const meta=document.createElement("span");meta.className="pdf-toolbox-file-meta";meta.textContent=`${formatBytes(entry.file.size)}${entry.pages?` · ${entry.pages} sayfa`:""}`;copy.append(name,meta);const actions=document.createElement("div");actions.className="pdf-toolbox-file-actions";[["up","↑","Yukarı taşı"],["down","↓","Aşağı taşı"],["remove","×","Dosyayı kaldır"]].forEach(([action,label,title])=>{const button=document.createElement("button");button.type="button";button.dataset.action=action;button.title=title;button.setAttribute("aria-label",title);button.disabled=(action==="up"&&index===0)||(action==="down"&&index===state.files.length-1);button.textContent=label;actions.append(button);});item.append(copy,actions);return item;}));const has=state.files.length>0;el["pdf-toolbox-empty-options"].hidden=has;el["pdf-toolbox-options"].hidden=!has;}
    function handleFileAction(event){const button=event.target.closest("button[data-action]");if(!button)return;const item=button.closest("[data-file-id]");const index=state.files.findIndex((entry)=>entry.id===Number(item?.dataset.fileId));if(index<0)return;const action=button.dataset.action;if(action==="remove")state.files.splice(index,1);if(action==="up"&&index>0)[state.files[index-1],state.files[index]]=[state.files[index],state.files[index-1]];if(action==="down"&&index<state.files.length-1)[state.files[index+1],state.files[index]]=[state.files[index],state.files[index+1]];renderFiles();updateOptions();}
    function updateOptions(){if(state.mode==="organize"&&state.files[0]?.pages){el["pdf-toolbox-page-order"].placeholder=Array.from({length:state.files[0].pages},(_,index)=>index+1).join(", ");}if(state.mode==="split"&&state.files[0]?.pages){el["pdf-toolbox-split-ranges"].placeholder=`Örn: 1-3, 4-${state.files[0].pages}`;}}
    async function process(){if(!root.PDFLib)return showError("PDF motoru yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");if(!state.files.length)return showError("Önce en az bir dosya ekleyin.");try{setStatus("PDF hazırlanıyor…","processing");setResult("İşleniyor","processing");if(state.mode==="merge")await merge();else if(state.mode==="split")await split();else if(state.mode==="organize")await organize();else if(state.mode==="annotate")await annotate();else await imagesToPdf();setStatus("İndirme hazırlandı.","success");setResult("Tamamlandı","success");}catch(error){showError(error.message||"PDF işlenemedi.");}}
    async function merge(){const output=await root.PDFLib.PDFDocument.create();for(const entry of state.files){const source=await root.PDFLib.PDFDocument.load(await entry.file.arrayBuffer());const pages=await output.copyPages(source,source.getPageIndices());pages.forEach((page)=>output.addPage(page));}downloadPdf(await output.save(),"birlesmis-pdf.pdf");announce("Birleştirilmiş PDF indiriliyor.");}
    async function split(){if(state.files.length!==1)throw new Error("PDF bölmek için listede yalnızca bir dosya bırakın.");const source=await root.PDFLib.PDFDocument.load(await state.files[0].file.arrayBuffer());const groups=parseGroups(el["pdf-toolbox-split-ranges"].value,source.getPageCount());if(!groups.length)throw new Error("Bölmek için örneğin 1-3, 4-6 biçiminde sayfa aralıkları girin.");for(let index=0;index<groups.length;index+=1){const output=await root.PDFLib.PDFDocument.create();const pages=await output.copyPages(source,groups[index].map((page)=>page-1));pages.forEach((page)=>output.addPage(page));downloadPdf(await output.save(),`pdf-bolum-${index+1}.pdf`);}announce(`${groups.length} PDF bölümü indirilmeye hazırlandı.`);}
    async function organize(){if(state.files.length!==1)throw new Error("Sayfa düzenlemek için listede yalnızca bir PDF bırakın.");const source=await root.PDFLib.PDFDocument.load(await state.files[0].file.arrayBuffer());const total=source.getPageCount();const order=parsePages(el["pdf-toolbox-page-order"].value,total);const deleteSet=new Set(parsePages(el["pdf-toolbox-delete-pages"].value,total));const rotateSet=new Set(parsePages(el["pdf-toolbox-rotate-pages"].value,total));const pages=(order.length?order:Array.from({length:total},(_,index)=>index+1)).filter((page)=>!deleteSet.has(page));if(!pages.length)throw new Error("Tüm sayfalar silindi; çıktıda en az bir sayfa olmalı.");const output=await root.PDFLib.PDFDocument.create();const copies=await output.copyPages(source,pages.map((page)=>page-1));copies.forEach((page,index)=>{if(rotateSet.has(pages[index]))page.setRotation(root.PDFLib.degrees((page.getRotation().angle+Number(el["pdf-toolbox-rotation"].value))%360));output.addPage(page);});downloadPdf(await output.save(),"duzenlenmis-pdf.pdf");announce("Düzenlenmiş PDF indiriliyor.");}
    async function annotate(){
        if(state.files.length!==1)throw new Error("İçerik eklemek için tek bir PDF seçin.");
        const addText=el["pdf-toolbox-add-text"].checked;
        const addWatermark=el["pdf-toolbox-add-watermark"].checked;
        const addSignature=el["pdf-toolbox-add-signature"].checked;
        if(!addText&&!addWatermark&&!addSignature)throw new Error("Yalnızca uygulamak istediğiniz metin, filigran veya imza seçeneğini etkinleştirin.");
        const selectedOperations=[addText&&"Metin",addWatermark&&"Filigran",addSignature&&"İmza"].filter(Boolean);

        const document=await root.PDFLib.PDFDocument.load(await state.files[0].file.arrayBuffer());
        const pages=document.getPages();
        const total=pages.length;
        let font=null;

        if(addText||addWatermark)font=await loadAnnotationFont(document);

        if(addText){
            const text=el["pdf-toolbox-text"].value.trim();
            if(!text)throw new Error("Eklenecek metni yazın.");
            const size=readBoundedNumber("pdf-toolbox-text-size",8,72,"Metin boyutu");
            const color=hexToRgb(el["pdf-toolbox-text-color"].value);
            const targets=targetPages(el["pdf-toolbox-text-pages"].value,total,"all");
            targets.forEach((pageNumber)=>drawPositionedText(pages[pageNumber-1],text,font,size,color,el["pdf-toolbox-text-position"].value));
        }

        if(addWatermark){
            const text=el["pdf-toolbox-watermark-text"].value.trim();
            if(!text)throw new Error("Filigran metnini yazın.");
            const requestedSize=readBoundedNumber("pdf-toolbox-watermark-size",18,120,"Filigran boyutu");
            const opacity=readBoundedNumber("pdf-toolbox-watermark-opacity",5,80,"Filigran saydamlığı")/100;
            const angle=readBoundedNumber("pdf-toolbox-watermark-angle",-75,75,"Filigran açısı");
            const color=hexToRgb(el["pdf-toolbox-watermark-color"].value);
            const targets=targetPages(el["pdf-toolbox-watermark-pages"].value,total,"all");
            targets.forEach((pageNumber)=>drawWatermark(pages[pageNumber-1],text,font,requestedSize,color,opacity,angle));
        }

        if(addSignature){
            const file=el["pdf-toolbox-signature-file"].files?.[0];
            if(!file||!isImage(file))throw new Error("İmza için PNG, JPG, JPEG veya WEBP görsel seçin.");
            const image=await embedImage(document,file);
            const requestedWidth=readBoundedNumber("pdf-toolbox-signature-width",40,300,"İmza genişliği");
            const opacity=readBoundedNumber("pdf-toolbox-signature-opacity",10,100,"İmza saydamlığı")/100;
            const targets=targetPages(el["pdf-toolbox-signature-pages"].value,total,"last");
            targets.forEach((pageNumber)=>drawSignature(pages[pageNumber-1],image,requestedWidth,opacity,el["pdf-toolbox-signature-position"].value));
        }

        document.setModificationDate(new Date());
        downloadPdf(await document.save(),"isaretlenmis-pdf.pdf");
        announce(`${selectedOperations.join(", ")} işlemi uygulanan PDF indiriliyor.`);
    }
    async function loadAnnotationFont(document){
        if(!root.fontkit)throw new Error("Türkçe metin motoru yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
        document.registerFontkit(root.fontkit);
        if(!unicodeFontBytesPromise){
            unicodeFontBytesPromise=root.fetch(unicodeFontUrl).then((response)=>{if(!response.ok)throw new Error("Yazı tipi indirilemedi.");return response.arrayBuffer();});
        }
        try{return await document.embedFont(await unicodeFontBytesPromise,{subset:true});}
        catch(error){unicodeFontBytesPromise=null;throw new Error("Türkçe karakterleri destekleyen yazı tipi yüklenemedi.");}
    }
    function drawPositionedText(page,text,font,size,color,position){
        const margin=36;
        const maxWidth=Math.max(40,page.getWidth()-margin*2);
        const maxHeight=Math.max(40,page.getHeight()-margin*2);
        let lines=wrapText(text,font,size,maxWidth);
        let lineHeight=size*1.25;
        let blockHeight=size+(lines.length-1)*lineHeight;
        while(size>8&&blockHeight>maxHeight){size-=1;lines=wrapText(text,font,size,maxWidth);lineHeight=size*1.25;blockHeight=size+(lines.length-1)*lineHeight;}
        if(blockHeight>maxHeight)throw new Error("Metin seçilen sayfaya sığmayacak kadar uzun.");
        const blockWidth=Math.max(...lines.map((line)=>font.widthOfTextAtSize(line,size)));
        const point=placement(page,blockWidth,blockHeight,position,margin);
        lines.forEach((line,index)=>page.drawText(line,{x:point.x,y:point.y+blockHeight-size-index*lineHeight,size,font,color}));
    }
    function drawWatermark(page,text,font,requestedSize,color,opacity,angle){
        const maxWidth=Math.max(40,page.getWidth()*.82);
        let size=requestedSize;
        while(size>8&&font.widthOfTextAtSize(text,size)>maxWidth)size-=1;
        if(font.widthOfTextAtSize(text,size)>maxWidth)throw new Error("Filigran metni sayfaya sığmayacak kadar uzun.");
        const width=font.widthOfTextAtSize(text,size);
        const radians=angle*Math.PI/180;
        const centerX=width*Math.cos(radians)/2-size*Math.sin(radians)/2;
        const centerY=width*Math.sin(radians)/2+size*Math.cos(radians)/2;
        page.drawText(text,{x:page.getWidth()/2-centerX,y:page.getHeight()/2-centerY,size,font,color,opacity,rotate:root.PDFLib.degrees(angle)});
    }
    async function embedImage(document,file){
        const bytes=await file.arrayBuffer();
        if(file.type==="image/png"||file.name.toLowerCase().endsWith(".png"))return document.embedPng(bytes);
        if(file.type==="image/jpeg"||/\.jpe?g$/i.test(file.name))return document.embedJpg(bytes);
        return document.embedPng(await imageToPng(file));
    }
    function drawSignature(page,image,requestedWidth,opacity,position){
        const margin=36;
        const maxWidth=Math.max(20,page.getWidth()-margin*2);
        const maxHeight=Math.max(20,page.getHeight()-margin*2);
        let width=Math.min(requestedWidth,maxWidth);
        let height=width*(image.height/image.width);
        if(height>maxHeight){height=maxHeight;width=height*(image.width/image.height);}
        const point=placement(page,width,height,position,margin);
        page.drawImage(image,{x:point.x,y:point.y,width,height,opacity});
    }
    function placement(page,width,height,position,margin){
        const pageWidth=page.getWidth(),pageHeight=page.getHeight();
        const horizontal=position.includes("left")?"left":position.includes("right")?"right":"center";
        const vertical=position.includes("top")?"top":position.includes("bottom")?"bottom":"center";
        const x=horizontal==="left"?margin:horizontal==="right"?pageWidth-margin-width:(pageWidth-width)/2;
        const y=vertical==="bottom"?margin:vertical==="top"?pageHeight-margin-height:(pageHeight-height)/2;
        return{x:Math.max(0,x),y:Math.max(0,y)};
    }
    function wrapText(text,font,size,maxWidth){
        const paragraphs=text.split(/\r?\n/);
        const lines=[];
        paragraphs.forEach((paragraph)=>{
            const words=paragraph.split(/\s+/).filter(Boolean);
            if(!words.length){lines.push("");return;}
            let line="";
            words.forEach((word)=>{
                const pieces=splitLongWord(word,font,size,maxWidth);
                pieces.forEach((piece)=>{
                    const candidate=line?`${line} ${piece}`:piece;
                    if(line&&font.widthOfTextAtSize(candidate,size)>maxWidth){lines.push(line);line=piece;}else line=candidate;
                });
            });
            if(line)lines.push(line);
        });
        return lines.length?lines:[""];
    }
    function splitLongWord(word,font,size,maxWidth){
        if(font.widthOfTextAtSize(word,size)<=maxWidth)return[word];
        const pieces=[];let piece="";
        Array.from(word).forEach((character)=>{const candidate=piece+character;if(piece&&font.widthOfTextAtSize(candidate,size)>maxWidth){pieces.push(piece);piece=character;}else piece=candidate;});
        if(piece)pieces.push(piece);return pieces;
    }
    function targetPages(value,total,fallback){const parsed=parsePages(value,total);if(parsed.length)return[...new Set(parsed)];return fallback==="last"?[total]:Array.from({length:total},(_,index)=>index+1);}
    function readBoundedNumber(id,min,max,label){const value=Number(el[id].value);if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} ${min}-${max} arasında olmalı.`);return value;}
    function hexToRgb(value){const match=String(value).match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);if(!match)throw new Error("Geçerli bir renk seçin.");return root.PDFLib.rgb(parseInt(match[1],16)/255,parseInt(match[2],16)/255,parseInt(match[3],16)/255);}
    async function imagesToPdf(){const output=await root.PDFLib.PDFDocument.create();for(const entry of state.files){const bytes=await entry.file.arrayBuffer();let embedded;if(entry.file.type==="image/png"||entry.file.name.toLowerCase().endsWith(".png"))embedded=await output.embedPng(bytes);else if(entry.file.type==="image/jpeg"||/\.jpe?g$/i.test(entry.file.name))embedded=await output.embedJpg(bytes);else embedded=await output.embedPng(await imageToPng(entry.file));const page=output.addPage(root.PDFLib.PageSizes.A4);const margin=32;const scale=Math.min((page.getWidth()-margin*2)/embedded.width,(page.getHeight()-margin*2)/embedded.height);const width=embedded.width*scale,height=embedded.height*scale;page.drawImage(embedded,{x:(page.getWidth()-width)/2,y:(page.getHeight()-height)/2,width,height});}downloadPdf(await output.save(),"gorsellerden-pdf.pdf");announce("Görsellerden oluşturulan PDF indiriliyor.");}
    async function imageToPng(file){const url=URL.createObjectURL(file);try{const image=await new Promise((resolve,reject)=>{const element=new Image();element.onload=()=>resolve(element);element.onerror=reject;element.src=url;});const canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;canvas.getContext("2d").drawImage(image,0,0);const blob=await new Promise((resolve,reject)=>canvas.toBlob((value)=>value?resolve(value):reject(new Error("Görsel dönüştürülemedi.")),"image/png"));return blob.arrayBuffer();}finally{URL.revokeObjectURL(url);}}
    function parseGroups(value,total){return value.split(",").map((piece)=>parsePages(piece,total)).filter((group)=>group.length);}function parsePages(value,total){if(!value.trim())return[];const result=[];value.split(",").map((piece)=>piece.trim()).filter(Boolean).forEach((piece)=>{const match=piece.match(/^(\d+)(?:\s*-\s*(\d+))?$/);if(!match)throw new Error(`Geçersiz sayfa aralığı: ${piece}`);const start=Number(match[1]),end=Number(match[2]||match[1]);if(start<1||end<start||end>total)throw new Error(`Sayfa aralığı 1-${total} arasında olmalı.`);for(let page=start;page<=end;page+=1)result.push(page);});return result;}
    function downloadPdf(bytes,name){const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));const anchor=document.createElement("a");anchor.href=url;anchor.download=name;anchor.click();root.setTimeout(()=>URL.revokeObjectURL(url),2000);}
    function modeLabel(){return({merge:"Birleştir",split:"Böl",organize:"Düzenle",annotate:"Metin ve İmza",images:"Görsel → PDF"})[state.mode];}function setStatus(message,tone=""){const node=el["pdf-toolbox-status"];node.textContent=message;node.classList.toggle("is-success",tone==="success");node.classList.toggle("is-error",tone==="error");node.classList.toggle("is-processing",tone==="processing");}function setResult(message,tone=""){const node=el["pdf-toolbox-result-state"];node.textContent=message;node.classList.toggle("is-success",tone==="success");node.classList.toggle("is-error",tone==="error");node.classList.toggle("is-processing",tone==="processing");}function showError(message){setStatus(message,"error");setResult("Hata","error");announce(message);}function formatBytes(bytes){if(!bytes)return"0 B";const units=["B","KB","MB","GB"],index=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),3),value=bytes/(1024**index);return `${value.toLocaleString("tr-TR",{maximumFractionDigits:1})} ${units[index]}`;}function announce(message){el["pdf-toolbox-live"].textContent=message;}
}(window));

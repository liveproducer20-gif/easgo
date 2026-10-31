import html2canvas from 'html2canvas';

async function rasterizeIllustration(svg){
 const rect=svg.getBoundingClientRect(),clone=svg.cloneNode(true);
 clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
 clone.setAttribute('width',String(rect.width));clone.setAttribute('height',String(rect.height));
 // SVG styles supplied by the page are not inherited by a serialized image.
 // Freeze their computed values before decoding the illustration in isolation.
 const source=[svg,...svg.querySelectorAll('*')],target=[clone,...clone.querySelectorAll('*')];
 const properties=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','font-family','font-size','font-weight','text-anchor','stop-color','stop-opacity'];
 source.forEach((node,index)=>{const style=getComputedStyle(node);for(const property of properties)target[index].style.setProperty(property,style.getPropertyValue(property))});
 const image=new Image();
 image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(clone));
 try{await image.decode()}catch{throw Error('No se pudieron preparar las ilustraciones. Reinicie el servidor con npm start y recargue con Ctrl+F5 antes de volver a REPORTAR.');}
 const canvas=document.createElement('canvas');canvas.width=Math.ceil(rect.width*2);canvas.height=Math.ceil(rect.height*2);
 canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
 return {canvas,width:rect.width,height:rect.height};
}

// Captures only the institutional summary; navigation and charts stay outside.
export async function captureWeeklySummary(element){
 if(!element?.isConnected)throw Error('Actualice el consolidado antes de generar su imagen.');
 await document.fonts.ready;
 const daily=element.matches('.operativity');
 // Pre-render every SVG, including calendars and the EAS building. Never let
 // html2canvas silently omit an illustration it could not decode itself.
 const illustrations=await Promise.all([...element.querySelectorAll('svg')].map(rasterizeIllustration));
 const canvas=await html2canvas(element,{backgroundColor:'#ffffff',scale:2,logging:false,windowWidth:daily?Math.max(window.innerWidth,1280):window.innerWidth,
  onclone(doc,summary){
   // Pass decoded pixels directly to the renderer. Its image cache can skip
   // serialized SVG/data URLs even when the browser displays them correctly.
   const svgs=[...summary.querySelectorAll('svg')];
   if(svgs.length!==illustrations.length)throw Error('El resumen cambió durante la captura. Vuelva a REPORTAR.');
   svgs.forEach((svg,index)=>{
    const illustration=illustrations[index],bitmap=doc.createElement('canvas');
    bitmap.className=svg.getAttribute('class')||'';
    bitmap.width=illustration.canvas.width;bitmap.height=illustration.canvas.height;
    bitmap.style.width=illustration.width+'px';bitmap.style.height=illustration.height+'px';
    bitmap.getContext('2d').drawImage(illustration.canvas,0,0);
    svg.replaceWith(bitmap);
   });
   // html2canvas does not lay out CSS grid. Preserve the visible column layout
   // with flex in the isolated clone, leaving the live page untouched.
   const blocks=summary.querySelector('.weekly-operation-blocks');
   if(blocks){const stacked=window.innerWidth<=760;blocks.style.display='flex';blocks.style.flexDirection=stacked?'column':'row';for(const table of blocks.children){table.style.width=stacked?'100%':'calc(50% - 4px)';table.style.flex='none'}}
   if(daily){
    summary.querySelectorAll('button').forEach(button=>button.remove());
    const scroll=summary.querySelector('.operation-scroll');
    if(scroll){scroll.style.overflow='visible';scroll.style.height='auto';scroll.style.maxHeight='none';scroll.scrollLeft=0;scroll.scrollTop=0}
   }
   doc.querySelectorAll('dialog').forEach(dialog=>dialog.remove());
  }
 });
 return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('No se pudo crear la imagen PNG.')),'image/png'));
}

import PDFDocument from 'pdfkit';

const clean=value=>String(value??'—').replace(/[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff\u2013\u2014\u2018\u2019\u201c\u201d]/g,'?');
export function reportPDF(report){return new Promise((resolve,reject)=>{
 const doc=new PDFDocument({size:'A4',layout:'landscape',margin:34,bufferPages:true,info:{Title:report.titulo,Author:'EAS-GO',Subject:'Informe operativo · America/Guayaquil'}}),chunks=[];
 doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
 try{
  const color=report.estaciones.length===1?report.estaciones[0].color:'#0866E8';const rgb=color.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4),ink=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#062B50':'#FFFFFF';let y=0,page=0;const left=34,width=doc.page.width-68,bottom=doc.page.height-42;
  function pageHeader(){page++;doc.rect(0,0,doc.page.width,9).fill(color);doc.font('Helvetica-Bold').fontSize(10).fillColor('#062B50').text('EAS-GO  |  INFORMES OPERATIVOS',left,24,{width});doc.fontSize(17).text(clean(report.titulo),left,44,{width,height:42});doc.font('Helvetica').fontSize(9).fillColor('#47647F').text(clean(`${report.estaciones.length===1?report.estaciones[0].nombre:'Todas las estaciones autorizadas'}  ·  ${report.desde} al ${report.hasta}  ·  America/Guayaquil`),left,87,{width});y=112}
  function newPage(){doc.addPage();pageHeader()}
  function need(height){if(y+height>bottom)newPage()}
  pageHeader();
  doc.font('Helvetica').fontSize(8).fillColor('#47647F');const stamp=new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',dateStyle:'short',timeStyle:'short'}).format(new Date(report.generado_en));doc.text('Generado: '+stamp+' · Datos consultados directamente del sistema.',left,y,{width});y+=23;
  for(const note of report.notas){doc.font('Helvetica').fontSize(8);const h=doc.heightOfString(clean(note),{width});need(h+8);doc.fillColor('#47647F').text(clean(note),left,y,{width});y+=h+7}
  y+=10;
  function lines(value,w,font='Helvetica',size=8){doc.font(font).fontSize(size);const result=[];for(const paragraph of clean(value).split(/\r?\n/)){let current='';for(const word of paragraph.split(/\s+/)){if(doc.widthOfString((current?current+' ':'')+word)<=w){current+=(current?' ':'')+word;continue}if(current)result.push(current);current='';for(const char of word){if(doc.widthOfString(current+char)>w){result.push(current);current=''}current+=char}}result.push(current)}return result}
  for(const table of report.tablas){
   const cols=table.columnas,weight=key=>/detalle|observaciones|novedades/.test(key)?3:/conductor|jefe|radiooperador|actividad|ubicacion|estaciones/.test(key)?2:1.15,total=cols.reduce((n,c)=>n+weight(c.key),0),widths=cols.map(c=>width*weight(c.key)/total),font=8,lineHeight=12;
   function title(){need(70);doc.font('Helvetica-Bold').fontSize(12).fillColor('#062B50').text(clean(table.titulo),left,y,{width});y+=doc.heightOfString(clean(table.titulo),{width})+9;header()}
   const headingLines=cols.map((c,i)=>lines(c.label,widths[i]-10,'Helvetica-Bold',font));const headerHeight=Math.max(...headingLines.map(l=>l.length))*lineHeight+12;
   function header(){need(headerHeight+20);doc.rect(left,y,width,headerHeight).fill(color);let x=left;cols.forEach((c,i)=>{doc.font('Helvetica-Bold').fontSize(font).fillColor(ink).text(headingLines[i].join('\n'),x+5,y+6,{width:widths[i]-10,height:headerHeight-9,lineGap:2});x+=widths[i]});y+=headerHeight}
   title();
   if(!table.filas.length){need(30);doc.font('Helvetica').fontSize(9).fillColor('#637D96').text('Sin datos para el período y la estación seleccionados.',left+7,y+10,{width:width-14});y+=37;continue}
   for(const [index,row] of table.filas.entries()){
    const cells=cols.map((c,i)=>lines(row[c.key],widths[i]-10,'Helvetica',font));let offset=0,max=Math.max(...cells.map(c=>c.length));
    while(offset<max){if(bottom-y<lineHeight+12){newPage();header()}
     const n=Math.min(max-offset,Math.max(1,Math.floor((bottom-y-12)/lineHeight))),height=n*lineHeight+12;
     doc.rect(left,y,width,height).fill(index%2?'#F1F6FB':'#FFFFFF');let x=left;
     cells.forEach((text,i)=>{doc.font('Helvetica').fontSize(font).fillColor('#193B59').text(text.slice(offset,offset+n).join('\n'),x+5,y+6,{width:widths[i]-10,height:height-8,lineGap:2});x+=widths[i]});doc.moveTo(left,y+height).lineTo(left+width,y+height).lineWidth(.4).strokeColor('#D5E2ED').stroke();y+=height;offset+=n;
    }
   }
   y+=23;
  }
  for(const chart of report.graficos){
   const labels=chart.etiquetas,series=chart.series;if(!labels.length)continue;
   const chartHeight=labels.length*28+72;need(Math.min(chartHeight,340));doc.font('Helvetica-Bold').fontSize(12).fillColor('#062B50').text(clean(chart.titulo),left,y,{width});y+=26;
   const max=Math.max(1,...series.flatMap(s=>s.valores));
   for(let i=0;i<labels.length;i++){
    need(30+series.length*3);doc.font('Helvetica').fontSize(8).fillColor('#193B59').text(clean(labels[i]),left,y,{width:220,height:26});
    series.forEach((s,index)=>{const yy=y+index*10,barWidth=(width-280)*Number(s.valores[i]||0)/max;doc.rect(left+228,yy,Math.max(0,barWidth),7).fill(s.color||color);doc.font('Helvetica').fontSize(8).fillColor('#193B59').text(String(s.valores[i]||0),left+235+barWidth,yy-1,{width:42,height:12})});y+=Math.max(28,series.length*10+5);
   }
   need(20);doc.font('Helvetica').fontSize(8).fillColor('#47647F').text(series.map(s=>s.nombre).join(' / '),left,y,{width});y+=35;
  }
  const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(range.start+i);const margin=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.font('Helvetica').fontSize(8).fillColor('#637D96').text(`EAS-GO · ${i+1} / ${range.count}`,left,doc.page.height-27,{width,height:12,align:'right',lineBreak:false});doc.page.margins.bottom=margin}
  doc.end();
 }catch(error){doc.destroy(error);reject(error)}
});}

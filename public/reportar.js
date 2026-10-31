export async function copyReportImage(blob,clipboard=globalThis.navigator?.clipboard,Item=globalThis.ClipboardItem){
 if(!clipboard?.write||typeof Item!=='function')throw Error('Este navegador no permite copiar imágenes. Use Descargar PNG.');
 await clipboard.write([new Item({'image/png':blob})]);
}

export async function showReportDialog({type,fecha,stationId,jornadaId='',api,esc,options,me,captureImage}){
 const dialog=document.createElement('dialog');dialog.className='report-dialog';dialog.setAttribute('aria-labelledby','report-title');
 dialog.innerHTML='<div class="toolbar"><h2 id="report-title">Vista previa · REPORTAR</h2><button type="button" data-close class="secondary">Cerrar</button></div><div data-content><p role="status">Preparando reporte…</p></div>';
 document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 const content=dialog.querySelector('[data-content]');
 // Start immediately on REPORTAR. A failed image must not block the text report.
 let imageUrl=null;
 const captured=captureImage?Promise.resolve().then(captureImage).then(blob=>({blob}),error=>({error})):null;
 dialog.addEventListener('close',()=>{if(imageUrl)URL.revokeObjectURL(imageUrl)},{once:true});
 try{
  const sid=Number(stationId);if(!sid)throw Error('Seleccione una estación específica para reportar.');
  const params=new URLSearchParams({fecha,estacion_id:String(sid)}),base=`reportes/${type}/`;if(jornadaId)params.set('jornada_id',jornadaId);
  const [allOperators,news,jornadas]=await Promise.all([api('radiooperadores'),api(base+'novedades?'+params),api('jornadas')]);
  if(!dialog.isConnected)return;
  const operators=allOperators.filter(o=>(o.estaciones||[o.estacion_id]).includes(sid));let notesVersion=news.version,dirty=false,current=null,request=0;
  content.innerHTML=`<p>Período: ${esc(news.inicio)}${type==='semanal'?' al '+esc(news.fin):''} · America/Guayaquil${jornadaId?' · '+esc(jornadaId==='sin'?'SIN JORNADA':jornadas.find(j=>j.id===Number(jornadaId))?.nombre||''):''}</p><label>Radioperador del reporte<select name="operador" required><option value="">Seleccione radioperador</option>${options(operators,me.radiooperador?.id)}</select></label>${!operators.length?'<p class="report-error">No hay radioperadores habilitados en esta estación. Revise el catálogo de Radiooperadores.</p>':''}<label>NOVEDADES<textarea name="novedades" rows="4" maxlength="10000" placeholder="Escriba una novedad por línea"></textarea></label><small data-audit></small><button type="button" data-save>Guardar novedades y actualizar vista previa</button><div data-warnings role="status"></div><label>Cartilla para WhatsApp<textarea data-preview rows="22" readonly spellcheck="false"></textarea></label><div class="toolbar"><button type="button" data-copy disabled>Copiar reporte</button><span data-status role="status"></span></div>`;
  const operator=content.querySelector('[name=operador]'),notes=content.querySelector('[name=novedades]'),preview=content.querySelector('[data-preview]'),copy=content.querySelector('[data-copy]'),status=content.querySelector('[data-status]'),warnings=content.querySelector('[data-warnings]'),save=content.querySelector('[data-save]');notes.value=news.texto;
  if(captured){
   const imageSection=document.createElement('section');imageSection.className='report-image-section';
   imageSection.innerHTML='<h3>Imagen del consolidado '+(type==='diario'?'diario':'semanal')+'</h3><p>Captura del resumen al abrir REPORTAR. Puede pegarla en WhatsApp después de copiarla.</p><p data-image-status role="status">Generando captura…</p><img data-image-preview alt="Captura de la tabla del consolidado con estación, actividades y totales" hidden><div class="report-image-actions"><button type="button" data-copy-image disabled>Copiar imagen</button><a data-download-image hidden>Descargar PNG</a></div>';
   content.prepend(imageSection);
   captured.then(({blob,error})=>{
    if(!dialog.isConnected)return;
    const imageStatus=imageSection.querySelector('[data-image-status]'),button=imageSection.querySelector('[data-copy-image]');
    if(error){imageStatus.textContent='No se pudo capturar el resumen. Cierre y vuelva a abrir REPORTAR para reintentar. '+error.message;return}
    imageUrl=URL.createObjectURL(blob);const image=imageSection.querySelector('img');image.src=imageUrl;image.hidden=false;
    const download=imageSection.querySelector('a');download.href=imageUrl;download.download=`eas-go-consolidado-${type}-${sid}-${news.inicio}.png`;download.hidden=false;
    imageStatus.textContent='Imagen lista para copiar.';button.disabled=false;
    button.onclick=async()=>{
     try{
      button.disabled=true;await copyReportImage(blob);
      imageStatus.textContent='Imagen copiada. Péguela con Ctrl+V en WhatsApp.';
     }catch(error){imageStatus.textContent=error.name==='NotAllowedError'?'El navegador bloqueó el portapapeles. Permita el acceso o use Descargar PNG.':error.message}
     finally{button.disabled=false}
    };
   });
  }
  function audit(n){content.querySelector('[data-audit]').textContent=n.modificado_por_nombre?`Última modificación: ${n.modificado_por_nombre} · ${new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',dateStyle:'short',timeStyle:'short'}).format(new Date(n.modificado_en))}`:'Sin novedades guardadas';}audit(news);
  function reportParams(){return new URLSearchParams({...Object.fromEntries(params),radiooperador_id:operator.value})}
  async function refresh(){const id=++request;copy.disabled=true;current=null;try{
   if(!operator.value){preview.value='Seleccione el radioperador del reporte.';return}status.textContent='Consultando registros…';
   const data=await api(base+'vista-previa?'+reportParams());if(!dialog.isConnected||id!==request)return;current=data;preview.value=data.texto;warnings.textContent='Actividades obtenidas directamente del catálogo de Administración.';copy.disabled=dirty||!data.definitivo;status.textContent=dirty?'Guarde las novedades antes de copiar.':'Reporte listo para copiar.';
  }catch(e){if(id===request){status.textContent=e.message;preview.value='';warnings.textContent='No se pudo generar la vista previa.'}}}
  notes.oninput=()=>{dirty=true;copy.disabled=true;status.textContent='Novedades sin guardar.'};operator.onchange=refresh;
  save.onclick=async()=>{save.disabled=true;copy.disabled=true;try{const updated=await api(base+'novedades?'+params,'PUT',{texto:notes.value,version:notesVersion});notesVersion=updated.version;dirty=false;audit(updated);await refresh()}catch(e){status.textContent=e.message}finally{save.disabled=false}};
  copy.onclick=async()=>{
   if(dirty||!current?.definitivo)return;copy.disabled=true;
   try{
    // Revalidate operator permissions, the live catalog and counts at copy time.
    const definitive=await api(base+'generar?'+reportParams(),'POST',{});preview.value=definitive.texto;
    if(!navigator.clipboard?.writeText)throw Error('No se pudo acceder al portapapeles. Seleccione la cartilla y cópiela con Ctrl+C.');
    await navigator.clipboard.writeText(definitive.texto);status.textContent='Reporte copiado. Los asteriscos de WhatsApp se conservan.';
   }catch(e){status.textContent=e.message;await refresh();status.textContent=e.message}finally{copy.disabled=dirty||!current?.definitivo}
  };
  await refresh();
 }catch(e){if(dialog.isConnected)content.innerHTML=`<p class="report-error" role="alert">${esc(e.message)}</p>`}
}

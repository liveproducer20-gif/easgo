import React from 'react';
import {captureWeeklySummary} from './weekly-capture.js';
import {createRoot} from 'react-dom/client';
import {WeeklyOperationsSummary} from './weekly-summary.jsx';
export {WeeklyOperationsSummary} from './weekly-summary.jsx';
import {dailyTable,openServiceDialog} from '../public/operatividad.js';
import {showReportDialog} from '../public/reportar.js';
const states=new Map();
export function todayEcuador(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Guayaquil',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');
}
export function isoWeek(date){
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+3-((d.getUTCDay()+6)%7));
 const year=d.getUTCFullYear(),first=new Date(`${year}-01-01T12:00:00Z`);
 return `${year}-W${String(Math.ceil(((d-first)/86400000+1)/7)).padStart(2,'0')}`;
}
export function weekMonday(week){
 if(!/^\d{4}-W\d{2}$/.test(week))throw Error('Seleccione una semana válida');
 const [year,n]=week.split('-W'),d=new Date(`${year}-01-04T12:00:00Z`);
 d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)+(Number(n)-1)*7);
 const date=d.toISOString().slice(0,10);if(isoWeek(date)!==week)throw Error('Seleccione una semana válida');return date;
}
export function mondayDate(date){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)}
const dateLabel=date=>new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(date+'T12:00:00Z'));
export function barChart(days,esc){
 const width=700,height=250,left=40,baseline=195,max=Math.max(1,...days.map(d=>d.cantidad));
 return `<figure class="report-chart"><figcaption>Actividades por día</figcaption><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico de barras de actividades por día"><title>Actividades de lunes a domingo</title><line x1="${left}" y1="${baseline}" x2="690" y2="${baseline}" class="chart-axis"/>${days.map((d,i)=>{
  const x=left+i*92+14,h=d.cantidad/max*145,label=new Intl.DateTimeFormat('es-EC',{timeZone:'America/Guayaquil',weekday:'short'}).format(new Date(d.fecha+'T12:00:00Z'));
  return `<g><title>${esc(dateLabel(d.fecha))}: ${d.cantidad} actividades</title><rect x="${x}" y="${baseline-h}" width="48" height="${h}" rx="4" class="chart-bar"/><text x="${x+24}" y="${baseline-h-9}" text-anchor="middle" class="chart-value">${d.cantidad}</text><text x="${x+24}" y="218" text-anchor="middle" class="chart-label">${esc(label)}</text><text x="${x+24}" y="237" text-anchor="middle" class="chart-label">${esc(d.fecha.slice(8)+'/'+d.fecha.slice(5,7))}</text></g>`;
 }).join('')}</svg></figure>`;
}
export function mountConsolidado(host,{type,api,esc,options,me,stations}){
 const weekly=type==='semanal';let weeklyRoot=null;let closed=false,request=0,shifts=[],liveMode=type!=='semanal',tableScroll={left:0,top:0};
 const state=weekly?(states.get(type)||{fecha:todayEcuador(),station:me.rol==='admin'?'':String(me.estacion_id)}):{fecha:'',jornada:'',station:states.get(type)?.station||(me.rol==='admin'?'':String(me.estacion_id))};states.set(type,state);if(state.jornada===undefined)state.jornada='';if(weekly)state.fecha=mondayDate(state.fecha);
 // Never reuse another user's station filter when a browser changes accounts.
 if(me.rol!=='admin')state.station=String(me.estacion_id);
 host.innerHTML=`<div class="toolbar"><h2>${weekly?'Resumen de la semana':'Resumen del día'}</h2><span class="badge" data-operation-mode>${weekly?'America/Guayaquil':'Jornada actual · hora del servidor'}</span></div><form class="fields report-filters"><label>${weekly?'Semana (LUNES → DOMINGO)':'Fecha operativa'}<input name="periodo" type="date" value="${state.fecha}" required></label><label>Estación EAS<select name="estacion" ${me.rol!=='admin'?'disabled':''}>${me.rol==='admin'?'<option value="">Todas las estaciones</option>':''}${options(stations,state.station)}</select></label>${!weekly?'<label>Consulta histórica / jornada<select name="jornada"><option value="">Todas las jornadas</option><option value="sin">SIN JORNADA (registros anteriores)</option></select></label>':'<div class="week-navigation"><button type="button" data-prev class="secondary">← Semana anterior</button><button type="button" data-next class="secondary">Semana siguiente →</button></div>'}${!weekly?'<button type="button" data-current class="secondary">Jornada actual</button>':''}<button type="button" data-refresh>Actualizar</button><button type="button" data-report>REPORTAR</button></form><div data-result role="region" aria-live="polite" aria-label="Resultados del consolidado"></div>`;
 if(weekly){const footer=document.createElement('div');footer.className='weekly-report-actions';footer.innerHTML='<p>Genera la cartilla del período consultado para la estación seleccionada.</p>';footer.append(host.querySelector('[data-report]'));host.append(footer)}
 const form=host.querySelector('form'),result=host.querySelector('[data-result]'),station=form.elements.estacion;
 station.value=state.station;const period=form.elements.periodo;
 async function refresh(){
  if(closed||!host.isConnected)return;const current=++request;
  try{
   if(!weekly&&liveMode){const active=await api('jornada-actual');if(closed||current!==request)return;state.fecha=active.fecha_operativa;state.jornada=String(active.jornada_id);period.value=state.fecha;form.elements.jornada.value=state.jornada}
   if(!weekly)host.querySelector('[data-operation-mode]').textContent=liveMode?'Jornada actual · hora del servidor':'Consulta histórica · America/Guayaquil';
   if(!period.value||!period.checkValidity())throw Error('Seleccione un período válido');
   state.fecha=weekly?mondayDate(period.value):period.value;if(weekly)period.value=state.fecha;state.station=station.value;if(!weekly)state.jornada=form.elements.jornada.value;
   const previousTable=result.querySelector('.operation-scroll');if(previousTable)tableScroll={left:previousTable.scrollLeft,top:previousTable.scrollTop};
   if(weeklyRoot){weeklyRoot.unmount();weeklyRoot=null}
   result.setAttribute('aria-busy','true');result.innerHTML='<p class="report-state" role="status">Consultando registros operativos…</p>';
   const params=new URLSearchParams({fecha:state.fecha});if(!weekly&&state.jornada)params.set('jornada_id',state.jornada);if(me.rol==='admin'&&state.station)params.set('estacion_id',state.station);
   const data=await api('consolidados/'+type+'?'+params);
   if(closed||!host.isConnected||current!==request)return;
   const themeStation=data.estacion||stations.find(s=>s.id===Number(me.rol==='admin'?me.radiooperador?.estacion_id:me.estacion_id));const stationColor=/^#[0-9a-f]{6}$/i.test(themeStation?.color||'')?themeStation.color:'#0866E8';if(typeof window.applyStationTheme==='function')window.applyStationTheme(stationColor);
   if(!weekly){data.jornada_nombre=shifts.find(s=>s.id===data.jornada_id)?.nombre;result.innerHTML=dailyTable(data,{esc});result.querySelectorAll('[data-activity-color]').forEach(node=>{const c=node.dataset.activityColor;if(!/^#[0-9a-f]{6}$/i.test(c))return;node.style.borderBottom='4px solid '+c});const table=result.querySelector('.operation-scroll');table.scrollLeft=tableScroll.left;table.scrollTop=tableScroll.top;result.querySelectorAll('[data-service-row]').forEach(button=>button.onclick=()=>openServiceDialog({row:data.filas[Number(button.dataset.serviceRow)],fecha:state.fecha,stationId:state.station,jornadaId:state.jornada,api,esc,options,stations,me,onSaved:refresh}));result.querySelector('[data-new-service]').onclick=()=>openServiceDialog({fecha:state.fecha,stationId:state.station,jornadaId:state.jornada,api,esc,options,stations,me,onSaved:refresh});return}
   result.innerHTML=`<div data-weekly-summary></div><section class="weekly-statistics" aria-label="Estadísticas del período">${barChart(data.totales_diarios,esc)}</section><section class="weekly-complementary"><div class="report-indicators"><article><span>Actividades de la semana</span><strong>${data.total_registros}</strong></article><article><span>Móviles distintos participantes</span><strong>${data.moviles_participantes}</strong></article></div>${data.total_registros===0?'<p class="report-state">No hay registros operativos en este período. El resumen muestra las actividades del catálogo con cantidad cero.</p>':''}<div class="weekly-supporting-tables"><section><h2>Actividades acumuladas</h2><div class="scroll"><table><thead><tr><th>Actividad</th><th class="numeric">Cantidad</th></tr></thead><tbody>${data.actividades.map(a=>`<tr><td>${esc(a.nombre)}</td><td class="numeric">${a.cantidad}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total general</th><th class="numeric">${data.total_registros}</th></tr></tfoot></table></div><p><small>Actividades del catálogo de Administración, incluidas las desactivadas.</small></p></section><section><h2>Totales diarios</h2><table><thead><tr><th>Fecha</th><th class="numeric">Actividades</th><th class="numeric">Móviles</th></tr></thead><tbody>${data.totales_diarios.map(d=>`<tr><td>${dateLabel(d.fecha)}</td><td class="numeric">${d.cantidad}</td><td class="numeric">${d.moviles}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total semanal</th><th class="numeric">${data.total_registros}</th><th class="numeric">${data.moviles_participantes}</th></tr></tfoot></table><p><small>El total de móviles cuenta cada móvil una sola vez en toda la semana.</small></p></section></div></section>`;
   weeklyRoot=createRoot(result.querySelector('[data-weekly-summary]'));weeklyRoot.render(<WeeklyOperationsSummary data={data}/>);
  }catch(e){if(!closed&&host.isConnected&&current===request){result.innerHTML=`<p class="report-error" role="alert">${esc(e.message||'No se pudo consultar el consolidado')}</p><button type="button" data-retry>Reintentar</button>`;result.querySelector('[data-retry]').onclick=refresh}}
  finally{if(current===request)result.setAttribute('aria-busy','false')}
 }
 form.onsubmit=e=>{e.preventDefault();refresh()};period.onchange=()=>{if(!weekly)liveMode=false;refresh()};station.onchange=refresh;host.querySelector('[data-refresh]').onclick=refresh;
 const reportButton=host.querySelector('[data-report]');function reportState(){reportButton.disabled=me.rol==='admin'&&!station.value;reportButton.title=reportButton.disabled?'Seleccione una estación para reportar':''}reportState();const originalStationChange=station.onchange;station.onchange=()=>{reportState();originalStationChange()};reportButton.onclick=()=>{if(!period.value||!period.checkValidity())return;showReportDialog({type,fecha:weekly?mondayDate(period.value):period.value,jornadaId:weekly?'':form.elements.jornada.value,stationId:station.value||me.estacion_id,api,esc,options,me,captureImage:()=>captureWeeklySummary(result.querySelector(weekly?'.weekly-poster':'.operativity'))})};
 const onFocus=()=>{if(!document.hidden)refresh()};window.addEventListener('focus',onFocus);window.addEventListener('redeas:registros',onFocus);document.addEventListener('visibilitychange',onFocus);
 const timer=setInterval(()=>{if(!document.hidden)refresh()},15000);if(weekly){for(const [selector,delta] of [['[data-prev]',-7],['[data-next]',7]])host.querySelector(selector).onclick=()=>{const d=new Date(period.value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);period.value=d.toISOString().slice(0,10);refresh()};refresh()}else{form.elements.jornada.onchange=()=>{liveMode=false;refresh()};host.querySelector('[data-current]').onclick=()=>{liveMode=true;refresh()};api('jornadas').then(data=>{if(closed)return;shifts=data;form.elements.jornada.insertAdjacentHTML('beforeend',data.map(s=>`<option value="${s.id}">${esc(s.nombre+' ('+s.hora_inicio+'–'+s.hora_fin+')')}</option>`).join(''));form.elements.jornada.value=state.jornada;refresh()}).catch(e=>{if(!closed)result.innerHTML=`<p class="report-error">${esc(e.message)}</p>`})}
 return ()=>{if(weeklyRoot){weeklyRoot.unmount();weeklyRoot=null}closed=true;request++;clearInterval(timer);window.removeEventListener('focus',onFocus);window.removeEventListener('redeas:registros',onFocus);document.removeEventListener('visibilitychange',onFocus)};
}

export {mountDashboard} from './dashboard.jsx';

export {mountConnection} from './connection.jsx';

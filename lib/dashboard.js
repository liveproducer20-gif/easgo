import {readFileSync} from 'node:fs';
import {validateReportDate,ecuadorDate} from './consolidados.js';
import {currentOperation} from './jornada-actual.js';
import {shiftFilter} from './operatividad.js';
const fail=(m,s=400)=>{throw Object.assign(Error(m),{status:s})};
export const addDays=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export function initializeDashboard(db){
 const name='013_dashboard';if(db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get(name))return;
 db.exec('BEGIN');try{db.exec(readFileSync(new URL('../migrations/013_dashboard.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
export function dashboardFilters(db,user,p,now){
 const allowed=['desde','hasta','estacion_id','jornada_id','actividad_id','movil_id','agrupacion','buscar','pagina','orden','direccion','formato','comparacion'];
 for(const key of p.keys())if(!allowed.includes(key))fail('Filtro no reconocido: '+key);
 for(const key of allowed)if(key!=='estacion_id'&&p.getAll(key).length>1)fail('Filtro duplicado: '+key);
 const today=currentOperation(db,now).fecha_operativa,desde=validateReportDate(p.get('desde')||today),hasta=validateReportDate(p.get('hasta')||desde);
 const days=Math.round((Date.parse(hasta)-Date.parse(desde))/86400000)+1;if(days<1||days>366)fail('Seleccione un rango entre 1 y 366 días');
 let stations=p.getAll('estacion_id').filter(Boolean).map(s=>{if(!/^[1-9]\d*$/.test(s))fail('Estación inválida');return Number(s)});
 stations=[...new Set(stations)];if(user.rol!=='admin'){if(stations.some(s=>s!==user.estacion_id))fail('Estación no autorizada',403);stations=[user.estacion_id]}
 if(stations.length>1000)fail('Demasiadas estaciones');if(stations.length&&db.prepare('SELECT COUNT(*) AS n FROM estaciones WHERE id IN('+stations.map(()=>'?')+')').get(...stations).n!==stations.length)fail('Estación inválida');
 const id=(key,table)=>{if(!p.get(key))return null;if(key==='movil_id'&&p.get(key)==='sin')return 'sin';if(!/^[1-9]\d*$/.test(p.get(key)))fail('Filtro inválido');const row=db.prepare('SELECT * FROM '+table+' WHERE id=?').get(Number(p.get(key)));if(!row)fail('Filtro inexistente');if(table==='moviles'&&stations.length&&!stations.includes(row.estacion_id))fail('Móvil no autorizado para la estación',403);return row.id};
 const actividad=id('actividad_id','actividades'),movil=id('movil_id','moviles'),jornada=shiftFilter(db,p),agrupacion=p.get('agrupacion')||'dia';if(!['dia','semana','mes'].includes(agrupacion))fail('Agrupación inválida');
 const pagina=Number(p.get('pagina')||1);if(!Number.isSafeInteger(pagina)||pagina<1||pagina>1000000)fail('Página inválida');const buscar=p.get('buscar')||'';if(buscar.length>200)fail('Búsqueda demasiado larga');
 const orden=p.get('orden')||'fecha',direccion=p.get('direccion')||'desc';if(!['fecha','hora','movil','actividad','ubicacion','detalle'].includes(orden)||!['asc','desc'].includes(direccion))fail('Orden inválido');
 const formato=p.get('formato')||'json';if(!['json','csv'].includes(formato))fail('Formato inválido');const comparacion=p.get('comparacion')||'anterior';if(!['anterior','mes'].includes(comparacion))fail('Comparación inválida');
 return {desde,hasta,days,stations,actividad,movil,jornada,agrupacion,pagina,buscar,orden,direccion,formato,comparacion};
}
function where(f,alias='r',service=false){
 const a=[f.desde,f.hasta],c=[`${alias}.fecha BETWEEN ? AND ?`];
 if(f.stations.length){c.push(`${alias}.estacion_id IN (${f.stations.map(()=>'?')})`);a.push(...f.stations)}
 if(f.jornada!==null){c.push(f.jornada===0?`${alias}.jornada_id IS NULL`:`${alias}.jornada_id=?`);if(f.jornada!==0)a.push(f.jornada)}
 if(f.movil!==null){c.push(f.movil==='sin'?`${alias}.movil_id IS NULL`:`${alias}.movil_id=?`);if(f.movil!=='sin')a.push(f.movil)}
 if(service){if(f.actividad!==null||f.buscar){const inner=where({...f,stations:[],jornada:null,movil:null},'x');c.push(`EXISTS (SELECT 1 FROM registros x WHERE x.estacion_id=${alias}.estacion_id AND x.fecha=${alias}.fecha AND x.jornada_id IS ${alias}.jornada_id AND x.movil_id IS ${alias}.movil_id AND ${inner.sql})`);a.push(...inner.args)}}
 else{
 if(f.actividad!==null){c.push(`${alias}.actividad_id=?`);a.push(f.actividad)}
 if(f.buscar){c.push(`(${alias}.detalle LIKE ? ESCAPE '\\' OR ${alias}.ubicacion LIKE ? ESCAPE '\\' OR ${alias}.actividad_nombre LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM moviles bm WHERE bm.id=${alias}.movil_id AND bm.numero LIKE ? ESCAPE '\\'))`);const pattern='%'+f.buscar.replace(/[\\%_]/g,'\\$&')+'%';a.push(pattern,pattern,pattern,pattern)}
 }
 return {sql:c.join(' AND '),args:a};
}
export function dashboard(db,user,p,now=new Date()){
 const f=dashboardFilters(db,user,p,now);db.exec('BEGIN');try{const data=build(db,user,f,now);db.exec('COMMIT');return data}catch(e){db.exec('ROLLBACK');throw e}
}
function build(db,user,f,now){
 const w=where(f),sw=where(f,'s',true),q=(sql,args=w.args)=>db.prepare(sql).all(...args),one=(sql,args=w.args)=>db.prepare(sql).get(...args);
 const prefix=`WITH r AS(SELECT * FROM registros r WHERE ${w.sql}) `;
 const total=one(prefix+'SELECT COUNT(*) AS total,COUNT(DISTINCT movil_id) AS moviles FROM r');
 const actividades=q(prefix+`SELECT a.id,a.nombre,a.color,a.estado,COUNT(r.id) AS cantidad FROM actividades a LEFT JOIN r ON r.actividad_id=a.id GROUP BY a.id ORDER BY a.id`);
 const kmSQL=`SELECT COUNT(*) AS servicios,SUM(CASE WHEN s.kilometraje_entrante IS NOT NULL AND s.kilometraje_saliente>=s.kilometraje_entrante THEN s.kilometraje_saliente-s.kilometraje_entrante END) AS kilometros,SUM(CASE WHEN s.kilometraje_entrante IS NULL OR s.kilometraje_saliente IS NULL OR s.kilometraje_saliente<s.kilometraje_entrante THEN 1 ELSE 0 END) AS pendientes FROM servicios_moviles s WHERE ${sw.sql}`;
 const km=one(kmSQL,sw.args);const count=name=>actividades.find(a=>a.nombre===name)?.cantidad||0;
 const jornadas=q(prefix+`SELECT COALESCE(j.id,0) AS id,COALESCE(j.nombre,'SIN JORNADA') AS nombre,COUNT(r.id) AS cantidad,COUNT(DISTINCT r.movil_id) AS moviles FROM (SELECT id,nombre FROM jornadas UNION ALL SELECT NULL,'SIN JORNADA') j LEFT JOIN r ON r.jornada_id IS j.id GROUP BY j.id ORDER BY j.id`);
 const jornada_actividades=q(prefix+'SELECT jornada_id,actividad_id,COUNT(*) AS cantidad FROM r GROUP BY jornada_id,actividad_id');
 const servicios=q(`SELECT s.*,m.numero AS movil,m.placa,e.nombre AS estacion, j.nombre AS jornada,CASE WHEN s.kilometraje_entrante IS NOT NULL AND s.kilometraje_saliente>=s.kilometraje_entrante THEN s.kilometraje_saliente-s.kilometraje_entrante END AS kilometros FROM servicios_moviles s JOIN moviles m ON m.id=s.movil_id JOIN estaciones e ON e.id=s.estacion_id JOIN jornadas j ON j.id=s.jornada_id WHERE ${sw.sql} ORDER BY s.fecha,s.jornada_id,m.numero`,sw.args);
 const moviles=q(prefix+`SELECT r.movil_id AS id,COALESCE(m.numero,'SIN MÓVIL') AS numero,m.placa,e.nombre AS estacion,m.novedades,COUNT(*) AS cantidad,COUNT(DISTINCT r.fecha||'|'||COALESCE(r.jornada_id,0)) AS jornadas FROM r LEFT JOIN moviles m ON m.id=r.movil_id JOIN estaciones e ON e.id=r.estacion_id GROUP BY r.estacion_id,r.movil_id ORDER BY cantidad DESC,numero`);
 for(const m of moviles){const ss=servicios.filter(s=>s.movil_id===m.id&&s.estacion===m.estacion);m.kilometros=ss.some(s=>s.kilometros!==null)?ss.reduce((v,s)=>v+(s.kilometros??0),0):null;m.servicios_pendientes=ss.filter(s=>s.kilometros===null).length}
 const dias=q(prefix+'SELECT fecha,COUNT(*) AS cantidad FROM r GROUP BY fecha ORDER BY fecha');
 let prevDesde=addDays(f.desde,-f.days),prevHasta=addDays(f.desde,-1);
 if(f.comparacion==='mes'){const previous=s=>{const d=new Date(s+'T12:00:00Z'),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)};prevDesde=previous(f.desde);prevHasta=previous(f.hasta);if(f.desde.endsWith('-01')&&addDays(f.hasta,1).endsWith('-01')){prevHasta=addDays(f.desde,-1);prevDesde=prevHasta.slice(0,8)+'01'}}
 const pw=where({...f,desde:prevDesde,hasta:prevHasta});const previous=q(`SELECT fecha,COUNT(*) AS cantidad FROM registros r WHERE ${pw.sql} GROUP BY fecha ORDER BY fecha`,pw.args),previousTotal=previous.reduce((n,d)=>n+d.cantidad,0);
 const bucket=s=>f.agrupacion==='mes'?s.slice(0,7):f.agrupacion==='semana'?addDays(s,-((new Date(s+'T12:00:00Z').getUTCDay()+6)%7)):s;
 const evolution=new Map();for(let i=0;i<f.days;i++){const date=addDays(f.desde,i),key=bucket(date);if(!evolution.has(key))evolution.set(key,{periodo:key,cantidad:0,anterior:0});evolution.get(key).cantidad+=dias.find(d=>d.fecha===date)?.cantidad||0}
 for(const d of previous){const offset=Math.round((Date.parse(d.fecha)-Date.parse(prevDesde))/86400000);const key=bucket(addDays(f.desde,offset));if(evolution.has(key))evolution.get(key).anterior+=d.cantidad}
 const ubicaciones=q(prefix+`SELECT r.ubicacion_id,r.ubicacion, r.estacion_id,e.nombre AS estacion,COUNT(*) AS cantidad,MAX(r.fecha) AS ultima_fecha FROM r JOIN estaciones e ON e.id=r.estacion_id GROUP BY r.estacion_id,CASE WHEN r.ubicacion_id IS NOT NULL THEN 'id:'||r.ubicacion_id ELSE 'texto:'||r.ubicacion END ORDER BY cantidad DESC LIMIT 100`);
 const locationActivities=q(prefix+`SELECT estacion_id,ubicacion_id,ubicacion,actividad_id,COUNT(*) AS cantidad FROM r GROUP BY estacion_id,CASE WHEN ubicacion_id IS NOT NULL THEN 'id:'||ubicacion_id ELSE 'texto:'||ubicacion END,actividad_id ORDER BY cantidad DESC`);
 for(const l of ubicaciones)l.frecuentes=locationActivities.filter(a=>a.estacion_id===l.estacion_id&&(l.ubicacion_id!==null?a.ubicacion_id===l.ubicacion_id:a.ubicacion_id===null&&a.ubicacion===l.ubicacion)).slice(0,3).map(a=>({nombre:actividades.find(x=>x.id===a.actividad_id)?.nombre,cantidad:a.cantidad}));
 let estaciones=[];if(user.rol==='admin'){
 const esArgs=f.stations,esWhere=esArgs.length?'WHERE e.id IN ('+esArgs.map(()=>'?')+')':'';
 estaciones=q(prefix+`SELECT e.id,e.nombre,COUNT(r.id) AS cantidad,COUNT(DISTINCT r.movil_id) AS moviles,SUM(CASE WHEN a.nombre='OPERATIVOS' THEN 1 ELSE 0 END) AS operativos,SUM(CASE WHEN a.nombre='REQUERIMIENTOS' THEN 1 ELSE 0 END) AS requerimientos,SUM(CASE WHEN a.nombre='COLABORACIÓN CON OTRAS INSTITUCIONES' THEN 1 ELSE 0 END) AS colaboraciones FROM estaciones e LEFT JOIN r ON r.estacion_id=e.id LEFT JOIN actividades a ON a.id=r.actividad_id ${esWhere} GROUP BY e.id ORDER BY e.nombre`,[...w.args,...esArgs]);
 const sk=q(`SELECT s.estacion_id,SUM(CASE WHEN s.kilometraje_entrante IS NOT NULL AND s.kilometraje_saliente>=s.kilometraje_entrante THEN s.kilometraje_saliente-s.kilometraje_entrante END) AS kilometros FROM servicios_moviles s WHERE ${sw.sql} GROUP BY s.estacion_id`,sw.args);for(const e of estaciones)e.kilometros=sk.find(s=>s.estacion_id===e.id)?.kilometros??null;
 }
 const order={fecha:'r.fecha',hora:'r.hora',movil:'m.numero',actividad:'r.actividad_nombre',ubicacion:'r.ubicacion',detalle:'r.detalle'}[f.orden];
 const registros=q(`SELECT r.id,r.fecha,r.hora,r.movil_id,COALESCE(m.numero,'SIN MÓVIL') AS movil,r.actividad_nombre AS actividad,r.ubicacion,r.detalle,e.nombre AS estacion,COALESCE(j.nombre,'SIN JORNADA') AS jornada FROM registros r LEFT JOIN moviles m ON m.id=r.movil_id JOIN estaciones e ON e.id=r.estacion_id LEFT JOIN jornadas j ON j.id=r.jornada_id WHERE ${w.sql} ORDER BY ${order} ${f.direccion},r.id ${f.direccion} ${f.formato==='csv'?'':'LIMIT 25 OFFSET ?'}`,f.formato==='csv'?w.args:[...w.args,(f.pagina-1)*25]);
 return {filtros:f,actualizado_en:now.toISOString(),zona_horaria:'America/Guayaquil',inicio:f.desde,fin:f.hasta,estacion:f.stations.length===1?one('SELECT * FROM estaciones WHERE id=?',[f.stations[0]]):null,actividades,kpi:{total:total.total,moviles:total.moviles,operativos:count('OPERATIVOS'),requerimientos:count('REQUERIMIENTOS'),colaboraciones:count('COLABORACIÓN CON OTRAS INSTITUCIONES'),kilometros:km.kilometros,servicios:km.servicios,servicios_pendientes:km.pendientes||0},evolucion:[...evolution.values()],comparacion:{desde:prevDesde,hasta:prevHasta,total:previousTotal,variacion:previousTotal?(total.total-previousTotal)/previousTotal*100:null},jornadas,jornada_actividades,moviles,servicios,estaciones,ubicaciones,registros,paginacion:{pagina:f.pagina,tamano:25,total:total.total,paginas:Math.max(1,Math.ceil(total.total/25))}};
}
export function dashboardCSV(data){
 const rows=[['seccion','periodo_inicio','periodo_fin','estacion','identificador','nombre','cantidad','kilometros','fecha','jornada','detalle']];
 const push=(section,station,id,name,count,km,date,shift,detail)=>rows.push([section,data.inicio,data.fin,station,id,name,count,km,date,shift,detail]);
 for(const [key,value] of Object.entries(data.kpi))push('indicadores',data.estacion?.nombre||'GENERAL',key,key,key==='kilometros'?null:value,key==='kilometros'?value:null);
 push('comparacion','',null,'Período anterior',data.comparacion.total,null,null,null,`${data.comparacion.desde} a ${data.comparacion.hasta}; variación: ${data.comparacion.variacion??'Sin base comparable'}`);
 for(const a of data.actividades)push('actividades',data.estacion?.nombre||'GENERAL',a.id,a.nombre,a.cantidad);
 for(const d of data.evolucion)push('evolucion','',d.periodo,'Actual',d.cantidad,null,d.periodo,null,'Anterior: '+d.anterior);
 for(const m of data.moviles)push('moviles',m.estacion,m.id,m.numero,m.cantidad,m.kilometros,null,null,m.novedades);
 for(const s of data.servicios)push('servicios',s.estacion,s.movil_id,s.movil,null,s.kilometros,s.fecha,s.jornada,`Conductor: ${s.conductor}; Jefe: ${s.jefe_patrulla}; KM entrante: ${s.kilometraje_entrante??'SIN DATO'}; KM saliente: ${s.kilometraje_saliente??'SIN DATO'}; ${s.observaciones}`);
 for(const j of data.jornadas)push('jornadas','',j.id,j.nombre,j.cantidad);
 for(const e of data.estaciones)push('estaciones',e.nombre,e.id,e.nombre,e.cantidad,e.kilometros);
 for(const u of data.ubicaciones)push('ubicaciones',u.estacion,u.ubicacion_id,u.ubicacion,u.cantidad,null,u.ultima_fecha,null,u.frecuentes.map(a=>a.nombre+': '+a.cantidad).join('; '));
 for(const r of data.registros)push('registros',r.estacion,r.id,r.actividad,1,null,r.fecha,r.jornada,`Hora: ${r.hora??'SIN DATO'}; Móvil: ${r.movil}; Ubicación: ${r.ubicacion}; ${r.detalle}`);
 const cell=v=>{let s=String(v??'');if(typeof v==='string'&&/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}

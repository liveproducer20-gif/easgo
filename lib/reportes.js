import {shiftClause} from './operatividad.js';
import {readFileSync} from 'node:fs';
import {reportPeriod} from './consolidados.js';
const error=(message,status=400)=>Object.assign(Error(message),{status});
export function initializeReports(db){
 for(const name of ['006_reportar','007_catalogo_unico']){if(db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get(name))continue;db.exec('BEGIN');try{db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}
}
export function operators(db,user,includeInactive=false){
 const rows=db.prepare(`SELECT r.id,r.nombre,r.estado,r.estacion_id,r.creado,group_concat(re.estacion_id) AS asignadas FROM radiooperadores r JOIN radiooperador_estaciones re ON re.radiooperador_id=r.id WHERE ${includeInactive?'1=1':'r.estado=1'} ${user.rol==='admin'?'':'AND EXISTS(SELECT 1 FROM radiooperador_estaciones x WHERE x.radiooperador_id=r.id AND x.estacion_id=?)'} GROUP BY r.id ORDER BY r.nombre`).all(...(user.rol==='admin'?[]:[user.estacion_id]));
 return rows.map(r=>{const {asignadas,...rest}=r;return {...rest,estacion_id:user.rol==='admin'?r.estacion_id:user.estacion_id,estaciones:asignadas.split(',').map(Number)}});
}
export function authorizedOperator(db,id,sid){return db.prepare('SELECT r.id,r.nombre FROM radiooperadores r JOIN radiooperador_estaciones re ON re.radiooperador_id=r.id WHERE r.id=? AND r.estado=1 AND re.estacion_id=?').get(id,sid)}
export function saveOperator(db,user,body,id){
 if(id&&user.rol!=='admin')throw error('Solo administrador',403);
 const old=id?db.prepare('SELECT * FROM radiooperadores WHERE id=?').get(id):null;if(id&&!old)throw error('Radiooperador no encontrado',404);
 if(typeof body.nombre!=='string'||!body.nombre.trim()||body.nombre.trim().length>150)throw error('Nombre completo obligatorio (máximo 150 caracteres)');
 const nombre=body.nombre.trim().replace(/\s+/g,' '),clave=nombre.toLocaleUpperCase('es');
 const ids=user.rol==='admin'?(body.estaciones??[Number(body.estacion_id)]):[user.estacion_id];
 if(user.rol!=='admin'&&((body.estacion_id&&Number(body.estacion_id)!==user.estacion_id)||(body.estaciones&&(!Array.isArray(body.estaciones)||body.estaciones.some(x=>Number(x)!==user.estacion_id)))))throw error('Estación no autorizada',403);
 if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(x=>!Number.isSafeInteger(Number(x))))throw error('Asigne al menos una estación válida');
 const stations=[...new Set(ids.map(Number))],estado=user.rol==='admin'?(body.estado??old?.estado??1):1;if(![0,1].includes(estado))throw error('Estado inválido');
 for(const station of stations){if(!db.prepare('SELECT id FROM estaciones WHERE id=?').get(station))throw error('Estación inválida');if(db.prepare('SELECT r.id FROM radiooperadores r JOIN radiooperador_estaciones re ON re.radiooperador_id=r.id WHERE r.clave=? AND re.estacion_id=? AND r.id<>?').get(clave,station,Number(id)||0))throw error('Este radiooperador ya existe en la estación',409)}
 db.exec('BEGIN');try{
  let saved=id;if(id)db.prepare('UPDATE radiooperadores SET nombre=?,clave=?,estado=?,estacion_id=? WHERE id=?').run(nombre,clave,estado,stations[0],id);else saved=Number(db.prepare('INSERT INTO radiooperadores(nombre,clave,estado,estacion_id) VALUES(?,?,?,?)').run(nombre,clave,estado,stations[0]).lastInsertRowid);
  db.prepare('DELETE FROM radiooperador_estaciones WHERE radiooperador_id=?').run(saved);for(const station of stations)db.prepare('INSERT INTO radiooperador_estaciones VALUES(?,?)').run(saved,station);db.exec('COMMIT');
  return operators(db,{rol:'admin'},true).find(r=>r.id===Number(saved));
 }catch(e){db.exec('ROLLBACK');throw e}
}
export function notes(db,type,fecha,sid,jornadaId=null){const p=reportPeriod(type,fecha);return db.prepare('SELECT n.*,u.username AS modificado_por_nombre FROM reporte_novedades n JOIN usuarios u ON u.id=n.modificado_por WHERE n.estacion_id=? AND n.tipo=? AND n.inicio=? AND n.jornada_clave=?').get(sid,type,p.inicio,jornadaId===null?0:jornadaId===0?-1:jornadaId)||{jornada_clave:jornadaId===null?0:jornadaId===0?-1:jornadaId,estacion_id:sid,tipo:type,inicio:p.inicio,fin:p.fin,texto:'',version:0,modificado_por:null,modificado_en:null}}
export function saveNotes(db,type,fecha,sid,user,body,jornadaId=null){
 if(typeof body.texto!=='string'||body.texto.length>10000)throw error('Novedades: máximo 10000 caracteres');if(!Number.isSafeInteger(body.version)||body.version<0)throw error('Versión de novedades inválida');
 const p=reportPeriod(type,fecha),now=new Date().toISOString();db.exec('BEGIN');try{
  const old=notes(db,type,fecha,sid,jornadaId);if(old.version!==body.version)throw error('Las novedades cambiaron. Recargue antes de guardar para conservar los cambios de otro usuario.',409);
  db.prepare('INSERT INTO reporte_novedades(estacion_id,tipo,inicio,fin,texto,modificado_por,modificado_en,version,jornada_clave) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(estacion_id,tipo,inicio,jornada_clave) DO UPDATE SET texto=excluded.texto,modificado_por=excluded.modificado_por,modificado_en=excluded.modificado_en,version=excluded.version').run(sid,type,p.inicio,p.fin,body.texto.replace(/\r\n?/g,'\n'),user.id,now,old.version+1,jornadaId===null?0:jornadaId===0?-1:jornadaId);
  const result=notes(db,type,fecha,sid,jornadaId);db.exec('COMMIT');return result;
 }catch(e){db.exec('ROLLBACK');throw e}
}
export function generateReport(db,type,fecha,sid,operatorId,jornadaId=null){
 db.exec('BEGIN');try{const result=buildReport(db,type,fecha,sid,operatorId,jornadaId);db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}
}
function buildReport(db,type,fecha,sid,operatorId,jornadaId){
 const p=reportPeriod(type,fecha),station=db.prepare('SELECT id,nombre FROM estaciones WHERE id=?').get(sid);if(!station)throw error('Estación no encontrada',404);
 const operator=authorizedOperator(db,operatorId,sid);if(!operator)throw error('Seleccione un radiooperador habilitado para esta estación',403);
 // The same catalog and ordering as Administración → Actividades.
 const activities=db.prepare(`WITH conteos AS(SELECT actividad_id,COUNT(*) AS cantidad FROM registros WHERE estacion_id=? AND fecha>=? AND fecha<? ${shiftClause(jornadaId)} GROUP BY actividad_id)
 SELECT a.id,a.nombre,a.estado,COALESCE(q.cantidad,0) AS cantidad FROM actividades a LEFT JOIN conteos q ON q.actividad_id=a.id ORDER BY a.id`).all(sid,p.inicio,p.exclusive);
 const total=activities.reduce((sum,a)=>sum+a.cantidad,0),news=notes(db,type,fecha,sid,jornadaId);
 const date=s=>s.split('-').reverse().join('-');
 const lines=[`*CIRCUITO EAS ${station.nombre}*`,'','*CONSOLIDADO RADIOPERADOR:*',operator.nombre,'',`*FECHA* : ${type==='semanal'?date(p.inicio)+' AL '+date(p.fin):date(p.inicio)}`,''];
 if(jornadaId!==null){const shift=jornadaId===0?null:db.prepare('SELECT * FROM jornadas WHERE id=?').get(jornadaId);lines.push('*JORNADA:* '+(shift?shift.nombre+' ('+shift.hora_inicio+'–'+shift.hora_fin+')':'SIN JORNADA'),'')}
 for(const activity of activities)lines.push(`*${activity.nombre}*`,`TOTAL: ${String(activity.cantidad).padStart(2,'0')}`);
 const newsLines=news.texto.split('\n').map(x=>x.trim()).filter(Boolean).map(x=>'- '+x.replace(/^[-•]\s*/,''));lines.push('','*NOVEDADES*',...(newsLines.length?newsLines:['- SIN NOVEDADES']));
 return {texto:lines.join('\n'),definitivo:true,advertencias:[],estacion:station,radiooperador:operator,inicio:p.inicio,fin:p.fin,tipo:type,zona_horaria:'America/Guayaquil',jornada_id:jornadaId,total_registros:total,actividades:activities,novedades:news};
}

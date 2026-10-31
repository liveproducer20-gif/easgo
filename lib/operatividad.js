import {readFileSync} from 'node:fs';
import {validateReportDate} from './consolidados.js';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function initializeOperations(db){
 const name='008_jornadas_servicios';if(db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get(name))return;
 db.exec('BEGIN');try{db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
export function shiftFilter(db,params){
 if(params.getAll('jornada_id').length>1)fail('Jornada duplicada');if(!params.has('jornada_id')||params.get('jornada_id')==='')return null;
 const value=params.get('jornada_id');if(value==='sin')return 0;
 if(!/^[1-9]\d*$/.test(value)||!db.prepare('SELECT id FROM jornadas WHERE id=?').get(Number(value)))fail('Jornada inválida');return Number(value);
}
export function shiftClause(jid,column='jornada_id'){return jid===null?'':jid===0?` AND ${column} IS NULL`:` AND ${column}=${Number(jid)}`}
export function dailyRows(db,fecha,sid,jid){
 const args=[fecha],where='fecha=?'+(sid===null?'':' AND estacion_id=?')+shiftClause(jid);if(sid!==null)args.push(sid);
 const counts=db.prepare(`SELECT estacion_id,fecha,jornada_id,movil_id,actividad_id,COUNT(*) AS cantidad FROM registros WHERE ${where} GROUP BY estacion_id,fecha,jornada_id,movil_id,actividad_id`).all(...args);
 const rows=db.prepare(`WITH grupos AS(SELECT estacion_id,fecha,jornada_id,movil_id FROM registros WHERE ${where} UNION SELECT estacion_id,fecha,jornada_id,movil_id FROM servicios_moviles WHERE ${where})
 SELECT g.*,e.nombre AS estacion,j.nombre AS jornada,j.hora_inicio,j.hora_fin,m.numero AS movil,s.id AS servicio_id,s.conductor,s.jefe_patrulla,s.kilometraje_entrante,s.kilometraje_saliente,s.observaciones
 FROM grupos g JOIN estaciones e ON e.id=g.estacion_id LEFT JOIN jornadas j ON j.id=g.jornada_id LEFT JOIN moviles m ON m.id=g.movil_id LEFT JOIN servicios_moviles s ON s.estacion_id=g.estacion_id AND s.fecha=g.fecha AND s.jornada_id IS g.jornada_id AND s.movil_id IS g.movil_id ORDER BY e.nombre,COALESCE(g.jornada_id,0),m.numero`).all(...args,...args);
 const key=r=>[r.estacion_id,r.fecha,r.jornada_id,r.movil_id].join('|'),byGroup=new Map();
 for(const c of counts){const k=key(c);if(!byGroup.has(k))byGroup.set(k,{});byGroup.get(k)[c.actividad_id]=c.cantidad}
 const filas=rows.map(r=>({...r,jornada:r.jornada||'SIN JORNADA',movil:r.movil||'SIN MÓVIL',cantidades:byGroup.get(key(r))||{}}));
 return {filas,kilometraje_total:filas.reduce((n,r)=>n+(r.kilometraje_saliente==null||r.kilometraje_entrante==null?0:r.kilometraje_saliente-r.kilometraje_entrante),0),moviles_en_servicio:new Set(filas.filter(r=>r.movil_id!==null).map(r=>r.movil_id)).size};
}
export function saveService(db,user,body,id){
 const old=id?db.prepare('SELECT * FROM servicios_moviles WHERE id=?').get(id):null;if(id&&!old)fail('Servicio no encontrado',404);
 if(old&&user.rol!=='admin'&&old.estacion_id!==user.estacion_id)fail('Estación no autorizada',403);
 const sid=user.rol==='admin'?Number(body.estacion_id):user.estacion_id;
 if(user.rol!=='admin'&&body.estacion_id&&Number(body.estacion_id)!==sid)fail('Estación no autorizada',403);
 if(!db.prepare('SELECT id FROM estaciones WHERE id=?').get(sid))fail('Estación inválida');
 validateReportDate(body.fecha);const jid=Number(body.jornada_id),mid=Number(body.movil_id);
 if(!db.prepare('SELECT id FROM jornadas WHERE id=?').get(jid))fail('Seleccione una jornada');
 if(!db.prepare('SELECT id FROM moviles WHERE id=? AND estacion_id=?').get(mid,sid))fail('Móvil ajeno a la estación',403);
 const text=(v,label,max=2000)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)fail(label+' inválido');return v.trim()};
 const km=v=>{if(v==null||v==='')return null;const n=Number(v);if(!Number.isFinite(n)||n<0)fail('Kilometraje no válido');return n};
 const incoming=km(body.kilometraje_entrante),outgoing=km(body.kilometraje_saliente);
 if(outgoing!==null&&(incoming===null||outgoing<incoming))fail('El kilometraje saliente no puede ser inferior al entrante');
 if(db.prepare('SELECT id FROM servicios_moviles WHERE estacion_id=? AND fecha=? AND jornada_id=? AND movil_id=? AND id<>?').get(sid,body.fecha,jid,mid,id||0))fail('Ya existe un servicio para este móvil, fecha y jornada',409);
 const values=[sid,body.fecha,jid,mid,text(body.conductor,'Conductor',200),text(body.jefe_patrulla,'Jefe de patrulla',200),incoming,outgoing,text(body.observaciones,'Observaciones'),user.id,new Date().toISOString()];
 let saved=id;if(id)db.prepare('UPDATE servicios_moviles SET estacion_id=?,fecha=?,jornada_id=?,movil_id=?,conductor=?,jefe_patrulla=?,kilometraje_entrante=?,kilometraje_saliente=?,observaciones=?,modificado_por=?,modificado_en=? WHERE id=?').run(...values,id);
 else saved=Number(db.prepare('INSERT INTO servicios_moviles(estacion_id,fecha,jornada_id,movil_id,conductor,jefe_patrulla,kilometraje_entrante,kilometraje_saliente,observaciones,modificado_por,modificado_en) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(...values).lastInsertRowid);
 return db.prepare('SELECT * FROM servicios_moviles WHERE id=?').get(saved);
}

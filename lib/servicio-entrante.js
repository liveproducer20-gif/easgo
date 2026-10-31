import {currentOperation} from './jornada-actual.js';
import {saveService} from './operatividad.js';
import {readFileSync} from 'node:fs';
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export function initializeIncomingService(db){
 const name='011_combustible_servicio';if(db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get(name))return;
 db.exec('BEGIN');try{db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run(name);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
}
export function incomingStatus(db,sid,now){
 const contexto=currentOperation(db,now),clave=`${sid}|${contexto.fecha_operativa}|${contexto.jornada_id}`;
 const moviles=db.prepare('SELECT m.*,s.id AS servicio_id,s.conductor,s.jefe_patrulla,s.kilometraje_entrante,s.kilometraje_saliente,s.combustible_entrante FROM moviles m LEFT JOIN servicios_moviles s ON s.movil_id=m.id AND s.estacion_id=m.estacion_id AND s.fecha=? AND s.jornada_id=? WHERE m.estacion_id=? ORDER BY m.numero').all(contexto.fecha_operativa,contexto.jornada_id,sid).map(m=>({...m,completo:!!(m.servicio_id&&m.conductor?.trim()&&m.jefe_patrulla?.trim()&&m.kilometraje_entrante!==null&&m.combustible_entrante)}));
 const pendientes=moviles.filter(m=>!m.completo).map(m=>m.id);
 return {contexto,moviles,pendientes,completo:pendientes.length===0,total:moviles.length,completados:moviles.length-pendientes.length,clave};
}
export function saveIncomingService(db,user,body,now){
 const sid=user.rol==='admin'?Number(body.estacion_id):user.estacion_id;
 if(user.rol!=='admin'&&body.estacion_id&&Number(body.estacion_id)!==sid)fail('Estación no autorizada',403);
 const mobile=db.prepare('SELECT * FROM moviles WHERE id=? AND estacion_id=?').get(Number(body.movil_id),sid);
 if(!mobile)fail('Seleccione un móvil autorizado para su estación',403);
 for(const key of ['conductor','jefe_patrulla'])if(typeof body[key]!=='string'||!body[key].trim()||body[key].trim().length>200)fail(key==='conductor'?'Nombre del conductor obligatorio (máximo 200 caracteres)':'Nombre del jefe de patrulla obligatorio (máximo 200 caracteres)');
 const km=Number(body.kilometraje);if(body.kilometraje===null||body.kilometraje===undefined||body.kilometraje===''||!Number.isFinite(km)||km<0)fail('Kilometraje entrante inválido');
 if(!['Lleno','3/4','1/2','1/4','Reserva'].includes(body.combustible))fail('Combustible inválido');
 const active=currentOperation(db,now);
 if(body.jornada_clave!==undefined&&body.jornada_clave!==`${sid}|${active.fecha_operativa}|${active.jornada_id}`)fail('La jornada cambió. Actualice los datos de los móviles entrantes.',409);
 db.exec('BEGIN IMMEDIATE');try{
  const old=db.prepare('SELECT * FROM servicios_moviles WHERE estacion_id=? AND fecha=? AND jornada_id=? AND movil_id=?').get(sid,active.fecha_operativa,active.jornada_id,mobile.id);
  const service=saveService(db,user,{estacion_id:sid,fecha:active.fecha_operativa,jornada_id:active.jornada_id,movil_id:mobile.id,conductor:body.conductor.trim(),jefe_patrulla:body.jefe_patrulla.trim(),kilometraje_entrante:km,kilometraje_saliente:old?.kilometraje_saliente??null,observaciones:old?.observaciones||''},old?.id);
  db.prepare('UPDATE servicios_moviles SET combustible_entrante=? WHERE id=?').run(body.combustible,service.id);service.combustible_entrante=body.combustible;
  db.prepare('UPDATE moviles SET kilometraje=?,combustible=? WHERE id=?').run(km,body.combustible,mobile.id);
  db.exec('COMMIT');return {servicio:service,movil:{...mobile,kilometraje:km,combustible:body.combustible},contexto:active};
 }catch(error){db.exec('ROLLBACK');throw error}
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {detectShift} from '../lib/jornada-actual.js';

test('Clasificación de servidor: límites exactos y fecha operativa nocturna',()=>{
 for(const [local,shift,date] of [
  ['2026-10-28T00:00:00','Amanecida','2026-10-27'],
  ['2026-10-28T05:59:59','Amanecida','2026-10-27'],
  ['2026-10-28T06:00:00','Matutina','2026-10-28'],
  ['2026-10-28T13:59:59','Matutina','2026-10-28'],
  ['2026-10-28T14:00:00','Vespertina','2026-10-28'],
  ['2026-10-28T21:59:59','Vespertina','2026-10-28'],
  ['2026-10-28T22:00:00','Amanecida','2026-10-28'],
  ['2026-10-28T23:59:59','Amanecida','2026-10-28'],
  ['2027-01-01T01:00:00','Amanecida','2026-12-31'],
  ['2024-03-01T01:00:00','Amanecida','2024-02-29'],
  ['2025-03-01T01:00:00','Amanecida','2025-02-28']
 ]){const result=detectShift(new Date(local+'-05:00'));assert.equal(result.jornada_nombre,shift,local);assert.equal(result.fecha_operativa,date,local);assert.equal(result.zona_horaria,'America/Guayaquil');assert.equal(result.hora_local,local.slice(11))}
 // These are the same instant despite differing caller time zones.
 assert.deepEqual(detectShift(new Date('2026-10-28T20:00:00+02:00')),detectShift(new Date('2026-10-28T13:00:00-05:00')));
});

test('Registro y diario usan reloj del servidor e ignoran asignaciones del cliente',async t=>{
 let instant=new Date('2026-10-28T13:59:59-05:00');
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>new Date(instant)});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`,r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username:'eas1',password:'eas-test-password'})}),cookie=r.headers.get('set-cookie').split(';')[0],csrf=(await r.json()).csrf;
 async function call(path,method='GET',body){const r=await fetch(base+path,{method,headers:{cookie,'x-csrf-token':csrf},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 const payload={actividad_id:1,movil_id:null,fecha:'1999-01-01',jornada_id:999,hora:'01:00',estacion_id:1};
 assert.equal((await call('registros','POST',payload)).status,200);let first=db.prepare('SELECT * FROM registros WHERE id=1').get();assert.equal(first.fecha,'2026-10-28');assert.equal(first.jornada_id,1);assert.equal(first.hora,'01:00:00');assert.equal(first.creado_en,instant.toISOString());
 const official=(await call('jornada-actual')).data;assert.equal(official.jornada.hora_fin,'14:30');assert.equal(official.jornada_id,1);assert.equal((await call('consolidados/diario')).data.total_registros,1);
 instant=new Date('2026-10-28T14:00:00-05:00');assert.equal((await call('jornada-actual')).data.jornada_id,2);assert.equal((await call('consolidados/diario')).data.total_registros,0);assert.equal((await call('registros','POST',payload)).status,200);
 assert.equal(db.prepare('SELECT jornada_id FROM registros WHERE id=2').get().jornada_id,2);
 instant=new Date('2026-10-28T22:00:00-05:00');await call('registros','POST',payload);
 instant=new Date('2026-10-29T00:01:00-05:00');await call('registros','POST',payload);
 let current=(await call('consolidados/diario')).data;assert.equal(current.fecha,'2026-10-28');assert.equal(current.jornada_id,3);assert.equal(current.total_registros,2);
 assert.equal(db.prepare('SELECT fecha FROM registros WHERE id=4').get().fecha,'2026-10-28');
 instant=new Date('2026-10-29T06:00:00-05:00');current=(await call('consolidados/diario')).data;assert.equal(current.fecha,'2026-10-29');assert.equal(current.jornada_id,1);assert.equal(current.total_registros,0);
 const before=db.prepare('SELECT * FROM registros ORDER BY id').all();
 assert.equal((await call('consolidados/diario?fecha=2026-10-28&jornada_id=3')).data.total_registros,2);assert.equal((await call('consolidados/diario?fecha=2026-10-28&jornada_id=1')).data.total_registros,1);
 assert.deepEqual(db.prepare('SELECT * FROM registros ORDER BY id').all(),before);
 assert.equal((await call('registros/1','PUT',{...payload,fecha:'2026-10-29',jornada_id:3,detalle:'Edición posterior',hora:'23:00'})).status,200);
 first=db.prepare('SELECT * FROM registros WHERE id=1').get();assert.equal(first.fecha,'2026-10-28');assert.equal(first.jornada_id,1);assert.equal(first.detalle,'Edición posterior');assert.equal(first.hora,'23:00:00');assert.equal(first.creado_en,before[0].creado_en);
 // An earlier unclassified record also remains unclassified after an edit.
 db.prepare('INSERT INTO registros(fecha,movil_id,actividad_id,actividad_nombre,estacion_id,usuario_id) VALUES(?,?,?,?,?,?)').run('2020-01-01',null,1,'OPERATIVOS',1,2);
 const legacy=db.prepare('SELECT MAX(id) AS id FROM registros').get().id;await call('registros/'+legacy,'PUT',{...payload,detalle:'Histórico'});assert.equal(db.prepare('SELECT jornada_id FROM registros WHERE id=?').get(legacy).jornada_id,null);assert.equal(db.prepare('SELECT fecha FROM registros WHERE id=?').get(legacy).fecha,'2020-01-01');
 const unauth=await fetch(base+'jornada-actual');assert.equal(unauth.status,401);
});

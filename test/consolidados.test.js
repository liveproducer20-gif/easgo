import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,initialActivities} from '../server.js';
import {ecuadorDate,reportPeriod,validateReportDate} from '../lib/consolidados.js';
import {todayEcuador,isoWeek,weekMonday,barChart} from '../public/consolidados.js';

async function fixture(t){
 let serverTime=new Date('2026-10-28T17:00:00Z');const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>new Date(serverTime)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(name,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username:name,password})});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(auth,url,method='GET',body){const r=await fetch(base+url,{method,headers:{cookie:auth?.cookie||'','x-csrf-token':auth?.csrf||''},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 await call(admin,'estaciones','POST',{nombre:'OTRA'});
 for(const [numero,estacion_id] of [['01',1],['02',1],['03',2]])assert.equal((await call(admin,'moviles','POST',{placa:'GAB12'+numero,numero,kilometraje:0,combustible:'Lleno',estacion_id})).status,200);
 async function record(fecha,movil_id=1,actividad_id=1,estacion_id=1){serverTime=new Date(fecha+'T17:00:00Z');assert.equal((await call(admin,'registros','POST',{jornada_id:1,fecha,movil_id,actividad_id,estacion_id,detalle:'Prueba de consolidado'})).status,200);return db.prepare('SELECT MAX(id) AS id FROM registros').get().id}
 async function report(type,fecha,auth=eas,filter=''){const r=await call(auth,`consolidados/${type}?fecha=${fecha}${filter}`);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.cache,'no-store');assert.equal(r.data.actividades.reduce((n,a)=>n+a.cantidad,0),r.data.total_registros);assert.equal(r.data.totales_diarios.reduce((n,d)=>n+d.cantidad,0),r.data.total_registros);return r.data}
 return {db,call,record,report,admin,eas};
}

test('Consolidados diarios y semanales: datos exactos, ceros, móviles y límites',async t=>{
 const {call,record,report,admin}=await fixture(t);
 await record('2026-10-25'); // Domingo anterior: fuera del período.
 await record('2026-10-26');await record('2026-10-26');await record('2026-10-26',2,2);
 await record('2026-10-27',1,2);await record('2026-11-01',2,3);
 await record('2026-11-02'); // Lunes siguiente: fuera del período.
 await record('2026-10-26',3,1,2); // Otra estación.
 const daily=await report('diario','2026-10-26');assert.equal(daily.estacion.nombre,'URDESA');assert.equal(daily.total_registros,3);assert.equal(daily.moviles_participantes,2);assert.deepEqual(daily.actividades.map(a=>a.nombre),initialActivities);assert.deepEqual(daily.actividades.slice(0,3).map(a=>a.cantidad),[2,1,0]);
 const weekly=await report('semanal','2026-10-28');assert.equal(weekly.inicio,'2026-10-26');assert.equal(weekly.fin,'2026-11-01');assert.equal(weekly.total_registros,5);assert.equal(weekly.moviles_participantes,2);assert.equal(weekly.totales_diarios.length,7);assert.deepEqual(weekly.totales_diarios.map(d=>d.cantidad),[3,1,0,0,0,0,1]);
 assert.equal((await report('semanal','2026-11-01')).total_registros,5);
 assert.equal((await report('diario','2026-10-26',admin)).total_registros,4);
 assert.equal((await report('semanal','2026-10-26',admin,'&estacion_id=2')).total_registros,1);
 const empty=await report('diario','2026-10-30');assert.equal(empty.total_registros,0);assert.equal(empty.moviles_participantes,0);assert.equal(empty.actividades.length,14);assert.ok(empty.actividades.every(a=>a.cantidad===0));
 const emptyWeek=await report('semanal','2027-01-04');assert.equal(emptyWeek.total_registros,0);assert.equal(emptyWeek.totales_diarios.length,7);assert.ok(emptyWeek.totales_diarios.every(d=>d.cantidad===0&&d.moviles===0));
});

test('Consolidados reflejan edición, eliminación y catálogo desactivado o ampliado',async t=>{
 const {db,call,record,report,admin,eas}=await fixture(t);
 const id=await record('2026-10-26',1,1);await record('2026-10-26',1,1);
 await call(admin,'actividades/1','PUT',{nombre:'OPERATIVOS RENOMBRADOS',estado:0});
 assert.equal((await report('diario','2026-10-26')).actividades[0].cantidad,2);
 assert.equal((await call(eas,'registros','POST',{fecha:'2026-10-26',movil_id:1,actividad_id:1,estacion_id:1})).status,400);
 assert.equal((await call(eas,`registros/${id}`,'PUT',{fecha:'2026-10-27',movil_id:2,actividad_id:2,estacion_id:1})).status,200);
 const monday=await report('diario','2026-10-26'),tuesday=await report('diario','2026-10-27');assert.equal(monday.total_registros,2);assert.equal(monday.actividades[0].cantidad,1);assert.equal(tuesday.total_registros,0);assert.equal(monday.actividades[1].cantidad,1);assert.equal((await report('semanal','2026-10-27')).moviles_participantes,2);
 assert.equal((await call(eas,`registros/${id}`,'DELETE')).status,200);assert.equal((await report('diario','2026-10-27')).total_registros,0);assert.equal((await report('semanal','2026-10-27')).moviles_participantes,1);
 await call(admin,'actividades','POST',{nombre:'ACTIVIDAD ADICIONAL'});const extra=db.prepare('SELECT id FROM actividades WHERE nombre=?').get('ACTIVIDAD ADICIONAL').id;
 await record('2026-10-26',2,extra);await call(admin,`actividades/${extra}`,'PUT',{nombre:'ACTIVIDAD ADICIONAL',estado:0});
 const expanded=await report('diario','2026-10-26');assert.equal(expanded.actividades.length,15);assert.equal(expanded.total_registros,2);assert.equal(expanded.actividades.at(-1).cantidad,1);
 assert.equal((await call(admin,'actividades/14','DELETE')).status,200);const deletedInitial=await report('diario','2026-10-26');assert.ok(!deletedInitial.actividades.some(a=>a.id===14));assert.equal(deletedInitial.actividades.length,14);
 assert.equal((await call(admin,'actividades/1','DELETE')).status,409);
 assert.equal((await call(admin,'consolidados/diario?fecha=2026-10-26','POST',{})).status,405);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM registros').get().n,2);
});

test('Seguridad de consolidados: sesión, filtros, fechas y acceso por estación',async t=>{
 const {call,record,report,admin,eas}=await fixture(t);await record('2026-10-26',3,1,2);
 for(const type of ['diario','semanal']){
  assert.equal((await call(null,`consolidados/${type}?fecha=2026-10-26`)).status,401);
  assert.equal((await call(eas,`consolidados/${type}?fecha=2026-10-26&estacion_id=2`)).status,403);
  assert.equal((await report(type,'2026-10-26',eas,'&estacion_id=1')).total_registros,0);
  assert.equal((await report(type,'2026-10-26',admin,'&estacion_id=2')).total_registros,1);
  assert.equal((await call(admin,`consolidados/${type}?fecha=2026-10-26&estacion_id=999`)).status,404);
  for(const filter of ['','0','-1','1 OR 1=1','1.0','all','NaN'])assert.equal((await call(eas,`consolidados/${type}?fecha=2026-10-26&estacion_id=${encodeURIComponent(filter)}`)).status,400);
  assert.equal((await call(eas,`consolidados/${type}?fecha=2026-10-26&estacion_id=1&estacion_id=2`)).status,400);
  for(const date of ['','2026-02-30','2026-13-01','2026-2-01','2026-10-26T00:00:00Z','bad'])assert.equal((await call(eas,`consolidados/${type}?fecha=${encodeURIComponent(date)}`)).status,400);
  assert.equal((await call(eas,`consolidados/${type}?fecha=2026-10-26&fecha=2026-10-27`)).status,400);
  const today=await call(eas,`consolidados/${type}`);assert.equal(today.status,200);const context=(await call(eas,'jornada-actual')).data;assert.equal(today.data.fecha,type==='diario'?context.fecha_operativa:context.fecha_local);assert.equal(today.data.zona_horaria,'America/Guayaquil');
 }
 // The parameter does not override the station authenticated in the session.
 assert.equal((await report('diario','2026-10-26',eas,'&estacion=2&usuario_id=1')).total_registros,0);
});

test('Fechas de Ecuador y semanas ISO en cambios de año',()=>{
 for(const [instant,expected] of [['2026-10-28T04:59:59Z','2026-10-27'],['2026-10-28T05:00:00Z','2026-10-28']]){assert.equal(ecuadorDate(new Date(instant)),expected);assert.equal(todayEcuador(new Date(instant)),expected)}
 assert.equal(reportPeriod('semanal','2027-01-01').inicio,'2026-12-28');assert.equal(reportPeriod('semanal','2027-01-01').fin,'2027-01-03');
 assert.equal(isoWeek('2021-01-01'),'2020-W53');assert.equal(weekMonday('2020-W53'),'2020-12-28');assert.equal(weekMonday('2026-W44'),'2026-10-26');assert.throws(()=>weekMonday('2021-W53'));assert.throws(()=>weekMonday('2026-W00'));
 assert.equal(validateReportDate('2024-02-29'),'2024-02-29');assert.throws(()=>validateReportDate('2025-02-29'));
 const chart=barChart([{fecha:'2026-10-26',cantidad:0}],x=>x);assert.ok(!chart.includes('NaN'));assert.ok(chart.includes('height="0"'));assert.ok(chart.includes('role="img"'));
});

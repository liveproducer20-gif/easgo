import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,initialActivities} from '../server.js';
test('Fase 1: permisos, móviles, actividades e históricos',async()=>{
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(auth,url,method='GET',body){const r=await fetch(base+url,{method,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 assert.equal((await call(eas,'estaciones')).data[0].nombre,'URDESA');assert.deepEqual((await call(eas,'moviles')).data,[]);assert.deepEqual((await call(eas,'actividades')).data.map(a=>a.nombre),initialActivities);
 assert.equal((await call(eas,'actividades','POST',{nombre:'NO'})).status,403);assert.equal((await call(eas,'actividades?all')).status,403);
 await call(admin,'estaciones','POST',{nombre:'OTRA'});assert.equal((await call(eas,'estaciones')).data.length,1);
 const mobile={placa:'GAB-1234',numero:'01',kilometraje:0,combustible:'Lleno',estacion_id:1};assert.equal((await call(eas,'moviles','POST',{...mobile,estacion_id:2})).status,403);
 assert.equal((await call(eas,'moviles','POST',mobile)).status,200);assert.equal((await call(eas,'moviles','POST',mobile)).status,409);
 assert.equal((await call(eas,'moviles','POST',{...mobile,placa:'GAB9999',numero:'02',kilometraje:-1})).status,400);
 await call(admin,'moviles','POST',{...mobile,placa:'GAB9998',numero:'03',estacion_id:2});assert.equal((await call(eas,'moviles')).data.length,1);
 assert.equal((await call(eas,'moviles/2','PUT',mobile)).status,403);
 await call(admin,'actividades','POST',{nombre:'NUEVA'});const activity=(await call(eas,'actividades')).data.at(-1);assert.equal(activity.nombre,'NUEVA');
 const record={jornada_id:1,fecha:'2026-10-27',movil_id:1,actividad_id:activity.id,estacion_id:1,detalle:'Prueba'};assert.equal((await call(eas,'registros','POST',record)).status,200);
 const first=(await call(eas,'registros')).data[0];
 assert.match(first.hora,/^\d{2}:\d{2}:\d{2}$/);
 assert.equal(first.hora,new Intl.DateTimeFormat('en-GB',{timeZone:'America/Guayaquil',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(first.creado_en)));
 assert.equal((await call(eas,'registros/1','PUT',{...record,ubicacion:'Av. Las Monjas y Víctor Emilio Estrada',hora:'00:00:00',creado_en:'2000-01-01T00:00:00Z'})).status,200);
 const edited=(await call(eas,'registros')).data[0];assert.equal(edited.ubicacion,'Av. Las Monjas y Víctor Emilio Estrada');assert.equal(edited.hora,'00:00:00');assert.equal(edited.creado_en,first.creado_en);
 assert.equal((await call(eas,'registros/1','PUT',{...record,ubicacion:'x'.repeat(2001)})).status,400);
 assert.equal((await call(eas,'registros','POST',{...record,movil_id:2})).status,403);
 await call(admin,'registros','POST',{...record,movil_id:2,estacion_id:2});assert.equal((await call(eas,'registros')).data.length,1);assert.equal((await call(eas,'registros/2','PUT',record)).status,403);
 await call(admin,`actividades/${activity.id}`,'PUT',{nombre:'RENOMBRADA',estado:0});assert.equal((await call(eas,'actividades')).data.some(a=>a.id===activity.id),false);assert.equal((await call(eas,'registros')).data[0].actividad_nombre,'NUEVA');
 assert.equal((await call(eas,'registros','POST',record)).status,400);assert.equal((await call(eas,'registros/1','PUT',{...record,detalle:'Editado'})).status,200);assert.equal((await call(admin,`actividades/${activity.id}`,'DELETE')).status,409);
 await call(admin,`actividades/${activity.id}`,'PUT',{nombre:'RENOMBRADA',estado:1});assert.equal((await call(eas,'actividades')).data.some(a=>a.id===activity.id),true);
 const r=await fetch(base+'moviles',{method:'POST',headers:{cookie:eas.cookie},body:JSON.stringify(mobile)});assert.equal(r.status,403);
 assert.equal((await fetch(base+'registros')).status,401);
 assert.equal(db.prepare('SELECT ubicacion FROM registros WHERE id=1').get().ubicacion,edited.ubicacion);
 const location=await call(eas,'ubicaciones','POST',{nombre:'Parque de Urdesa',estacion_id:1});assert.equal(location.status,201);
 assert.equal((await call(eas,'ubicaciones','POST',{nombre:' parque de urdesa ',estacion_id:1})).status,409);
 assert.equal((await call(eas,'ubicaciones','POST',{nombre:'Otra estación',estacion_id:2})).status,403);
 const other=await call(admin,'ubicaciones','POST',{nombre:'Parque externo',estacion_id:2});assert.equal(other.status,201);
 assert.equal((await call(eas,'ubicaciones')).data.length,1);
 assert.equal((await call(eas,'registros/1','PUT',{...record,ubicacion_id:other.data.id})).status,403);
 assert.equal((await call(eas,'registros/1','PUT',{...record,ubicacion_id:location.data.id,hora:'08:15'})).status,200);
 const located=(await call(eas,'registros')).data[0];assert.equal(located.ubicacion,'Parque de Urdesa');assert.equal(located.hora,'08:15:00');assert.equal(located.creado_en,first.creado_en);
 assert.equal((await call(eas,'registros/1','PUT',{...record,hora:'24:00'})).status,400);
 assert.equal((await call(eas,'registros/1','PUT',{...record,hora:'12:60'})).status,400);
 assert.equal((await call(eas,'registros/1','PUT',record)).status,200);assert.equal((await call(eas,'registros')).data[0].hora,'08:15:00');
 assert.equal((await call(eas,'registros/2','DELETE')).status,403);
 assert.equal((await call(eas,'registros/1','DELETE')).status,200);assert.equal((await call(eas,'registros')).data.length,0);
 assert.equal((await call(eas,'registros/1','DELETE')).status,404);
 assert.equal((await call(admin,'registros/2','DELETE')).status,200);
 assert.equal((await call(eas,'ubicaciones')).data.length,1);
 }finally{await new Promise(r=>server.close(r));db.close()}
});

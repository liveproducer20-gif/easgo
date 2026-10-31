import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {initializeColors} from '../lib/colores.js';

test('Colores persistidos: administrador configura actividades y EAS; usuarios solo consultan su ámbito',async t=>{
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>new Date('2026-10-28T15:00:00Z')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const response=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {cookie:response.headers.get('set-cookie').split(';')[0],csrf:(await response.json()).csrf}}
 async function call(auth,path,method='GET',body){const response=await fetch(base+path,{method,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 const counts=()=>Object.fromEntries(['actividades','estaciones','registros'].map(table=>[table,db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n]));
 const beforeEdit=counts();
 let activities=(await call(admin,'actividades?all')).data;
 assert.equal(activities.length,14);assert.equal(new Set(activities.map(a=>a.color)).size,14);
 assert.equal((await call(admin,'actividades/1','PUT',{nombre:'OPERATIVOS',estado:1,color:'#a23c99'})).status,200);
 assert.equal((await call(admin,'estaciones/1','PUT',{nombre:'URDESA',color:'#25813B'})).status,200);
 assert.deepEqual(counts(),beforeEdit,'Editar solo actualiza: no crea actividades, estaciones ni registros');
 assert.equal((await call(admin,'estaciones/999999','PUT',{nombre:'INEXISTENTE',color:'#25813B'})).status,404);
 assert.equal((await call(admin,'actividades/999999','PUT',{nombre:'INEXISTENTE',estado:1,color:'#25813B'})).status,404);
 assert.deepEqual(counts(),beforeEdit,'Un ID inexistente nunca crea otro registro');
 initializeColors(db);assert.equal(db.prepare('SELECT color FROM actividades WHERE id=1').get().color,'#A23C99');
 assert.equal((await call(eas,'estaciones')).data[0].color,'#25813B');
 for(const color of ['red','#123','#12345678','#GGGGGG','url(x)',null,123]){
  assert.equal((await call(admin,'actividades/1','PUT',{nombre:'OPERATIVOS',estado:1,color})).status,400);
  assert.equal((await call(admin,'estaciones/1','PUT',{color})).status,400);
 }
 assert.equal((await call(eas,'actividades/1','PUT',{nombre:'OPERATIVOS',estado:1,color:'#FFFFFF'})).status,403);
 assert.equal((await call(eas,'estaciones/1','PUT',{color:'#FFFFFF'})).status,403);
 assert.equal((await call(eas,'estaciones','POST',{nombre:'OTRA',color:'#FFFFFF'})).status,403);
 assert.equal((await call(admin,'estaciones','POST',{nombre:'OTRA',color:'#C26900'})).status,201);
 assert.equal((await call(eas,'estaciones')).data.length,1);
 assert.equal((await call(eas,'consolidados/semanal?fecha=2026-10-28&estacion_id=2')).status,403);
 assert.equal((await call(eas,'registros','POST',{actividad_id:1,detalle:'Prueba de colores',ubicacion:'URDESA'})).status,200);
 // Omitted colors preserve configuration for older clients and historical use.
 assert.equal((await call(admin,'actividades/1','PUT',{nombre:'OPERATIVOS',estado:0})).status,200);
 const report=(await call(eas,'consolidados/semanal?fecha=2026-10-28')).data;
 assert.equal(report.total_registros,1);assert.equal(report.actividades[0].color,'#A23C99');assert.equal(report.estacion.color,'#25813B');
 assert.equal((await call(eas,'registros')).data[0].actividad_color,'#A23C99');
 assert.equal((await call(admin,'actividades/1','DELETE')).status,409);
 assert.equal((await call(admin,'actividades','POST',{nombre:'NUEVA',color:'#123ABC'})).status,200);
 assert.equal((await call(admin,'actividades?all')).data.at(-1).color,'#123ABC');
 assert.throws(()=>db.prepare('UPDATE actividades SET color=? WHERE id=1').run('#xyzxyz'));
});

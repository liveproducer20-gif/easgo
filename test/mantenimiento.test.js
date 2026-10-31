import {test} from 'node:test';
import assert from 'node:assert/strict';
import {oilMaintenance} from '../lib/mantenimiento.js';
import {createApp} from '../server.js';

test('Cambio de aceite: próximos múltiplos de 5000, umbral de 500 y kilometraje exacto',()=>{
 for(const [km,next,remaining,alert,status] of [[0,5000,5000,false,'programado'],[4499,5000,501,false,'programado'],[4500,5000,500,true,'proximo'],[4999,5000,1,true,'proximo'],[5000,5000,0,true,'corresponde'],[5001,10000,4999,false,'programado'],[39000,40000,1000,false,'programado'],[39550,40000,450,true,'proximo'],[40000,40000,0,true,'corresponde'],[40001,45000,4999,false,'programado'],[44999.5,45000,.5,true,'proximo']]){
  const result=oilMaintenance(km);assert.equal(result.proximo_km,next);assert.equal(result.km_restantes,remaining);assert.equal(result.alerta,alert);assert.equal(result.estado,status);
 }
 for(const km of [-1,NaN,Infinity])assert.throws(()=>oilMaintenance(km));
});

test('Alertas por estación: solo móviles autorizados y actualización inmediata al editar kilometraje',async t=>{
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(auth,path,method='GET',body){const r=await fetch(base+path,{method,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 await call(admin,'estaciones','POST',{nombre:'OTRA'});
 const own={placa:'GAB1234',numero:'112',kilometraje:39550,combustible:'Lleno',estacion_id:1};
 assert.equal((await call(admin,'moviles','POST',own)).status,200);
 assert.equal((await call(admin,'moviles','POST',{...own,placa:'GAB5678',numero:'113',kilometraje:4990,estacion_id:2})).status,200);
 assert.equal((await call(admin,'moviles')).data.length,2);
 let vehicles=(await call(eas,'moviles')).data;assert.equal(vehicles.length,1);assert.equal(vehicles[0].mantenimiento_aceite.km_restantes,450);
 assert.equal((await call(eas,'moviles/2','PUT',{...own,estacion_id:2})).status,403);
 for(const [km,expected] of [[39000,false],[39500,true],[40000,true],[40001,false]]){
  assert.equal((await call(eas,'moviles/1','PUT',{...own,kilometraje:km})).status,200);
  vehicles=(await call(eas,'moviles')).data;assert.equal(vehicles[0].mantenimiento_aceite.alerta,expected);
 }
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM moviles').get().n,2);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM registros').get().n,0);
});

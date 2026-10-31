import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('Radiooperadores: estación, selección entrante y nueva sesión',async()=>{
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(auth,url,method='GET',body){const r=await fetch(base+url,{method,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
  const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
  assert.equal((await call(eas,'me')).data.radiooperador,null);
  assert.deepEqual((await call(eas,'radiooperadores')).data,[]);
  assert.equal((await call(eas,'radiooperadores','POST',{nombre:'   '})).status,400);
  assert.equal((await call(eas,'radiooperadores','POST',{nombre:'x'.repeat(151)})).status,400);
  const created=await call(eas,'radiooperadores','POST',{nombre:' Ana   Pérez '});assert.equal(created.status,201);assert.equal(created.data.nombre,'Ana Pérez');assert.equal(created.data.estacion_id,1);
  assert.equal((await call(eas,'radiooperadores','POST',{nombre:'ANA PÉREZ'})).status,409);
  await call(admin,'estaciones','POST',{nombre:'OTRA'});
  const external=await call(admin,'radiooperadores','POST',{nombre:'Ana Pérez',estacion_id:2});assert.equal(external.status,201);
  assert.equal((await call(eas,'radiooperadores','POST',{nombre:'Luis',estacion_id:2})).status,403);
  assert.equal((await call(eas,'radiooperadores')).data.length,1);assert.equal((await call(admin,'radiooperadores')).data.length,2);
  assert.equal((await call(eas,'radiooperador-entrante','POST',{radiooperador_id:external.data.id})).status,403);
  assert.equal((await call(eas,'radiooperador-entrante','POST',{radiooperador_id:999})).status,400);
  assert.equal((await call(eas,'radiooperador-entrante','POST',{radiooperador_id:created.data.id})).status,200);
  assert.equal((await call(eas,'me')).data.radiooperador.nombre,'Ana Pérez');
  assert.equal((await call(eas,'me')).data.radiooperador.id,created.data.id);
  assert.equal((await call(admin,'radiooperador-entrante','POST',{radiooperador_id:external.data.id})).status,200);
  const noCsrf=await fetch(base+'radiooperador-entrante',{method:'POST',headers:{cookie:eas.cookie},body:JSON.stringify({radiooperador_id:created.data.id})});assert.equal(noCsrf.status,403);
  await call(eas,'logout','POST');assert.equal((await call(eas,'me')).status,401);
  const next=await login('eas1','eas-test-password');assert.equal((await call(next,'me')).data.radiooperador,null);assert.equal((await call(next,'radiooperadores')).data[0].nombre,'Ana Pérez');
  await call(next,'radiooperador-entrante','POST',{radiooperador_id:created.data.id});
  db.prepare('UPDATE usuarios SET estacion_id=2 WHERE username=?').run('eas1');assert.equal((await call(next,'me')).data.radiooperador,null);
 }finally{await new Promise(r=>server.close(r));db.close()}
});

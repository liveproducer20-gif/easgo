import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('Crear administradores: rol explícito, acceso global, sin estación obligatoria y sin escalamiento EAS',async t=>{
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const response=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],csrf:(await response.json()).csrf}}
 async function call(auth,path,method='GET',body){const response=await fetch(base+path,{method,headers:{cookie:auth.cookie||'','x-csrf-token':auth.csrf||''},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 const body={username:'nuevo-admin',password:'new-admin-password',rol:'admin'};
 assert.equal((await call(eas,'usuarios','POST',body)).status,403);
 assert.equal((await call({...admin,csrf:'incorrecto'},'usuarios','POST',body)).status,403);
 assert.equal((await call(admin,'usuarios','POST',body)).status,201);
 const saved=db.prepare('SELECT id,rol,estacion_id FROM usuarios WHERE username=?').get(body.username);
 assert.equal(saved.rol,'admin');assert.equal(saved.estacion_id,null);
 const another=await login(body.username,body.password);assert.equal(another.status,200);
 assert.equal((await call(another,'usuarios')).status,200);
 assert.equal((await call(another,'estaciones','POST',{nombre:'SEGUNDA'})).status,201);
 assert.equal((await call(another,'estaciones')).data.length,2);
 assert.equal((await call(another,'usuarios/'+saved.id,'PUT',{estacion_id:''})).status,200);
 assert.equal((await call(eas,'usuarios/2','PUT',{rol:'admin',estacion_id:1})).status,403);
 assert.equal((await call(admin,'usuarios/2','PUT',{rol:'admin',estacion_id:1})).status,400);
 for(const rol of ['superadmin','',null,{},['admin']])assert.equal((await call(admin,'usuarios','POST',{...body,username:'invalid',rol})).status,400);
 assert.equal((await call(admin,'usuarios','POST',{...body,username:'weak',password:'short'})).status,400);
 assert.equal((await call(admin,'usuarios','POST',body)).status,409);
 assert.equal((await call(admin,'usuarios','POST',{username:'sin-estacion',password:body.password})).status,400);
 assert.equal((await call(admin,'usuarios','POST',{username:'usuario-eas',password:body.password,estacion_id:1})).status,201);
 assert.equal(db.prepare('SELECT rol FROM usuarios WHERE username=?').get('usuario-eas').rol,'eas');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('Eliminar usuarios: solo administrador, sin acceso ni sesiones y conservando históricos',async t=>{
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>new Date('2026-10-28T15:00:00Z')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const response=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});const data=await response.json();return {status:response.status,cookie:response.headers.get('set-cookie')?.split(';')[0],csrf:data.csrf}}
 async function call(auth,path,method='GET',body){const response=await fetch(base+path,{method,headers:{cookie:auth.cookie||'','x-csrf-token':auth.csrf||''},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password'),secondSession=await login('eas1','eas-test-password');
 const own=db.prepare("SELECT id FROM usuarios WHERE username='admin'").get().id,target=db.prepare("SELECT id FROM usuarios WHERE username='eas1'").get().id;
 assert.equal((await call(eas,'usuarios/'+own,'DELETE')).status,403);
 assert.equal((await call(admin,'usuarios/'+own,'DELETE')).status,409);
 assert.equal((await call(admin,'usuarios/999999','DELETE')).status,404);
 assert.equal((await call({...admin,csrf:'incorrecto'},'usuarios/'+target,'DELETE')).status,403);
 assert.equal((await call(eas,'registros','POST',{actividad_id:1,detalle:'Histórico del usuario',ubicacion:'URDESA'})).status,200);
 const before=db.prepare('SELECT * FROM registros').all();
 assert.equal((await call(admin,'usuarios/'+target,'DELETE')).status,200);
 assert.deepEqual(db.prepare('SELECT * FROM registros').all(),before);
 assert.ok(db.prepare('SELECT eliminado_en FROM usuarios WHERE id=?').get(target).eliminado_en);
 assert.equal((await call(admin,'usuarios')).data.some(u=>u.id===target),false);
 assert.equal((await login('eas1','eas-test-password')).status,401);
 assert.equal((await call(eas,'me')).status,401);assert.equal((await call(secondSession,'registros')).status,401);
 assert.equal((await call(admin,'usuarios/'+target,'PUT',{estacion_id:1})).status,404);
 assert.equal((await call(admin,'usuarios/'+target,'DELETE')).status,404);
 assert.equal((await call(admin,'usuarios','POST',{username:'eas1',password:'eas-test-password',estacion_id:1})).status,409);
 const consolidate=(await call(admin,'consolidados/semanal?fecha=2026-10-28&estacion_id=1')).data;
 assert.equal(consolidate.total_registros,1);
 // Another administrator can be removed, but the acting administrator remains.
 db.prepare("INSERT INTO usuarios(username,password,rol) SELECT 'otro-admin',password,'admin' FROM usuarios WHERE id=?").run(own);
 const other=db.prepare("SELECT id FROM usuarios WHERE username='otro-admin'").get().id;
 assert.equal((await call(admin,'usuarios/'+other,'DELETE')).status,200);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol='admin' AND eliminado_en IS NULL").get().n,1);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('Todos los móviles: cola persistida, cierre obligatorio, cambios 06/14/22 y conservación histórica',async t=>{
 let now=new Date('2026-10-31T10:59:59Z');
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>new Date(now)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(auth,path,method='GET',body){const r=await fetch(base+path,{method,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 await call(admin,'estaciones','POST',{nombre:'OTRA'});
 for(const [numero,estacion_id] of [['112',1],['187',1],['188',2]])assert.equal((await call(admin,'moviles','POST',{numero,placa:'GAB'+numero,kilometraje:39550,combustible:'Lleno',estacion_id})).status,200);
 const operator=(await call(eas,'radiooperadores','POST',{nombre:'RADIO DE PRUEBA'})).data;
 await call(eas,'radiooperador-entrante','POST',{radiooperador_id:operator.id});
 let lastKey=null,lastRows=[];
 const periods=[['2026-10-31T10:59:59Z','2026-10-30','Amanecida'],['2026-10-31T11:00:00Z','2026-10-31','Matutina'],['2026-10-31T19:00:00Z','2026-10-31','Vespertina'],['2026-11-01T03:00:00Z','2026-10-31','Amanecida'],['2026-11-01T11:00:00Z','2026-11-01','Matutina']];
 for(const [index,[instant,date,shift]] of periods.entries()){
  now=new Date(instant);const status=(await call(eas,'servicio-entrante')).data;
  assert.equal(status.total,2);assert.deepEqual(status.pendientes,[1,2]);assert.equal(status.completo,false);
  assert.equal(status.contexto.fecha_operativa,date);assert.equal(status.contexto.jornada.nombre,shift);
  assert.equal((await call(eas,'jornada-actual')).data.ingreso_moviles.completo,false);
  assert.equal((await call(eas,'me')).data.servicio_entrante,false);
  assert.equal((await call(eas,'servicio-entrante/omitir','POST',{})).status,409);
  const body={movil_id:1,conductor:'Conductor '+index,jefe_patrulla:'Jefe '+index,kilometraje:39550+index,combustible:'3/4',jornada_clave:status.clave};
  if(lastKey)assert.equal((await call(eas,'servicio-entrante','POST',{...body,jornada_clave:lastKey})).status,409);
  const first=await call(eas,'servicio-entrante','POST',body);assert.equal(first.status,200);assert.deepEqual(first.data.ingreso_moviles.pendientes,[2]);assert.equal(first.data.ingreso_moviles.completados,1);
  assert.equal((await call(eas,'me')).data.servicio_entrante,false);
  assert.equal((await call(eas,'servicio-entrante/omitir','POST',{})).status,409);
  assert.equal((await call(eas,'servicio-entrante','POST',{...body,movil_id:3})).status,403);
  const second=await call(eas,'servicio-entrante','POST',{...body,movil_id:2,conductor:'Segundo conductor',combustible:'1/2'});
  assert.equal(second.status,200);assert.equal(second.data.ingreso_moviles.completo,true);
  assert.equal((await call(eas,'me')).data.servicio_entrante,true);
  assert.equal((await call(eas,'servicio-entrante/omitir','POST',{})).status,200);
  assert.equal((await call(eas,'jornada-actual')).data.ingreso_moviles.completo,true);
  const relogin=await login('eas1','eas-test-password');await call(relogin,'radiooperador-entrante','POST',{radiooperador_id:operator.id});assert.equal((await call(relogin,'servicio-entrante')).data.completo,true);
  for(const old of lastRows)assert.deepEqual(db.prepare('SELECT * FROM servicios_moviles WHERE id=?').get(old.id),old);
  lastRows=db.prepare('SELECT * FROM servicios_moviles ORDER BY id').all();lastKey=status.clave;
  assert.equal(lastRows.length,(index+1)*2);assert.ok(lastRows.every(r=>r.combustible_entrante));
 }
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM registros').get().n,0);
 await call(admin,'moviles','POST',{numero:'190',placa:'GAB190',kilometraje:100,combustible:'Lleno',estacion_id:1});
 const added=(await call(eas,'servicio-entrante')).data;assert.equal(added.completo,false);assert.equal(added.pendientes.length,1);
});

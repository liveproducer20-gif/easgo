import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';

test('Ingreso de móvil: servicio único, actualización atómica, ámbito EAS y fecha nocturna del servidor',async t=>{
 let now=new Date('2026-10-29T08:00:00Z');
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>new Date(now)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(auth,path,method='GET',body){const r=await fetch(base+path,{method,headers:{cookie:auth.cookie,'x-csrf-token':auth.csrf},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 await call(admin,'estaciones','POST',{nombre:'OTRA'});
 const mobile={placa:'GAB1234',numero:'112',kilometraje:39000,combustible:'Lleno',estacion_id:1};
 await call(admin,'moviles','POST',mobile);await call(admin,'moviles','POST',{...mobile,placa:'GAB5678',numero:'187',estacion_id:2});
 const entry={movil_id:1,conductor:'Conductor de prueba',jefe_patrulla:'Jefe de prueba',kilometraje:39550,combustible:'1/2',fecha:'1999-01-01',jornada_id:1};
 assert.equal((await call(eas,'servicio-entrante','POST',entry)).status,409);
 const operator=(await call(eas,'radiooperadores','POST',{nombre:'RADIO DE PRUEBA'})).data;
 await call(eas,'radiooperador-entrante','POST',{radiooperador_id:operator.id});
 assert.equal((await call(eas,'me')).data.servicio_entrante,false);
 const context=(await call(eas,'servicio-entrante')).data;assert.equal(context.moviles.length,1);assert.equal(context.contexto.fecha_operativa,'2026-10-28');assert.equal(context.contexto.jornada.nombre,'Amanecida');
 assert.equal((await call(eas,'servicio-entrante?estacion_id=2')).status,403);
 assert.equal((await call(eas,'servicio-entrante','POST',{...entry,estacion_id:2})).status,403);
 assert.equal((await call(eas,'servicio-entrante','POST',{...entry,movil_id:2})).status,403);
 assert.equal((await call({...eas,csrf:'incorrecto'},'servicio-entrante','POST',entry)).status,403);
 const result=await call(eas,'servicio-entrante','POST',entry);assert.equal(result.status,200);const service=result.data.servicio;
 assert.equal(service.fecha,'2026-10-28');assert.equal(service.jornada_id,context.contexto.jornada_id);
 assert.equal((await call(eas,'me')).data.movil_entrante_id,1);assert.equal((await call(eas,'me')).data.servicio_entrante,true);
 const savedMobile=(await call(eas,'moviles')).data[0];assert.equal(savedMobile.kilometraje,39550);assert.equal(savedMobile.combustible,'1/2');assert.equal(savedMobile.conductor,entry.conductor);assert.equal(savedMobile.jefe_patrulla,entry.jefe_patrulla);
 const daily=(await call(eas,'consolidados/diario?fecha=2026-10-28&jornada_id='+service.jornada_id)).data;
 assert.equal(daily.filas.length,1);assert.equal(daily.filas[0].conductor,entry.conductor);assert.equal(daily.filas[0].kilometraje_entrante,39550);assert.equal(daily.total_registros,0);
 db.prepare('UPDATE servicios_moviles SET kilometraje_saliente=40000,observaciones=? WHERE id=?').run('Conservar observación',service.id);
 const again=await call(eas,'servicio-entrante','POST',{...entry,kilometraje:39560});assert.equal(again.status,200);assert.equal(again.data.servicio.id,service.id);assert.equal(again.data.servicio.kilometraje_saliente,40000);assert.equal(again.data.servicio.observaciones,'Conservar observación');
 for(const bad of [{kilometraje:-1},{kilometraje:''},{conductor:' '},{jefe_patrulla:''},{combustible:'Vacío'},{kilometraje:41000}])assert.equal((await call(eas,'servicio-entrante','POST',{...entry,...bad})).status,400);
 assert.equal(db.prepare('SELECT kilometraje FROM moviles WHERE id=1').get().kilometraje,39560);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM servicios_moviles').get().n,1);
 await call(eas,'radiooperador-entrante','POST',{radiooperador_id:operator.id});assert.equal((await call(eas,'me')).data.servicio_entrante,true);
 const prefill=(await call(eas,'servicio-entrante')).data.moviles[0];assert.equal(prefill.servicio_id,service.id);assert.equal(prefill.kilometraje_entrante,39560);
 now=new Date('2026-10-29T11:00:00Z');assert.equal((await call(eas,'servicio-entrante','POST',{...entry,kilometraje:40001})).status,200);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM servicios_moviles').get().n,2);
 assert.equal(db.prepare('SELECT fecha FROM servicios_moviles WHERE id=?').get(service.id).fecha,'2026-10-28');
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM registros').get().n,0);
 // Re-entry after accidental logout can skip without touching existing data.
 const reentry=await login('eas1','eas-test-password');
 assert.equal((await call(reentry,'servicio-entrante/omitir','POST',{})).status,409);
 await call(reentry,'radiooperador-entrante','POST',{radiooperador_id:operator.id});
 const beforeSkip={mobiles:db.prepare('SELECT * FROM moviles').all(),services:db.prepare('SELECT * FROM servicios_moviles').all(),records:db.prepare('SELECT * FROM registros').all()};
 assert.equal((await call({...reentry,csrf:'incorrecto'},'servicio-entrante/omitir','POST',{})).status,403);
 assert.equal((await call(reentry,'servicio-entrante/omitir')).status,405);
 const skipped=await call(reentry,'servicio-entrante/omitir','POST',{});assert.equal(skipped.status,200);assert.equal(skipped.data.omitido,true);
 assert.equal((await call(reentry,'me')).data.servicio_entrante,true);
 assert.deepEqual({mobiles:db.prepare('SELECT * FROM moviles').all(),services:db.prepare('SELECT * FROM servicios_moviles').all(),records:db.prepare('SELECT * FROM registros').all()},beforeSkip);
 await call(reentry,'radiooperador-entrante','POST',{radiooperador_id:operator.id});assert.equal((await call(reentry,'me')).data.servicio_entrante,true);
 const fresh=await login('eas1','eas-test-password');assert.equal((await call(fresh,'me')).data.servicio_entrante,false);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp,initialActivities} from '../server.js';
async function fixture(t){
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close()});const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(name,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username:name,password})});return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(user,url,method='GET',body){const r=await fetch(base+url,{method,headers:{cookie:user?.cookie||'','x-csrf-token':user?.csrf||''},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');await call(admin,'estaciones','POST',{nombre:'OTRA'});
 const operator=(await call(admin,'radiooperadores','POST',{nombre:'ACM. CALDERÓN AGUIRRE JORGE',estaciones:[1],estado:1})).data;
 for(const [numero,sid] of [['01',1],['02',2]])await call(admin,'moviles','POST',{placa:'GAB12'+numero,numero,kilometraje:0,combustible:'Lleno',estacion_id:sid});
 const record=(fecha,activity=1,sid=1,n=1)=>{const s=db.prepare('INSERT INTO registros(fecha,movil_id,actividad_id,actividad_nombre,estacion_id,usuario_id) VALUES(?,?,?,?,?,?)'),a=db.prepare('SELECT nombre FROM actividades WHERE id=?').get(activity);for(let i=0;i<n;i++)s.run(fecha,sid,activity,a.nombre,sid,2)};
 const url=(type='diario',date='2026-10-28',sid=1,op=operator.id,action='vista-previa')=>`reportes/${type}/${action}?fecha=${date}&estacion_id=${sid}&radiooperador_id=${op}`;
 return {db,admin,eas,operator,call,record,url};
}

test('REPORTAR usa solo Administración de Actividades y refleja altas, nombres y bajas',async t=>{
 const {db,admin,eas,call,record,url}=await fixture(t);record('2026-10-28');
 const report=(await call(eas,url())).data;
 const catalog=(await call(admin,'actividades?all')).data;
 assert.deepEqual(report.actividades.map(a=>[a.id,a.nombre]),catalog.map(a=>[a.id,a.nombre]));assert.deepEqual(report.actividades.map(a=>a.nombre),initialActivities);
 assert.equal(report.definitivo,true);assert.ok(!report.texto.includes('BORRADOR'));assert.ok(!report.texto.includes('CLASIFICACIÓN'));
 assert.ok(report.texto.includes('*CIRCUITO EAS URDESA*'));assert.ok(report.texto.includes('*CONSOLIDADO RADIOPERADOR:*\nACM. CALDERÓN AGUIRRE JORGE'));assert.ok(report.texto.includes('*FECHA* : 28-10-2026'));assert.ok(report.texto.includes('*OPERATIVOS*\nTOTAL: 01'));assert.ok(report.texto.includes('*REQUERIMIENTOS*\nTOTAL: 00'));assert.ok(report.texto.endsWith('*NOVEDADES*\n- SIN NOVEDADES'));
 assert.equal((await call(eas,url('diario','2026-10-28',1,1,'generar'),'POST',{})).status,200);
 await call(admin,'actividades','POST',{nombre:'ACTIVIDAD NUEVA'});const extra=db.prepare('SELECT id FROM actividades WHERE nombre=?').get('ACTIVIDAD NUEVA').id;
 assert.equal((await call(eas,url())).data.actividades.at(-1).cantidad,0);record('2026-10-28',extra);
 const updated=(await call(eas,url())).data;assert.equal(updated.total_registros,2);assert.equal(updated.actividades.at(-1).cantidad,1);assert.ok(updated.texto.includes('*ACTIVIDAD NUEVA*\nTOTAL: 01'));
 await call(admin,'actividades/'+extra,'PUT',{nombre:'NOMBRE MODIFICADO',estado:0});const renamed=(await call(eas,url())).data;assert.ok(renamed.texto.includes('*NOMBRE MODIFICADO*\nTOTAL: 01'));assert.ok(!renamed.texto.includes('*ACTIVIDAD NUEVA*'));assert.equal(renamed.total_registros,2);
 await call(admin,'actividades/14','DELETE');const deleted=(await call(eas,url())).data;assert.ok(!deleted.actividades.some(a=>a.id===14));assert.equal(deleted.total_registros,2);
 assert.equal((await call(eas,'reportes/configuracion')).status,404);assert.equal((await call(admin,'reportes/configuracion')).status,404);
 assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('reporte_categorias','reporte_clasificacion','catalogo_inicial')").all(),[]);
});

test('REPORTAR: cantidades reales, mínimos de dos dígitos, edición, eliminación y semanas',async t=>{
 const {admin,eas,call,record,url}=await fixture(t);record('2026-10-28',1,1,120);record('2026-10-28',2,1,15);record('2026-10-28',3);record('2026-10-28',1,2,10);record('2026-11-01',1,1,2);record('2026-11-02',1,1,20);record('2026-10-25',1,1,30);
 let daily=(await call(eas,url())).data;assert.equal(daily.total_registros,136);assert.ok(daily.texto.includes('*OPERATIVOS*\nTOTAL: 120'));assert.ok(daily.texto.includes('*REQUERIMIENTOS*\nTOTAL: 15'));assert.ok(daily.texto.includes('*RETIROS TEMPORALES*\nTOTAL: 01'));
 const weekly=(await call(eas,url('semanal'))).data;assert.equal(weekly.total_registros,138);assert.ok(weekly.texto.includes('*FECHA* : 26-10-2026 AL 01-11-2026'));assert.equal(weekly.inicio,'2026-10-26');assert.equal(weekly.fin,'2026-11-01');
 await call(admin,'actividades/1','PUT',{nombre:'OPERATIVOS EDITADOS',estado:0});assert.equal((await call(eas,url())).data.total_registros,136);
 assert.equal((await call(eas,'registros/1','PUT',{fecha:'2026-10-29',movil_id:1,actividad_id:1,estacion_id:1})).status,200);assert.equal((await call(eas,url())).data.total_registros,136);
 assert.equal((await call(eas,'registros/2','DELETE')).status,200);daily=(await call(eas,url())).data;assert.equal(daily.total_registros,135);assert.equal(daily.actividades.reduce((sum,a)=>sum+a.cantidad,0),135);
 const empty=(await call(eas,url('diario','2026-10-20'))).data;assert.equal(empty.total_registros,0);assert.equal(empty.definitivo,true);assert.ok(empty.actividades.every(c=>c.cantidad===0));
});

test('Novedades: persistencia por estación y período, autor y concurrencia',async t=>{
 const {admin,eas,operator,call,url}=await fixture(t);
 const endpoint=url('diario','2026-10-28',1,operator.id,'novedades');const empty=await call(eas,endpoint);assert.equal(empty.data.version,0);
 const updated=await call(eas,endpoint,'PUT',{texto:'PC dañada no sirve\r\npantallas con problemas\n\n- Equipo pendiente',version:0});assert.equal(updated.status,200);assert.equal(updated.data.modificado_por,2);assert.equal(updated.data.modificado_por_nombre,'eas1');assert.equal(updated.data.version,1);assert.ok(updated.data.modificado_en.endsWith('Z'));
 assert.equal((await call(admin,endpoint,'PUT',{texto:'Sobrescribir',version:0})).status,409);
 const text=(await call(eas,url())).data.texto;assert.ok(text.includes('*NOVEDADES*\n- PC dañada no sirve\n- pantallas con problemas\n- Equipo pendiente'));
 assert.equal((await call(eas,url('diario','2026-10-29',1,1,'novedades'))).data.texto,'');
 const weekEndpoint=url('semanal','2026-10-28',1,1,'novedades');assert.equal((await call(eas,weekEndpoint,'PUT',{texto:'Resumen semanal',version:0})).status,200);assert.equal((await call(eas,url('semanal','2026-11-01',1,1,'novedades'))).data.texto,'Resumen semanal');assert.equal((await call(eas,url('semanal','2026-11-02',1,1,'novedades'))).data.texto,'');
 assert.equal((await call(admin,url('diario','2026-10-28',2,1,'novedades'))).data.texto,'');
 assert.equal((await call(eas,endpoint,'PUT',{texto:'x'.repeat(10001),version:1})).status,400);
 assert.equal((await call(admin,endpoint,'PUT',{texto:'',version:1})).status,200);assert.ok((await call(eas,url())).data.texto.endsWith('- SIN NOVEDADES'));
});

test('REPORTAR: permisos y radioperadores habilitados con varias estaciones',async t=>{
 const {admin,eas,operator,call,url}=await fixture(t);
 assert.equal((await call(null,url())).status,401);assert.equal((await call(eas,'reportes/configuracion')).status,404);assert.equal((await call(eas,'reportes/configuracion','PUT',{asignaciones:[]})).status,404);
 for(const action of ['vista-previa','generar','novedades'])assert.equal((await call(eas,url('diario','2026-10-28',2,1,action),action==='generar'?'POST':'GET',action==='generar'?{}:undefined)).status,403);
 assert.equal((await call(eas,url('diario','2026-10-28',2,1,'novedades'),'PUT',{texto:'No autorizado',version:0})).status,403);
 assert.equal((await call(eas,'radiooperadores/'+operator.id,'PUT',{nombre:'No autorizado',estado:0,estaciones:[1]})).status,403);
 assert.equal((await call(eas,'radiooperadores?all=1')).status,403);
 assert.equal((await call(admin,'radiooperadores/'+operator.id,'PUT',{nombre:'ACM. NOMBRE COMPLETO EDITADO',estado:1,estaciones:[1,2]})).status,200);
 assert.equal((await call(admin,url('diario','2026-10-28',2))).status,200);assert.ok((await call(eas,url())).data.texto.includes('ACM. NOMBRE COMPLETO EDITADO'));
 await call(admin,'radiooperadores/'+operator.id,'PUT',{nombre:operator.nombre,estado:0,estaciones:[1,2]});assert.equal((await call(eas,'radiooperadores')).data.length,0);assert.equal((await call(eas,url())).status,403);assert.equal((await call(eas,'radiooperador-entrante','POST',{radiooperador_id:operator.id})).status,403);
 await call(admin,'radiooperadores/'+operator.id,'PUT',{nombre:operator.nombre,estado:1,estaciones:[2]});assert.equal((await call(eas,url())).status,403);assert.equal((await call(admin,url('diario','2026-10-28',2))).status,200);
 assert.equal((await call(admin,'reportes/diario/vista-previa?fecha=2026-10-28&radiooperador_id=1')).status,400);
 assert.equal((await call(eas,url()+'&estacion_id=2')).status,400);assert.equal((await call(eas,url('diario','2026-02-30'))).status,400);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {reportPeriod} from '../lib/consolidados.js';
import {mondayDate} from '../public/consolidados.js';

async function fixture(t){
 let serverTime=new Date('2026-10-28T17:00:00Z');const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>new Date(serverTime)});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close()});const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(user,url,method='GET',body){const r=await fetch(base+url,{method,headers:{cookie:user?.cookie||'','x-csrf-token':user?.csrf||''},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');await call(admin,'estaciones','POST',{nombre:'OTRA'});
 for(const [numero,estacion_id] of [['01',1],['02',1],['03',2]])await call(admin,'moviles','POST',{placa:'GAB12'+numero,numero,kilometraje:0,combustible:'Lleno',estacion_id});
 const operator=(await call(admin,'radiooperadores','POST',{nombre:'Operador de Prueba',estaciones:[1]})).data;
 const record=async(jornada_id,movil_id=1,hora='14:15',fecha='2026-10-28',estacion_id=1)=>{const localHour=jornada_id===1?'13:59':jornada_id===2?'14:15':(Number(hora.slice(0,2))>=22||Number(hora.slice(0,2))<6?hora:'22:30');const instant=new Date(fecha+'T'+localHour+':00-05:00');if(jornada_id===3&&Number(localHour.slice(0,2))<6)instant.setUTCDate(instant.getUTCDate()+1);serverTime=instant;const body={fecha,jornada_id,movil_id,hora,actividad_id:1,estacion_id};const r=await call(admin,'registros','POST',body);assert.equal(r.status,200,JSON.stringify(r));return {id:db.prepare('SELECT MAX(id) AS id FROM registros').get().id,body}};
 const service={estacion_id:1,fecha:'2026-10-28',jornada_id:3,movil_id:1,conductor:'Conductor Uno',jefe_patrulla:'ACM Jefe Uno',kilometraje_entrante:1000,kilometraje_saliente:1030,observaciones:'En circulación'};
 return {db,admin,eas,call,record,service,operator};
}

test('Operatividad: filas por jornada/móvil, solapamientos, amanecida y SIN MÓVIL',async t=>{
 const {db,admin,eas,call,record,service,operator}=await fixture(t);
 const first=await record(1);await record(1);await record(2);await record(3,1,'23:55');await record(3,1,'00:20');await record(3,null,'01:00');
 await record(3,1,'00:20','2026-10-29');await record(1,3,'14:15','2026-10-28',2);
 db.prepare('INSERT INTO registros(fecha,movil_id,actividad_id,actividad_nombre,estacion_id,usuario_id) VALUES(?,?,?,?,?,?)').run('2026-10-28',1,1,'OPERATIVOS',1,2);
 assert.equal((await call(eas,'servicios','POST',service)).status,201);assert.equal((await call(eas,'servicios','POST',{...service,jornada_id:1,movil_id:2,kilometraje_entrante:100,kilometraje_saliente:110})).status,201);
 const data=(await call(eas,'consolidados/diario?fecha=2026-10-28')).data;
 assert.equal(data.total_registros,7);assert.equal(data.filas.length,6);assert.equal(data.kilometraje_total,40);assert.equal(data.moviles_en_servicio,2);
 assert.equal(data.filas.reduce((sum,r)=>sum+Object.values(r.cantidades).reduce((n,c)=>n+c,0),0),7);
 assert.equal(new Set(data.filas.map(r=>[r.estacion_id,r.fecha,r.jornada_id,r.movil_id].join('|'))).size,data.filas.length);
 assert.equal(data.filas.find(r=>r.movil_id===2).cantidades[1],undefined);assert.equal(data.filas.find(r=>r.movil_id===null).movil,'SIN MÓVIL');assert.equal(data.filas.find(r=>r.jornada_id===null).jornada,'SIN JORNADA');
 const night=(await call(eas,'consolidados/diario?fecha=2026-10-28&jornada_id=3')).data;
 assert.equal(night.total_registros,3);assert.equal(night.filas.length,2);assert.equal(night.filas.find(r=>r.movil_id===1).cantidades[1],2);assert.equal(night.filas.find(r=>r.movil_id===1).conductor,'Conductor Uno');
 assert.equal((await call(eas,'consolidados/diario?fecha=2026-10-29&jornada_id=3')).data.total_registros,1);
 assert.equal((await call(eas,'consolidados/diario?fecha=2026-10-28&jornada_id=sin')).data.total_registros,1);
 const report=(await call(eas,`reportes/diario/vista-previa?fecha=2026-10-28&jornada_id=3&radiooperador_id=${operator.id}`)).data;
 assert.equal(report.total_registros,3);assert.ok(report.texto.includes('*JORNADA:* Amanecida (22:00–06:30)'));assert.ok(report.texto.includes('*OPERATIVOS*\nTOTAL: 03'));
 assert.equal((await call(eas,'registros/'+first.id,'PUT',{...first.body,jornada_id:2})).status,200);assert.equal((await call(eas,'consolidados/diario?fecha=2026-10-28&jornada_id=1')).data.total_registros,2);assert.equal((await call(eas,'consolidados/diario?fecha=2026-10-28&jornada_id=2')).data.total_registros,1);
 assert.equal((await call(eas,'registros/'+first.id,'DELETE')).status,200);assert.equal((await call(eas,'consolidados/diario?fecha=2026-10-28')).data.total_registros,6);
 assert.equal((await call(admin,'consolidados/diario?fecha=2026-10-28')).data.total_registros,7);
});

test('Servicios: edición, duplicados, kilometraje, jornadas automáticas y permisos',async t=>{
 const {db,admin,eas,call,service}=await fixture(t);
 const created=await call(eas,'servicios','POST',service);assert.equal(created.status,201);const id=created.data.id;
 assert.equal((await call(eas,'servicios','POST',service)).status,409);
 assert.equal((await call(eas,'servicios/'+id,'PUT',{...service,kilometraje_saliente:999})).status,400);assert.equal((await call(eas,'servicios/'+id,'PUT',{...service,kilometraje_entrante:-1})).status,400);
 assert.equal((await call(eas,'servicios/'+id,'PUT',{...service,kilometraje_saliente:1040,conductor:'Conductor Dos'})).status,200);
 assert.equal((await call(eas,'consolidados/diario?fecha=2026-10-28')).data.filas[0].conductor,'Conductor Dos');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM registros').get().n,0);
 const other=await call(admin,'servicios','POST',{...service,estacion_id:2,movil_id:3});assert.equal(other.status,201);assert.equal((await call(eas,'servicios/'+other.data.id,'PUT',service)).status,403);
 assert.equal((await call(eas,'servicios','POST',{...service,estacion_id:2,movil_id:3})).status,403);assert.equal((await call(eas,'servicios?estacion_id=2')).status,403);assert.equal((await call(eas,'servicios')).data.length,1);
 assert.equal((await call(eas,'servicios','POST',{...service,jornada_id:99})).status,400);assert.equal((await call(eas,'servicios','POST',{...service,movil_id:3})).status,403);
 const basic={fecha:'2026-10-28',movil_id:1,actividad_id:1,estacion_id:1};assert.equal((await call(eas,'registros','POST',basic)).status,200);assert.equal((await call(eas,'registros','POST',{...basic,jornada_id:99})).status,200);assert.equal((await call(eas,'registros','POST',{...basic,jornada_id:1,movil_id:null})).status,200);
 for(const path of ['consolidados/diario?fecha=2026-10-28','reportes/diario/novedades?fecha=2026-10-28','servicios?fecha=2026-10-28']){assert.equal((await call(eas,path+'&jornada_id=99')).status,400);assert.equal((await call(eas,path+'&jornada_id=1&jornada_id=2')).status,400)}
 assert.equal((await call(null,'servicios')).status,401);
 assert.deepEqual((await call(eas,'jornadas')).data.map(j=>[j.nombre,j.hora_inicio,j.hora_fin]),[['Matutina','06:00','14:30'],['Vespertina','14:00','22:30'],['Amanecida','22:00','06:30']]);
});

test('Novedades y REPORTAR distinguen jornadas sin perder las novedades generales',async t=>{
 const {eas,call,record,operator}=await fixture(t);await record(1);await record(2);await record(3);
 const url='reportes/diario/novedades?fecha=2026-10-28';
 await call(eas,url,'PUT',{texto:'General',version:0});await call(eas,url+'&jornada_id=3','PUT',{texto:'Noche',version:0});await call(eas,url+'&jornada_id=sin','PUT',{texto:'Anterior',version:0});
 assert.equal((await call(eas,url)).data.texto,'General');assert.equal((await call(eas,url+'&jornada_id=3')).data.texto,'Noche');assert.equal((await call(eas,url+'&jornada_id=1')).data.texto,'');assert.equal((await call(eas,url+'&jornada_id=sin')).data.texto,'Anterior');
 const report=(await call(eas,`reportes/diario/generar?fecha=2026-10-28&jornada_id=3&radiooperador_id=${operator.id}`,'POST',{})).data;assert.equal(report.total_registros,1);assert.ok(report.texto.includes('- Noche'));assert.ok(!report.texto.includes('- General'));
});

test('Semana siempre lunes–domingo, incluso cuando se elige domingo o cambia el año',()=>{
 assert.equal(mondayDate('2026-11-01'),'2026-10-26');assert.equal(mondayDate('2026-11-02'),'2026-11-02');
 for(const date of ['2026-10-26','2026-10-28','2026-11-01']){const p=reportPeriod('semanal',date);assert.equal(p.inicio,'2026-10-26');assert.equal(p.fin,'2026-11-01');assert.equal(new Date(p.inicio).getUTCDay(),1);assert.equal(new Date(p.fin).getUTCDay(),0)}
 assert.equal(mondayDate('2027-01-03'),'2026-12-28');
});

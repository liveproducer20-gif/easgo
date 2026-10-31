import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {reportTypes,reportCSV} from '../lib/informes.js';

test('Seis informes PDF/CSV: totales, históricos, radioperador, sectores, permisos y descargas',async t=>{
 const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>new Date('2026-10-31T15:00:00Z')});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close()});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 async function call(auth,path,method='GET',body){const r=await fetch(base+path,{method,headers:{cookie:auth?.cookie||'','x-csrf-token':auth?.csrf||''},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 await call(admin,'estaciones','POST',{nombre:'OTRA'});
 for(const [numero,estacion_id] of [['112',1],['187',1],['188',2]])await call(admin,'moviles','POST',{numero,placa:'GAB'+numero,kilometraje:39550,combustible:'1/2',estacion_id,novedades:'Revisar neumáticos'});
 const radio=(await call(eas,'radiooperadores','POST',{nombre:'RADIO DE PRUEBA'})).data;
 await call(eas,'radiooperador-entrante','POST',{radiooperador_id:radio.id});
 assert.equal((await call(eas,'ubicaciones','POST',{nombre:'Punto A',tipo:'consigna'})).status,201);
 await call(eas,'registros','POST',{actividad_id:1,movil_id:1,ubicacion:'Punto A',detalle:'=FORMULA,\ncon "comillas"',radiooperador_id:999999});
 await call(eas,'registros','POST',{actividad_id:2,movil_id:2,ubicacion:'Punto A',detalle:'Segundo movimiento'});
 const record=db.prepare('SELECT * FROM registros ORDER BY id').all()[0];assert.equal(record.radiooperador_id,radio.id);assert.equal(record.radiooperador_nombre,'RADIO DE PRUEBA');
 await call(admin,'registros','POST',{actividad_id:1,movil_id:3,estacion_id:2,ubicacion:'SECRETO OTRA EAS'});
 await call(admin,'registros','POST',{actividad_id:1,movil_id:1,estacion_id:1,ubicacion:'SIN AUTOR'});
 const id=db.prepare('SELECT MAX(id) AS id FROM registros').get().id;
 db.prepare('UPDATE registros SET fecha=? WHERE id=?').run('2026-10-24',id);
 const service={estacion_id:1,fecha:'2026-10-31',jornada_id:1,movil_id:1,conductor:'Conductor',jefe_patrulla:'Jefe',kilometraje_entrante:39500,kilometraje_saliente:39550,observaciones:'Sin novedades'};
 assert.equal((await call(admin,'servicios','POST',service)).status,201);
 const reports={};
 for(const tipo of Object.keys(reportTypes)){
  const params=`tipo=${tipo}&desde=2026-10-31&hasta=2026-10-31`;
  const json=await call(eas,'informes?'+params);assert.equal(json.status,200,tipo+JSON.stringify(json));reports[tipo]=json.data;
  assert.deepEqual(json.data.estaciones.map(e=>e.nombre),['URDESA']);assert.ok(!JSON.stringify(json.data).includes('SECRETO OTRA EAS'));
  assert.equal((await call(eas,'informes?'+params+'&estacion_id=2')).status,403);
  for(const formato of ['pdf','csv']){
   const response=await fetch(base+'informes?'+params+'&formato='+formato,{headers:{cookie:eas.cookie}});assert.equal(response.status,200);
   assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(response.headers.get('content-disposition').endsWith('.'+formato+'"'));
   const bytes=Buffer.from(await response.arrayBuffer());
   if(formato==='pdf'){assert.match(response.headers.get('content-type'),/application\/pdf/);assert.equal(bytes.subarray(0,4).toString(),'%PDF');assert.ok(bytes.length>1000);if(tipo==='moviles'||tipo==='ubicaciones')assert.equal((bytes.toString('latin1').match(/\/Type \/Page\b/g)||[]).length,1,'No debe añadir páginas vacías al paginar')}
   else{assert.match(response.headers.get('content-type'),/text\/csv/);assert.equal(bytes.subarray(0,3).toString('hex'),'efbbbf');assert.ok(bytes.toString().includes('"seccion"'))}
  }
 }
 assert.equal(reports.gestion.tablas[0].filas.length,2);
 assert.equal(reports.diario.tablas[0].filas.reduce((n,r)=>n+r.total_actividades,0),2);
 assert.equal(reports.diario.tablas[0].filas.find(r=>r.movil==='112').kilometraje_recorrido,50);
 assert.equal(reports.moviles.tablas[0].filas.find(r=>r.movil==='112').km_restantes,450);
 assert.equal(reports.ubicaciones.tablas[0].filas[0].tipo,'PUNTO DE CONSIGNA');assert.equal(reports.ubicaciones.graficos[0].series[0].valores[0],2);
 assert.equal(reports.semanal.desde,'2026-10-26');assert.equal(reports.semanal.hasta,'2026-11-01');
 assert.equal(reports.semanal.tablas[0].filas.reduce((n,r)=>n+r.cantidad,0),2);
 const saturday=reports.semanal.tablas[1].filas.find(r=>r.fecha==='2026-10-31');assert.equal(saturday.cantidad,2);assert.equal(saturday.anterior,1);assert.equal(saturday.diferencia,1);assert.equal(saturday.variacion_porcentaje,100);
 assert.equal(reports.radioperadores.tablas.find(t=>t.titulo.startsWith('Total de actividades')).filas[0].cantidad,2);
 assert.ok(reportCSV(reports.gestion).includes("'=FORMULA"));
 const historical=(await call(eas,'informes?tipo=radioperadores&desde=2026-10-24&hasta=2026-10-31')).data;
 assert.ok(historical.tablas[1].filas.some(r=>r.radiooperador==='SIN RADIOPERADOR IDENTIFICADO'));
 // Editing cannot reassign historical authorship through client parameters.
 await call(admin,'registros/'+record.id,'PUT',{estacion_id:1,actividad_id:1,movil_id:1,detalle:'Editado',radiooperador_id:null});
 assert.equal(db.prepare('SELECT radiooperador_id FROM registros WHERE id=?').get(record.id).radiooperador_id,radio.id);
 assert.equal((await call(admin,'informes?tipo=gestion&desde=2026-10-31')).data.estaciones.length,2);
 assert.equal((await call(null,'informes?tipo=gestion')).status,401);
 for(const params of ['tipo=noexiste','tipo=gestion&formato=exe','tipo=gestion&desde=2026-02-30','tipo=gestion&desde=2026-10-31&hasta=2026-01-01','tipo=gestion&estacion_id=1&estacion_id=2'])assert.equal((await call(eas,'informes?'+params)).status,400);
 await call(eas,'registros/'+record.id,'DELETE');assert.equal((await call(eas,'informes?tipo=gestion&desde=2026-10-31')).data.tablas[0].filas.length,1);
 await call(admin,'radiooperadores/'+radio.id,'PUT',{nombre:'NOMBRE CAMBIADO',estado:1,estaciones:[2]});
 const moved=(await call(eas,'informes?tipo=radioperadores&desde=2026-10-31')).data;
 assert.equal(moved.tablas.find(t=>t.titulo.startsWith('Total de actividades')).filas.find(r=>r.id===radio.id).cantidad,1,'Conserva atribución histórica aunque cambie su estación');
 assert.equal((await call(eas,'ubicaciones/1','PUT',{nombre:'Punto A',tipo:'ubicacion'})).status,200);
 assert.equal((await call(eas,'ubicaciones/1','PUT',{nombre:'Renombrar histórico',tipo:'consigna'})).status,400);
 const anotherLocation=(await call(admin,'ubicaciones','POST',{nombre:'Otra ubicación',tipo:'consigna',estacion_id:2})).data;
 assert.equal((await call(eas,'ubicaciones/'+anotherLocation.id,'PUT',{tipo:'ubicacion'})).status,403);
});

test('CSV preserva comas, saltos, acentos y protege fórmulas de hojas de cálculo',()=>{
 const csv=reportCSV({tipo:'gestion',desde:'2026-01-01',hasta:'2026-01-01',tablas:[{titulo:'Detalle',columnas:[{key:'detalle'}],filas:[{detalle:'@CMD'},{detalle:' +CMD'},{detalle:'Ñandú, "ubicación"\nsegunda línea'}]}]});
 assert.ok(csv.includes("'@CMD"));assert.ok(csv.includes("' +CMD"));assert.ok(csv.includes('Ñandú, ""ubicación""\nsegunda línea'));assert.ok(csv.startsWith('\uFEFF'));
});

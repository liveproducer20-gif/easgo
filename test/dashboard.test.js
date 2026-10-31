import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
async function fixture(t){
 let now=new Date('2026-10-31T15:00:00Z');const {server,db}=createApp(':memory:',{admin:'admin-test-password',eas1:'eas-test-password'},{clock:()=>now});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>server.close(r));db.close()});const base=`http://127.0.0.1:${server.address().port}/api/`;
 async function login(username,password){const r=await fetch(base+'login',{method:'POST',body:JSON.stringify({username,password})});return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:(await r.json()).csrf}}
 const admin=await login('admin','admin-test-password'),eas=await login('eas1','eas-test-password');
 async function call(user,path,method='GET',body){const r=await fetch(base+path,{method,headers:{cookie:user?.cookie||'','x-csrf-token':user?.csrf||''},body:body?JSON.stringify(body):undefined});return {status:r.status,data:r.headers.get('content-type').includes('json')?await r.json():await r.text()}}
 await call(admin,'estaciones','POST',{nombre:'OTRA'});for(const [numero,sid] of [['112',1],['113',1],['200',2]])await call(admin,'moviles','POST',{numero,placa:'GAB'+numero,kilometraje:100,combustible:'Lleno',estacion_id:sid});
 async function record({date='2026-10-31',hour='10:00',station=1,mobile=1,activity=1,location='Sector',locationId}={}){now=new Date(date+'T'+hour+':00-05:00');const body={estacion_id:station,movil_id:mobile,actividad_id:activity,ubicacion:location,ubicacion_id:locationId,detalle:'Detalle prueba'};const r=await call(admin,'registros','POST',body);assert.equal(r.status,200,JSON.stringify(r));return db.prepare('SELECT MAX(id) AS id FROM registros').get().id}
 async function dash(user=eas,params=''){const r=await call(user,'dashboard/resumen?desde=2026-10-31&hasta=2026-10-31'+params);assert.equal(r.status,200,JSON.stringify(r));return r.data}
 return {db,call,admin,eas,record,dash};
}
test('Dashboard: ámbitos, filtros, catálogo completo, paginación y coherencia con consolidados',async t=>{
 const {db,call,admin,eas,record,dash}=await fixture(t);for(let i=0;i<28;i++)await record({activity:i%2+1});await record({station:2,mobile:3});await record({mobile:null});
 const data=await dash();assert.equal(data.kpi.total,29);assert.equal(data.kpi.moviles,1);assert.equal(data.actividades.length,14);assert.equal(data.actividades.reduce((n,a)=>n+a.cantidad,0),29);assert.equal(data.registros.length,25);assert.equal(data.paginacion.paginas,2);assert.deepEqual(data.estaciones,[]);assert.equal(data.kpi.kilometros,null);
 assert.equal((await dash(admin)).kpi.total,30);assert.equal((await dash(admin,'&estacion_id=1&estacion_id=2')).estaciones.length,2);assert.equal((await dash(eas,'&pagina=2')).registros.length,4);
 assert.equal((await dash(eas,'&actividad_id=2')).kpi.total,14);assert.equal((await dash(eas,'&movil_id=sin')).kpi.total,1);assert.equal((await dash(eas,'&buscar=Detalle')).kpi.total,29);assert.equal((await dash(eas,'&buscar=%25')).kpi.total,0);
 const daily=(await call(eas,'consolidados/diario?fecha=2026-10-31')).data;assert.equal(daily.total_registros,data.kpi.total);
 const weekly=(await call(eas,'consolidados/semanal?fecha=2026-10-31')).data;const ranged=(await call(eas,'dashboard/resumen?desde=2026-10-26&hasta=2026-11-01')).data;assert.equal(weekly.total_registros,ranged.kpi.total);
 for(const params of ['&estacion_id=2','&estacion_id=1&estacion_id=2','&movil_id=3'])assert.equal((await call(eas,'dashboard/resumen?'+params.slice(1))).status,403);
 assert.equal((await call(null,'dashboard/resumen')).status,401);for(const params of ['desde=2026-02-30','desde=2026-10-31&hasta=2026-01-01','pagina=-1','orden=1;DROP','estacion_id=1 OR 1=1','actividad_id=1&actividad_id=2','otro=1'])assert.equal((await call(admin,'dashboard/resumen?'+params)).status,400);
 assert.equal((await call(eas,'dashboard/resumen','POST',{})).status,405);
});
test('Dashboard: edición, eliminación, noche, ubicación identificada, kilometraje sin duplicar y CSV',async t=>{
 const {db,call,admin,eas,record,dash}=await fixture(t);
 await call(eas,'ubicaciones','POST',{nombre:'Sector exacto'});const loc=db.prepare('SELECT id FROM ubicaciones').get().id;
 const first=await record({hour:'23:00',locationId:loc});await record({date:'2026-11-01',hour:'01:00',locationId:loc});await record({date:'2026-11-01',hour:'05:59',activity:2,location:'Sector exacto'});
 const service={estacion_id:1,fecha:'2026-10-31',jornada_id:3,movil_id:1,conductor:'Conductor',jefe_patrulla:'Jefe',kilometraje_entrante:100,kilometraje_saliente:140,observaciones:'Revisión'};assert.equal((await call(eas,'servicios','POST',service)).status,201);
 let d=await dash(eas,'&jornada_id=3');assert.equal(d.kpi.total,3);assert.equal(d.kpi.kilometros,40);assert.equal(d.servicios.length,1);assert.equal(d.ubicaciones.length,2);assert.equal(d.ubicaciones.find(l=>l.ubicacion_id===loc).cantidad,2);assert.equal(d.evolucion[0].cantidad,3);assert.equal(d.comparacion.variacion,null);
 assert.equal((await dash(eas,'&actividad_id=1')).kpi.kilometros,40);assert.equal((await dash(eas,'&buscar=Detalle')).kpi.kilometros,40);
 assert.equal((await call(eas,'registros/'+first,'PUT',{movil_id:1,actividad_id:2,detalle:'Editado',ubicacion_id:loc})).status,200);d=await dash();assert.equal(d.kpi.requerimientos,2);assert.equal(d.registros.find(r=>r.id===first).jornada,'Amanecida');
 await call(admin,'actividades/2','PUT',{nombre:'REQUERIMIENTOS',estado:0});assert.equal((await dash()).kpi.requerimientos,2);
 await call(eas,'registros/'+first,'DELETE');assert.equal((await dash()).kpi.total,2);
 const empty=(await call(eas,'dashboard/resumen?desde=2026-09-01&hasta=2026-09-03')).data;assert.equal(empty.kpi.total,0);assert.equal(empty.kpi.kilometros,null);assert.equal(empty.evolucion.length,3);assert.equal(empty.actividades.length,14);
 const csv=await call(eas,'dashboard/resumen?desde=2026-10-31&hasta=2026-10-31&formato=csv');assert.equal(csv.status,200);assert.match(csv.data,/servicios/);assert.match(csv.data,/140/);assert.doesNotMatch(csv.data,/,"OTRA",/);
 assert.equal(db.prepare("SELECT COUNT(*) n FROM migraciones WHERE nombre='013_dashboard'").get().n,1);
});

test('Dashboard: comparación mensual, evolución agrupada, cero KM real y CSV completo con fórmulas protegidas',async t=>{
 const {db,call,admin,eas,record}=await fixture(t);
 await record({date:'2026-09-01'});await record({date:'2026-09-30'});for(let i=0;i<27;i++)await record({date:'2026-10-31'});
 let r=await call(eas,'dashboard/resumen?desde=2026-10-01&hasta=2026-10-31&comparacion=mes&agrupacion=mes');assert.equal(r.status,200);assert.deepEqual(r.data.comparacion,{desde:'2026-09-01',hasta:'2026-09-30',total:2,variacion:1250});assert.equal(r.data.evolucion.length,1);assert.equal(r.data.evolucion[0].cantidad,27);assert.equal(r.data.evolucion[0].anterior,2);
 r=await call(eas,'dashboard/resumen?desde=2026-10-26&hasta=2026-11-01&agrupacion=semana');assert.equal(r.data.evolucion.length,1);assert.equal(r.data.evolucion[0].periodo,'2026-10-26');
 const service={estacion_id:1,fecha:'2026-10-31',jornada_id:1,movil_id:1,conductor:'Conductor',jefe_patrulla:'Jefe',kilometraje_entrante:100,kilometraje_saliente:100};assert.equal((await call(eas,'servicios','POST',service)).status,201);
 r=await call(eas,'dashboard/resumen?desde=2026-10-31&hasta=2026-10-31');assert.equal(r.data.kpi.kilometros,0);assert.equal(r.data.kpi.servicios_pendientes,0);
 await call(admin,'estaciones/1','PUT',{nombre:'=PELIGRO',color:'#0866E8'});
 r=await call(eas,'dashboard/resumen?desde=2026-10-31&hasta=2026-10-31&formato=csv');assert.equal((r.data.match(/^"registros",/gm)||[]).length,27);assert.match(r.data,/"'=PELIGRO"/);assert.match(r.data,/"indicadores"/);
});

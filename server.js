import {createGoogleAuthorization} from './lib/google-authorization.js';
import {initializeSheets,createSheetsModule} from './lib/sheets-sync.js';
import {initializeDashboard,dashboard,dashboardCSV} from './lib/dashboard.js';
import {initializeReportsExport,buildReport,reportCSV} from './lib/informes.js';
import {saveIncomingService,initializeIncomingService,incomingStatus} from './lib/servicio-entrante.js';
import {oilMaintenance} from './lib/mantenimiento.js';
import {initializeUserDeletion} from './lib/usuarios.js';
import {initializeColors,validateColor} from './lib/colores.js';
import {currentOperation} from './lib/jornada-actual.js';
import {initializeOperations,shiftFilter,saveService,shiftClause} from './lib/operatividad.js';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {initializeReports,operators,authorizedOperator,saveOperator,notes,saveNotes,generateReport} from './lib/reportes.js';
import {initializeConsolidates,consolidate,ecuadorDate,validateReportDate} from './lib/consolidados.js';
const root=path.dirname(fileURLToPath(import.meta.url));
export const initialActivities=['OPERATIVOS','REQUERIMIENTOS','RETIROS TEMPORALES','LEVANTAMIENTO DE INDIGENTES','RETENIDOS POR ROBO O AGRESIÓN','RESCATE ANIMAL','ACM HERIDO','RETIRO DE COVACHA','RUIDOS MOLESTOSOS','MALA DISPOSICIÓN DE BASURA','ATENCIÓN PARAMÉDICA','DESALOJO DE LIBADORES/CONSUMIDORES','COLABORACIÓN CON OTRAS INSTITUCIONES','MALA DISPOSICIÓN DE DESECHOS'];
function hash(p){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex')}
function verify(p,h){const [s,v]=h.split(':');return timingSafeEqual(scryptSync(p,s,64),Buffer.from(v,'hex'))}
export function createApp(dbPath=':memory:',passwords={admin:'',eas1:''},options={}){
 const clock=options.clock||(()=>new Date());
 const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
 db.exec(readFileSync(path.join(root,'migrations/001_initial.sql'),'utf8'));
 if(!db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get('001_initial')){
  db.exec('BEGIN');try{
   db.prepare('INSERT OR IGNORE INTO estaciones(nombre) VALUES(?)').run('URDESA');
   const station=db.prepare('SELECT id FROM estaciones WHERE nombre=?').get('URDESA').id;
   for(const [name,role] of [['admin','admin'],['eas1','eas']])db.prepare('INSERT OR IGNORE INTO usuarios(username,password,rol,estacion_id) VALUES(?,?,?,?)').run(name,hash(passwords[name]||randomBytes(18).toString('hex')),role,role==='eas'?station:null);
   for(const name of initialActivities)db.prepare('INSERT OR IGNORE INTO actividades(nombre) VALUES(?)').run(name);
   db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run('001_initial');db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
 }
 if(!db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get('002_registro_ubicacion_hora')){
  db.exec('BEGIN');try{
   db.exec(readFileSync(path.join(root,'migrations/002_registro_ubicacion_hora.sql'),'utf8'));
   db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run('002_registro_ubicacion_hora');db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
 }
 if(!db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get('003_ubicaciones')){
  db.exec('BEGIN');try{
   db.exec(readFileSync(path.join(root,'migrations/003_ubicaciones.sql'),'utf8'));
   db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run('003_ubicaciones');db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
 }
 if(!db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get('004_radiooperadores')){
  db.exec('BEGIN');try{
   db.exec(readFileSync(path.join(root,'migrations/004_radiooperadores.sql'),'utf8'));
   db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run('004_radiooperadores');db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e}
 }
 initializeConsolidates(db);initializeReports(db);initializeOperations(db);initializeColors(db);initializeUserDeletion(db);initializeIncomingService(db);initializeReportsExport(db);initializeDashboard(db);initializeSheets(db,options);const googleAuthorization=createGoogleAuthorization(db,{env:options.googleEnv||process.env,clientFactory:options.oauthClientFactory,clock:options.oauthClock});const sheetsModule=createSheetsModule(db,{...options,googleAuthorization});
 const sessions=new Map(),attempts=new Map();
 const all=(sql,...args)=>db.prepare(sql).all(...args),get=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
 function fail(message,status=400){throw Object.assign(new Error(message),{status})}
 function required(v,name){if(typeof v!=='string'||!v.trim()||v.length>2000)fail(name+' es obligatorio (máximo 2000 caracteres)');return v.trim()}
 const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))};
  try{
   const url=new URL(req.url,'http://localhost'),route=url.pathname;
   if(!route.startsWith('/api/')){const files={'/':'public/index.html','/app.js':'public/app.js','/style.css':'public/style.css','/consolidados.js':'public/consolidados.js','/reportar.js':'public/reportar.js','/operatividad.js':'public/operatividad.js','/login.png':'public/login.png'};const file=files[route];if(!file||!existsSync(path.join(root,file)))return send(404,{error:'No encontrado'});res.writeHead(200,{'Content-Type':route.endsWith('.js')?'text/javascript':route.endsWith('.css')?'text/css':route.endsWith('.png')?'image/png':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; style-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'none'"});return res.end(readFileSync(path.join(root,file)))}
   if(route==='/api/conexion/google/callback'){
    if(req.method!=='GET')return send(405,{error:'Método no permitido'});let bound=null,ok=false;
    try{
     const flow=googleAuthorization.consume(req.headers.cookie,url.searchParams);bound=sessions.get(flow.sessionToken);
     const validSession=()=>{const active=sessions.get(flow.sessionToken);return !!(active&&active.expires>Date.now()&&active.id===flow.userId&&get("SELECT id FROM usuarios WHERE id=? AND rol='admin' AND eliminado_en IS NULL",flow.userId))};
     await googleAuthorization.complete(flow,url.searchParams,validSession);ok=true;if(bound)bound.googleOAuthResult={ok:true,message:'Cuenta de Google autorizada. Pruebe la conexión y vuelva a validar el mapeo.'};
    }catch(e){if(bound)bound.googleOAuthResult={ok:false,message:e.status?e.message:'No se pudo completar la autorización de Google.'}}
    try{res.setHeader('Set-Cookie',googleAuthorization.clearCookie())}catch{}
    res.writeHead(303,{'Location':ok?'/#conexion':'/#conexion-error','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});return res.end();
   }
   let b={};if(!['GET','HEAD'].includes(req.method)){if(req.headers.origin&&req.headers.origin!==((options.googleEnv||process.env).APP_PUBLIC_ORIGIN||`http://${req.headers.host}`))fail('Origen no permitido',403);let raw='';for await(const c of req){raw+=c;if(raw.length>32768)fail('Solicitud demasiado grande',413)}try{b=JSON.parse(raw||'{}')}catch{fail('JSON inválido')}}
   if(route==='/api/login'&&req.method==='POST'){
    const key=req.socket.remoteAddress,limit=attempts.get(key);if(limit&&limit.count>=10&&Date.now()-limit.time<600000)fail('Demasiados intentos. Espere 10 minutos.',429);
    const u=get('SELECT * FROM usuarios WHERE username=? AND eliminado_en IS NULL',String(b.username||''));if(!u||!verify(String(b.password||''),u.password)){attempts.set(key,{count:(limit&&Date.now()-limit.time<600000?limit.count:0)+1,time:Date.now()});fail('Credenciales incorrectas',401)}attempts.delete(key);
    const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions.set(token,{id:u.id,csrf,expires:Date.now()+28800000});res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return send(200,{csrf});
   }
   const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8),session=sessions.get(token);if(!session||session.expires<Date.now())fail('Inicie sesión',401);
   const u=get('SELECT id,username,rol,estacion_id FROM usuarios WHERE id=? AND eliminado_en IS NULL',session.id);if(!u)fail('Inicie sesión',401);
   if(req.method!=='GET'&&req.headers['x-csrf-token']!==session.csrf)fail('Token de seguridad inválido',403);
   const admin=()=>{if(u.rol!=='admin')fail('Solo administrador',403)},scope=id=>{if(u.rol!=='admin'&&Number(id)!==u.estacion_id)fail('Estación no autorizada',403)},station=()=>{const id=u.rol==='admin'?Number(b.estacion_id):u.estacion_id;if(u.rol!=='admin'&&b.estacion_id&&Number(b.estacion_id)!==id)fail('Estación no autorizada',403);if(!get('SELECT id FROM estaciones WHERE id=?',id))fail('Estación inválida');return id};
   let radiooperador=session.radiooperador_id?(operators(db,u).find(r=>r.id===session.radiooperador_id)||null):null;
   if(radiooperador&&u.rol!=='admin'&&radiooperador.estacion_id!==u.estacion_id){delete session.radiooperador_id;radiooperador=null}
   if(route==='/api/me'&&req.method==='GET')return send(200,{...u,csrf:session.csrf,radiooperador,servicio_entrante:u.rol==='admin'||!!(radiooperador&&incomingStatus(db,u.estacion_id,clock()).completo),movil_entrante_id:session.movil_entrante_id||null});
   if(route==='/api/radiooperador-entrante'&&req.method==='POST'){
    const selected=operators(db,u).find(r=>r.id===Number(b.radiooperador_id));
    if(!selected){const existing=get('SELECT id FROM radiooperadores WHERE id=?',Number(b.radiooperador_id));fail('Seleccione un radiooperador habilitado para su estación',existing?403:400)}scope(selected.estacion_id);
    session.radiooperador_id=selected.id;session.servicio_entrante=false;delete session.movil_entrante_id;return send(200,selected);
   }
   if(route==='/api/servicio-entrante'||route==='/api/servicio-entrante/omitir'){
    if(u.rol!=='admin'&&!radiooperador)fail('Seleccione primero el radioperador entrante',409);
    if(route.endsWith('/omitir')){if(req.method!=='POST')fail('Método no permitido',405);const status=incomingStatus(db,u.estacion_id,clock());if(!status.completo)fail('Debe completar los datos de todos los móviles de la jornada antes de continuar',409);return send(200,{ok:true,omitido:true})}
    if(req.method==='GET'){
     const sid=u.rol==='admin'?Number(url.searchParams.get('estacion_id')):u.estacion_id;
     if(url.searchParams.has('estacion_id'))scope(Number(url.searchParams.get('estacion_id')));
     const eas=get('SELECT * FROM estaciones WHERE id=?',sid);if(!eas)fail('Estación inválida');const status=incomingStatus(db,sid,clock());
     return send(200,{...status,estacion:eas});
    }
    if(req.method==='POST'){const result=saveIncomingService(db,u,b,clock());session.servicio_entrante=true;session.movil_entrante_id=result.movil.id;return send(200,{...result,ingreso_moviles:incomingStatus(db,result.movil.estacion_id,clock())})}
    fail('Método no permitido',405);
   }
   if(route==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true})}
   if(route==='/api/jornada-actual'&&req.method==='GET'){const now=clock(),active=currentOperation(db,now);const status=u.rol==='admin'?null:incomingStatus(db,u.estacion_id,now);return send(200,{...active,ingreso_moviles:status?{completo:status.completo,pendientes:status.pendientes,total:status.total,clave:status.clave}:null})}
   if(route==='/api/jornadas'&&req.method==='GET')return send(200,all('SELECT * FROM jornadas ORDER BY id'));
   const serviceRoute=route.match(/^\/api\/servicios(?:\/(\d+))?$/);
   if(serviceRoute){
    const id=Number(serviceRoute[1])||null;
    if(req.method==='GET'&&!id){
     const args=[],filters=[];if(u.rol!=='admin'){filters.push('estacion_id=?');args.push(u.estacion_id)}
     if(url.searchParams.has('estacion_id')){const sid=Number(url.searchParams.get('estacion_id'));if(!Number.isSafeInteger(sid)||sid<1)fail('Estación inválida');scope(sid);filters.push('estacion_id=?');args.push(sid)}
     if(url.searchParams.has('fecha')){validateReportDate(url.searchParams.get('fecha'));filters.push('fecha=?');args.push(url.searchParams.get('fecha'))}
     return send(200,all('SELECT * FROM servicios_moviles WHERE '+(filters.join(' AND ')||'1=1')+shiftClause(shiftFilter(db,url.searchParams))+' ORDER BY fecha DESC,jornada_id,movil_id',...args));
    }
    if(req.method==='POST'&&!id)return send(201,saveService(db,u,b,null));
    if(req.method==='PUT'&&id)return send(200,saveService(db,u,b,id));fail('Método no permitido',405);
   }
   const reportRoute=route.match(/^\/api\/reportes\/(diario|semanal)\/(novedades|vista-previa|generar)$/);
   if(reportRoute){
    const [,type,action]=reportRoute;const jornadaId=shiftFilter(db,url.searchParams);
    if(url.searchParams.getAll('fecha').length>1||url.searchParams.getAll('estacion_id').length>1||url.searchParams.getAll('radiooperador_id').length>1)fail('Parámetros duplicados');
    const fecha=url.searchParams.has('fecha')?url.searchParams.get('fecha'):ecuadorDate(clock());validateReportDate(fecha);
    let sid=u.estacion_id;
    if(url.searchParams.has('estacion_id')){const value=url.searchParams.get('estacion_id');if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))fail('Estación inválida');sid=Number(value);scope(sid)}
    if(!sid)fail('Seleccione una estación para reportar');if(!get('SELECT id FROM estaciones WHERE id=?',sid))fail('Estación no encontrada',404);
    if(action==='novedades'){
     if(req.method==='GET')return send(200,notes(db,type,fecha,sid,jornadaId));
     if(req.method==='PUT')return send(200,saveNotes(db,type,fecha,sid,u,b,jornadaId));fail('Método no permitido',405);
    }
    if((action==='vista-previa'&&req.method!=='GET')||(action==='generar'&&req.method!=='POST'))fail('Método no permitido',405);
    const operatorId=Number(url.searchParams.get('radiooperador_id')||session.radiooperador_id);
    if(!Number.isSafeInteger(operatorId)||operatorId<1)fail('Seleccione un radiooperador');
    const report=generateReport(db,type,fecha,sid,operatorId,jornadaId);
    return send(200,report);
   }
   if(route==='/api/consolidados/diario'||route==='/api/consolidados/semanal'){
    if(req.method!=='GET')fail('Método no permitido',405);
    if(url.searchParams.getAll('fecha').length>1)fail('Fecha duplicada');
    const active=route.endsWith('diario')?currentOperation(db,clock()):null;
    const fecha=url.searchParams.has('fecha')?url.searchParams.get('fecha'):(active?.fecha_operativa||ecuadorDate(clock()));validateReportDate(fecha);
    const filters=url.searchParams.getAll('estacion_id');if(filters.length>1)fail('Filtro de estación inválido');
    let sid=u.rol==='admin'?null:u.estacion_id;
    if(filters.length){
     const value=filters[0];if(!/^[1-9]\d*$/.test(value))fail('Filtro de estación inválido');
     const requested=Number(value);if(!Number.isSafeInteger(requested))fail('Filtro de estación inválido');scope(requested);
     if(!get('SELECT id FROM estaciones WHERE id=?',requested))fail('Estación no encontrada',404);sid=requested;
    }
    const estacion=sid?get('SELECT id,nombre,color FROM estaciones WHERE id=?',sid):null;
    return send(200,{...await consolidate(db,route.endsWith('semanal')?'semanal':'diario',fecha,sid,active&&!url.searchParams.has('fecha')&&!url.searchParams.has('jornada_id')?active.jornada_id:shiftFilter(db,url.searchParams)),estacion,zona_horaria:'America/Guayaquil'});
   }
   if(route.startsWith('/api/conexion/google/')){
    admin();
    if(route==='/api/conexion/google/estado'&&req.method==='GET'){const result=session.googleOAuthResult||null;delete session.googleOAuthResult;return send(200,{...googleAuthorization.status(),resultado:result})}
    if(route==='/api/conexion/google/conectar'&&req.method==='POST'){const start=await googleAuthorization.begin({user:u,sessionToken:token,origin:req.headers.origin||((options.googleEnv||process.env).APP_PUBLIC_ORIGIN||'http://'+req.headers.host)});res.setHeader('Set-Cookie',start.cookie);return send(200,{url:start.url})}
    if(route==='/api/conexion/google/desconectar'&&req.method==='POST')return send(200,await googleAuthorization.disconnect());
    fail('Ruta o método OAuth no encontrado',404);
   }
   if(route.startsWith('/api/conexion/'))return send(200,await sheetsModule(u,route.slice('/api/conexion/'.length),req.method,b,url.searchParams));
   if(route==='/api/dashboard/resumen'){
    if(req.method!=='GET')fail('Método no permitido',405);
    const data=dashboard(db,u,url.searchParams,clock());
    if(data.filtros.formato==='csv'){res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="eas-go-dashboard.csv"','Cache-Control':'no-store'});return res.end(dashboardCSV(data))}
    return send(200,data);
   }
   if(route==='/api/informes'){
    if(req.method!=='GET')fail('Método no permitido',405);
    const report=buildReport(db,u,url.searchParams,clock());if(report.formato==='json')return send(200,report);
    const pdf=report.formato==='pdf';let body;if(pdf){const {reportPDF}=await import('./lib/informe-pdf.js');body=await reportPDF(report)}else body=Buffer.from(reportCSV(report),'utf8');
    res.writeHead(200,{'Content-Type':pdf?'application/pdf':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="eas-go-'+report.tipo+'-'+report.desde+'-'+report.hasta+'.'+report.formato+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(body);
   }
   if(route==='/api/estaciones'){
    if(req.method==='GET')return send(200,u.rol==='admin'?all('SELECT * FROM estaciones'):all('SELECT * FROM estaciones WHERE id=?',u.estacion_id));
    if(req.method==='POST'){admin();run('INSERT INTO estaciones(nombre,color) VALUES(?,?)',required(b.nombre,'Nombre').toUpperCase(),validateColor(b.color));return send(201,{ok:true})}
   }
   if(route==='/api/usuarios'){
    admin();if(req.method==='GET')return send(200,all('SELECT id,username,rol,estacion_id FROM usuarios WHERE eliminado_en IS NULL'));
    if(req.method==='POST'){
     const role=b.rol===undefined?'eas':b.rol;if(!['admin','eas'].includes(role))fail('Rol inválido');
     if(typeof b.password!=='string'||b.password.length<12)fail('Contraseña: mínimo 12 caracteres');
     const sid=b.estacion_id===undefined||b.estacion_id===null||b.estacion_id===''?null:Number(b.estacion_id);
     if((role==='eas'&&sid===null)||(sid!==null&&!get('SELECT id FROM estaciones WHERE id=?',sid)))fail('Estación inválida');
     const username=required(b.username,'Usuario');if(get('SELECT id FROM usuarios WHERE username=?',username))fail('Ese nombre de usuario ya está utilizado, incluso si fue eliminado',409);
     run('INSERT INTO usuarios(username,password,rol,estacion_id) VALUES(?,?,?,?)',username,hash(b.password),role,sid);return send(201,{ok:true});
    }
   }
   const match=route.match(/^\/api\/(actividades|moviles|registros|usuarios|ubicaciones|radiooperadores|estaciones)(?:\/(\d+))?$/);if(!match)fail('No encontrado',404);
   const [,table,id]=match;
   if(table==='estaciones'){admin();if(req.method!=='PUT'||!id)fail('Método no permitido',405);const old=get('SELECT * FROM estaciones WHERE id=?',id);if(!old)fail('Estación no encontrada',404);run('UPDATE estaciones SET nombre=?,color=? WHERE id=?',required(b.nombre??old.nombre,'Nombre').toUpperCase(),validateColor(b.color,old.color),id);return send(200,{ok:true})}
   if(table==='usuarios'){
    admin();const target=get('SELECT id,username,rol FROM usuarios WHERE id=? AND eliminado_en IS NULL',id);if(!target)fail('Usuario no encontrado',404);
    if(req.method==='DELETE'){
     if(target.id===u.id)fail('No puede eliminar su propio usuario',409);
     if(target.rol==='admin'&&get("SELECT COUNT(*) AS cantidad FROM usuarios WHERE rol='admin' AND eliminado_en IS NULL").cantidad<=1)fail('No puede eliminar el último administrador',409);
     run('UPDATE usuarios SET eliminado_en=? WHERE id=?',clock().toISOString(),target.id);
     for(const [key,value] of sessions){if(value.id===target.id)sessions.delete(key)}
     return send(200,{ok:true});
    }
    if(req.method==='PUT'){if(b.rol!==undefined&&b.rol!==target.rol)fail('El rol no se modifica desde la edición de estación');const sid=b.estacion_id===null||b.estacion_id===''?null:Number(b.estacion_id);if((target.rol==='eas'&&sid===null)||(sid!==null&&!get('SELECT id FROM estaciones WHERE id=?',sid)))fail('Estación inválida');run('UPDATE usuarios SET estacion_id=? WHERE id=?',sid,id);return send(200,{ok:true})}
    fail('Método no permitido',405);
   }
   if(table==='actividades'){
    if(req.method==='GET'){if(url.searchParams.has('all'))admin();return send(200,all('SELECT * FROM actividades'+(url.searchParams.has('all')?'':' WHERE estado=1')+' ORDER BY id'))}
    admin();if(id&&!get('SELECT id FROM actividades WHERE id=?',id))fail('Actividad no encontrada',404);
    if(req.method==='POST')run('INSERT INTO actividades(nombre,color) VALUES(?,?)',required(b.nombre,'Nombre').toUpperCase(),validateColor(b.color));
    else if(req.method==='PUT'&&id){if(![0,1].includes(b.estado))fail('Estado inválido');run('UPDATE actividades SET nombre=?,estado=?,color=?,modificado=CURRENT_TIMESTAMP WHERE id=?',required(b.nombre,'Nombre').toUpperCase(),b.estado,validateColor(b.color,get('SELECT color FROM actividades WHERE id=?',id).color),id)}
    else if(req.method==='DELETE'&&id){if(get('SELECT id FROM registros WHERE actividad_id=?',id))fail('Actividad con registros históricos: puede desactivarla, pero no eliminarla',409);run('DELETE FROM actividades WHERE id=?',id)}else fail('Método no permitido',405);
    return send(200,{ok:true});
   }
   if(table==='radiooperadores'){
    if(req.method==='GET'){const includeInactive=url.searchParams.get('all')==='1';if(includeInactive)admin();return send(200,operators(db,u,includeInactive))}
    if(req.method==='POST'&&!id)return send(201,saveOperator(db,u,b,null));
    if(req.method==='PUT'&&id){admin();return send(200,saveOperator(db,u,b,Number(id)))}
    fail('Método no permitido',405);
   }
   if(table==='ubicaciones'){
    if(req.method==='PUT'&&id){const old=get('SELECT * FROM ubicaciones WHERE id=?',id);if(!old)fail('Ubicación no encontrada',404);scope(old.estacion_id);if(b.estacion_id&&Number(b.estacion_id)!==old.estacion_id)fail('No se puede cambiar la estación de una ubicación',403);if(!['ubicacion','consigna'].includes(b.tipo))fail('Tipo de ubicación inválido');if(b.nombre!==undefined&&b.nombre!==old.nombre)fail('La clasificación conserva el nombre de la ubicación histórica');run('UPDATE ubicaciones SET tipo=? WHERE id=?',b.tipo,id);return send(200,{ok:true})}
    if(req.method==='GET')return send(200,all('SELECT * FROM ubicaciones'+(u.rol==='admin'?'':' WHERE estacion_id=?')+' ORDER BY nombre',...(u.rol==='admin'?[]:[u.estacion_id])));
    if(req.method==='POST'&&!id){const sid=station(),nombre=required(b.nombre,'Ubicación').replace(/\s+/g,' '),clave=nombre.toUpperCase();if(get('SELECT id FROM ubicaciones WHERE estacion_id=? AND clave=?',sid,clave))fail('Esta ubicación ya existe en la estación',409);if(b.tipo!==undefined&&!['ubicacion','consigna'].includes(b.tipo))fail('Tipo de ubicación inválido');const result=run('INSERT INTO ubicaciones(nombre,clave,estacion_id,tipo) VALUES(?,?,?,?)',nombre,clave,sid,b.tipo||'ubicacion');return send(201,get('SELECT * FROM ubicaciones WHERE id=?',Number(result.lastInsertRowid)))}
    fail('Método no permitido',405);
   }
   if(!['moviles','registros'].includes(table))fail('Método no permitido',405);
   if(table==='moviles'&&req.method==='GET')return send(200,all("SELECT m.*,(SELECT s.conductor FROM servicios_moviles s WHERE s.movil_id=m.id AND s.estacion_id=m.estacion_id ORDER BY s.fecha DESC,s.jornada_id DESC,s.id DESC LIMIT 1) AS conductor,(SELECT s.jefe_patrulla FROM servicios_moviles s WHERE s.movil_id=m.id AND s.estacion_id=m.estacion_id ORDER BY s.fecha DESC,s.jornada_id DESC,s.id DESC LIMIT 1) AS jefe_patrulla FROM moviles m"+(u.rol==='admin'?'':' WHERE m.estacion_id=?')+' ORDER BY m.id DESC',...(u.rol==='admin'?[]:[u.estacion_id])).map(m=>({...m,mantenimiento_aceite:oilMaintenance(m.kilometraje)})));
   if(req.method==='GET')return send(200,all(`SELECT ${table==='registros'?'*,(SELECT color FROM actividades WHERE actividades.id=registros.actividad_id) AS actividad_color':'*'} FROM ${table}`+(u.rol==='admin'?'':' WHERE estacion_id=?')+' ORDER BY id DESC',...(u.rol==='admin'?[]:[u.estacion_id])));
   let old;if(id){old=get(`SELECT * FROM ${table} WHERE id=?`,id);if(!old)fail('Registro no encontrado',404);scope(old.estacion_id)}
   if(table==='registros'&&req.method==='DELETE'&&id){run('DELETE FROM registros WHERE id=?',id);return send(200,{ok:true})}
   if(!['POST','PUT'].includes(req.method)|| (req.method==='PUT'&&!id))fail('Método no permitido',405);
   const sid=station();
   if(table==='moviles'){
    const placa=required(b.placa,'Placa').toUpperCase().replace(/[\s-]/g,''),numero=required(b.numero,'Número').toUpperCase();if(!/^[A-Z0-9]{5,10}$/.test(placa))fail('Placa: de 5 a 10 letras o números');if(!/^[A-Z0-9]{1,20}$/.test(numero))fail('Número: de 1 a 20 letras o números');const km=Number(b.kilometraje);if(b.kilometraje==null||b.kilometraje===''||!Number.isFinite(km)||km<0)fail('Kilometraje inválido');if(!['Lleno','3/4','1/2','1/4','Reserva'].includes(b.combustible))fail('Combustible inválido');
    if(old&&sid!==old.estacion_id&&(get('SELECT id FROM registros WHERE movil_id=?',id)||get('SELECT id FROM servicios_moviles WHERE movil_id=?',id)))fail('No se puede trasladar un móvil con registros históricos',409);
    const values=[placa,numero,km,b.combustible,String(b.novedades||'').slice(0,2000),sid];if(id)run('UPDATE moviles SET placa=?,numero=?,kilometraje=?,combustible=?,novedades=?,estacion_id=? WHERE id=?',...values,id);else run('INSERT INTO moviles(placa,numero,kilometraje,combustible,novedades,estacion_id) VALUES(?,?,?,?,?,?)',...values);
   }else{
    const mobileId=b.movil_id===undefined?(old?.movil_id??null):(b.movil_id===null||b.movil_id===''?null:Number(b.movil_id));const m=mobileId===null?null:get('SELECT * FROM moviles WHERE id=?',mobileId),a=get('SELECT * FROM actividades WHERE id=?',Number(b.actividad_id));if(mobileId!==null&&(!m||m.estacion_id!==sid))fail('Móvil ajeno a la estación',403);if(!a||(!a.estado&&old?.actividad_id!==a.id))fail('Seleccione una actividad activa');const now=clock(),assignment=old?null:currentOperation(db,now);const fecha=old?old.fecha:assignment.fecha_operativa;if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||Number.isNaN(Date.parse(fecha))||new Date(fecha).toISOString().slice(0,10)!==fecha)fail('Fecha inválida');
    let locationId=b.ubicacion===undefined?(old?.ubicacion_id??null):null;
    let ubicacion=b.ubicacion===undefined?(old?.ubicacion||''):b.ubicacion;
    if(b.ubicacion_id){const location=get('SELECT * FROM ubicaciones WHERE id=?',Number(b.ubicacion_id));if(!location||location.estacion_id!==sid)fail('Ubicación ajena a la estación',403);ubicacion=location.nombre;locationId=location.id}
    if(typeof ubicacion!=='string'||ubicacion.length>2000)fail('Ubicación inválida (máximo 2000 caracteres)');
    const automaticHour=assignment?.hora_local;
    let hora=b.hora===undefined||b.hora===''?(old?.hora??(old?null:automaticHour)):b.hora;
    if(hora!==null){if(typeof hora!=='string'||!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(hora))fail('Hora inválida: use HH:mm o HH:mm:ss');if(hora.length===5)hora+=':00'}
    const jornadaId=old?old.jornada_id:assignment.jornada_id;
    const values=[fecha,mobileId,a.id,old?.actividad_id===a.id?old.actividad_nombre:a.nombre,sid,String(b.detalle||'').slice(0,2000),ubicacion.trim()];
    if(id)run('UPDATE registros SET fecha=?,movil_id=?,actividad_id=?,actividad_nombre=?,estacion_id=?,detalle=?,ubicacion=?,hora=?,jornada_id=?,ubicacion_id=? WHERE id=?',...values,hora,jornadaId,locationId,id);
    else{
     const recordOperator=radiooperador?authorizedOperator(db,radiooperador.id,sid):null;
     run('INSERT INTO registros(fecha,movil_id,actividad_id,actividad_nombre,estacion_id,detalle,ubicacion,usuario_id,creado_en,hora,jornada_id,radiooperador_id,radiooperador_nombre,ubicacion_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...values,u.id,now.toISOString(),hora,jornadaId,recordOperator?.id??null,recordOperator?.nombre??null,locationId);
    }
   }return send(200,{ok:true});
  }catch(e){if(e.code?.startsWith('ERR_SQLITE'))return send(409,{error:'Dato duplicado o relación inválida. Placas y números deben ser únicos en todo el sistema.'});if(!e.status)console.error(e);send(e.status||500,{error:e.status?e.message:'Error interno'})}
 });server.on('close',()=>googleAuthorization.close());return {server,db};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 mkdirSync(path.join(root,'data'),{recursive:true});const dbPath=process.env.DB_PATH||path.join(root,'data/redeas.sqlite');const fresh=!existsSync(dbPath);const passwords={admin:process.env.ADMIN_PASSWORD||randomBytes(12).toString('base64url'),eas1:process.env.EAS1_PASSWORD||randomBytes(12).toString('base64url')};const {server}=createApp(dbPath,passwords);server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>{console.log('EAS-GO: http://localhost:'+(process.env.PORT||3000));if(fresh)console.log('Credenciales iniciales (guárdelas):',passwords)});
}

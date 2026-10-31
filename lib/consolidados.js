import {dailyRows,shiftClause} from './operatividad.js';
export const TIME_ZONE='America/Guayaquil';
export function ecuadorDate(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=t=>parts.find(p=>p.type===t).value;return `${part('year')}-${part('month')}-${part('day')}`;
}
export function validateReportDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'9998-12-31'||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Object.assign(Error('Fecha inválida: use YYYY-MM-DD (1900–9998)'),{status:400});
 return value;
}
export function reportPeriod(type,fecha){
 validateReportDate(fecha);const d=new Date(fecha+'T12:00:00Z');
 if(type==='semanal')d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));
 const inicio=d.toISOString().slice(0,10),dates=[];
 for(let i=0;i<(type==='semanal'?7:1);i++){dates.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1)}
 return {inicio,fin:dates.at(-1),exclusive:d.toISOString().slice(0,10),dates};
}
export function initializeConsolidates(db){
 db.exec('CREATE INDEX IF NOT EXISTS registros_estacion_fecha ON registros(estacion_id,fecha); CREATE INDEX IF NOT EXISTS registros_fecha ON registros(fecha);');
 db.prepare('INSERT OR IGNORE INTO migraciones(nombre) VALUES(?)').run('005_consolidados');
}
export function consolidate(db,type,fecha,stationId,jornadaId=null){
 db.exec('BEGIN');try{const result=buildConsolidate(db,type,fecha,stationId,jornadaId);db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}
}
function buildConsolidate(db,type,fecha,stationId,jornadaId){
 const period=reportPeriod(type,fecha),args=[period.inicio,period.exclusive];
 const scoped=stationId!==null;if(scoped)args.push(stationId);
 const where='fecha>=? AND fecha<?'+(scoped?' AND estacion_id=?':'')+shiftClause(jornadaId);
 // A single statement gives every aggregate the same database snapshot.
 const sql=`WITH filtrados AS (SELECT fecha,movil_id,actividad_id,actividad_nombre FROM registros WHERE ${where}),
 cantidades AS (SELECT actividad_id,COUNT(*) AS cantidad FROM filtrados GROUP BY actividad_id),
 catalogo AS (
  SELECT a.id AS orden,a.nombre,a.color,a.id AS actividad_id,COALESCE(q.cantidad,0) AS cantidad FROM actividades a LEFT JOIN cantidades q ON q.actividad_id=a.id
 ),
 dias AS (SELECT fecha,COUNT(*) AS cantidad,COUNT(DISTINCT movil_id) AS moviles FROM filtrados GROUP BY fecha),
 resumen AS (SELECT COUNT(*) AS cantidad,COUNT(DISTINCT movil_id) AS moviles FROM filtrados)
 SELECT 'actividad' AS tipo,orden,nombre,actividad_id,cantidad,0 AS moviles,NULL AS fecha,color FROM catalogo
 UNION ALL SELECT 'dia',0,NULL,NULL,cantidad,moviles,fecha,NULL FROM dias
 UNION ALL SELECT 'total',0,NULL,NULL,cantidad,moviles,NULL,NULL FROM resumen`;
 const data=db.prepare(sql).all(...args),total=data.find(r=>r.tipo==='total');
 const activities=data.filter(r=>r.tipo==='actividad').sort((a,b)=>a.orden-b.orden).map(r=>({id:r.actividad_id,nombre:r.nombre,color:r.color,cantidad:Number(r.cantidad)}));
 const days=period.dates.map(date=>{const row=data.find(r=>r.tipo==='dia'&&r.fecha===date);return {fecha:date,cantidad:Number(row?.cantidad||0),moviles:Number(row?.moviles||0)}});
 return {...(type==='diario'?dailyRows(db,fecha,stationId,jornadaId):{}),jornada_id:jornadaId,fecha,inicio:period.inicio,fin:period.fin,total_registros:Number(total.cantidad),moviles_participantes:Number(total.moviles),actividades:activities,totales_diarios:days};
}

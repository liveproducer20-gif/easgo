export const OPERATION_TIME_ZONE='America/Guayaquil';
// Non-overlapping classification windows; official service schedules stay in jornadas.
export function detectShift(instant=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:OPERATION_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(instant);
 const part=name=>parts.find(p=>p.type===name).value;
 const fechaLocal=[part('year'),part('month'),part('day')].join('-'),hour=Number(part('hour'));
 const nombre=hour>=6&&hour<14?'Matutina':hour>=14&&hour<22?'Vespertina':'Amanecida';
 const operational=new Date(fechaLocal+'T12:00:00Z');if(hour<6)operational.setUTCDate(operational.getUTCDate()-1);
 return {zona_horaria:OPERATION_TIME_ZONE,servidor_utc:instant.toISOString(),fecha_local:fechaLocal,hora_local:[part('hour'),part('minute'),part('second')].join(':'),fecha_operativa:operational.toISOString().slice(0,10),jornada_nombre:nombre};
}
export function currentOperation(db,instant=new Date()){
 const result=detectShift(instant),jornada=db.prepare('SELECT * FROM jornadas WHERE nombre=?').get(result.jornada_nombre);
 if(!jornada)throw Error('La jornada activa no está configurada');
 return {...result,jornada_id:jornada.id,jornada};
}

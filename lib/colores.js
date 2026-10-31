import {readFileSync} from 'node:fs';
export function initializeColors(db){
 const name='009_colores';if(db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get(name))return;
 db.exec('BEGIN');try{db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
export function validateColor(value,fallback='#0866E8'){
 if(value===undefined)return fallback;
 if(typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Object.assign(Error('Color inválido: use #RRGGBB'),{status:400});
 return value.toUpperCase();
}

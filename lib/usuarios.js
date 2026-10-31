import {readFileSync} from 'node:fs';
export function initializeUserDeletion(db){
 const name='010_eliminar_usuarios';if(db.prepare('SELECT 1 FROM migraciones WHERE nombre=?').get(name))return;
 db.exec('BEGIN');try{db.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));db.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}

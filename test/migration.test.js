import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../server.js';
import {saveOperator,saveNotes,generateReport} from '../lib/reportes.js';
test('Migración conserva registros anteriores y se aplica una sola vez',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'redeas-test-')),file=path.join(dir,'test.sqlite');
 try{
  const old=new DatabaseSync(file);old.exec(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  old.exec("INSERT INTO migraciones(nombre) VALUES('001_initial'); INSERT INTO estaciones VALUES(1,'URDESA'); INSERT INTO usuarios VALUES(1,'eas1','no-login','eas',1); INSERT INTO actividades(id,nombre) VALUES(1,'OPERATIVOS'); INSERT INTO moviles VALUES(1,'GAB1234','01',0,'Lleno','',1); INSERT INTO registros VALUES(1,'2026-10-27',1,1,'OPERATIVOS',1,'Histórico',1);");old.close();
  let app=createApp(file);const r=app.db.prepare('SELECT * FROM registros').get();assert.equal(r.detalle,'Histórico');assert.equal(r.hora,null);assert.equal(r.creado_en,null);assert.equal(r.ubicacion,'');app.db.close();
  app=createApp(file);assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM registros').get().n,1);assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM migraciones WHERE nombre='002_registro_ubicacion_hora'").get().n,1);app.db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('Migración REPORTAR conserva radiooperadores existentes y sus estaciones',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'redeas-radio-migration-')),file=path.join(dir,'test.sqlite');
 try{
  const old=new DatabaseSync(file);old.exec(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  old.exec("INSERT INTO migraciones(nombre) VALUES('001_initial'); INSERT INTO estaciones VALUES(1,'URDESA'); INSERT INTO usuarios VALUES(1,'eas1','no-login','eas',1);");
  for(const name of ['002_registro_ubicacion_hora','003_ubicaciones','004_radiooperadores']){old.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));old.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run(name)}
  old.exec("INSERT INTO radiooperadores(id,nombre,clave,estacion_id) VALUES(7,'Operador Anterior','OPERADOR ANTERIOR',1)");old.close();
  let app=createApp(file);assert.equal(app.db.prepare('SELECT estado FROM radiooperadores WHERE id=7').get().estado,1);assert.equal(app.db.prepare('SELECT estacion_id FROM radiooperador_estaciones WHERE radiooperador_id=7').get().estacion_id,1);assert.deepEqual(app.db.prepare("SELECT name FROM sqlite_master WHERE name IN ('reporte_categorias','reporte_clasificacion','catalogo_inicial')").all(),[]);app.db.close();
  app=createApp(file);assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM radiooperador_estaciones').get().n,1);assert.equal(app.db.prepare('SELECT nombre FROM radiooperadores WHERE id=7').get().nombre,'Operador Anterior');app.db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('Catálogo único elimina solo metadatos duplicados y conserva datos operativos',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'redeas-catalog-migration-')),file=path.join(dir,'test.sqlite');
 try{
  let app=createApp(file);let db=app.db;
  const op=saveOperator(db,{rol:'admin'},{nombre:'Operador Conservado',estaciones:[1]},null);
  db.exec("INSERT INTO moviles(placa,numero,kilometraje,combustible,estacion_id) VALUES('GAB1234','01',0,'Lleno',1); INSERT INTO registros(fecha,movil_id,actividad_id,actividad_nombre,estacion_id,usuario_id) VALUES('2026-10-28',1,1,'Nombre histórico conservado',1,2)");
  saveNotes(db,'diario','2026-10-28',1,{id:2},{texto:'Novedad conservada',version:0});
  // Reproduce the superseded auxiliary tables from an existing installation.
  db.exec("CREATE TABLE reporte_categorias(id INTEGER PRIMARY KEY,nombre TEXT); INSERT INTO reporte_categorias VALUES(1,'Categoría anterior'); CREATE TABLE reporte_clasificacion(actividad_id INTEGER,categoria_id INTEGER REFERENCES reporte_categorias(id)); INSERT INTO reporte_clasificacion VALUES(1,1); CREATE TABLE catalogo_inicial(orden INTEGER,nombre TEXT); INSERT INTO catalogo_inicial VALUES(1,'Nombre duplicado'); DELETE FROM migraciones WHERE nombre='007_catalogo_unico'");db.close();
  app=createApp(file);db=app.db;
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name IN ('reporte_categorias','reporte_clasificacion','catalogo_inicial')").all(),[]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM actividades').get().n,14);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM registros').get().n,1);assert.equal(db.prepare('SELECT actividad_nombre FROM registros').get().actividad_nombre,'Nombre histórico conservado');
  const report=generateReport(db,'diario','2026-10-28',1,op.id);assert.equal(report.total_registros,1);assert.equal(report.radiooperador.nombre,'Operador Conservado');assert.equal(report.novedades.texto,'Novedad conservada');assert.equal(report.actividades[0].nombre,'OPERATIVOS');db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('Jornadas migra registros y novedades sin inferir horarios ni perder históricos',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'redeas-shift-migration-')),file=path.join(dir,'test.sqlite');
 try{
  const old=new DatabaseSync(file);old.exec(readFileSync(new URL('../migrations/001_initial.sql',import.meta.url),'utf8'));
  old.exec("INSERT INTO migraciones(nombre) VALUES('001_initial'); INSERT INTO estaciones VALUES(1,'URDESA'); INSERT INTO usuarios VALUES(1,'eas1','no-login','eas',1); INSERT INTO actividades(id,nombre) VALUES(1,'OPERATIVOS'); INSERT INTO moviles VALUES(1,'GAB1234','01',100,'Lleno','',1); INSERT INTO registros VALUES(37,'2026-10-28',1,1,'Nombre histórico',1,'Detalle anterior',1)");
  for(const name of ['002_registro_ubicacion_hora','003_ubicaciones','004_radiooperadores','005_consolidados','006_reportar','007_catalogo_unico']){old.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));old.prepare('INSERT INTO migraciones(nombre) VALUES(?)').run(name)}
  old.exec("UPDATE registros SET hora='00:20:00',creado_en='2026-10-29T05:20:00.000Z',ubicacion='Dirección anterior'; INSERT INTO radiooperadores(id,nombre,clave,estacion_id) VALUES(7,'Operador Anterior','OPERADOR ANTERIOR',1); INSERT INTO radiooperador_estaciones VALUES(7,1); INSERT INTO reporte_novedades VALUES(1,'diario','2026-10-28','2026-10-28','Novedades anteriores',1,'2026-10-28T12:00:00Z',4)");old.close();
  let app=createApp(file);const record=app.db.prepare('SELECT * FROM registros WHERE id=37').get();assert.equal(record.jornada_id,null);assert.equal(record.hora,'00:20:00');assert.equal(record.creado_en,'2026-10-29T05:20:00.000Z');assert.equal(record.actividad_nombre,'Nombre histórico');assert.equal(record.ubicacion,'Dirección anterior');assert.equal(record.detalle,'Detalle anterior');
  const note=app.db.prepare('SELECT * FROM reporte_novedades').get();assert.equal(note.texto,'Novedades anteriores');assert.equal(note.jornada_clave,0);assert.equal(note.version,4);assert.equal(note.modificado_por,1);assert.deepEqual(app.db.prepare('PRAGMA foreign_key_check').all(),[]);app.db.close();
  app=createApp(file);assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM registros').get().n,1);assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM jornadas').get().n,3);assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM servicios_moviles').get().n,0);app.db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyReportImage} from '../public/reportar.js';

test('Copiar imagen conserva el PNG y escribe un único elemento de portapapeles',async()=>{
 const blob=new Blob(['PNG de prueba'],{type:'image/png'});let written;
 class Item{constructor(data){this.data=data}}
 await copyReportImage(blob,{write:async items=>{written=items}},Item);
 assert.equal(written.length,1);assert.equal(written[0].data['image/png'],blob);
});
test('Copiar imagen permite informar falta de soporte y permisos bloqueados',async()=>{
 const blob=new Blob([],{type:'image/png'});
 await assert.rejects(copyReportImage(blob,{},undefined),/Descargar PNG/);
 class Item{}
 const denied=new DOMException('Permiso denegado','NotAllowedError');
 await assert.rejects(copyReportImage(blob,{write:async()=>{throw denied}},Item),e=>e===denied);
});

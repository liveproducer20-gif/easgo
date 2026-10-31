import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {WeeklyOperationsSummary} from '../public/consolidados.js';
import {initialActivities} from '../server.js';

const render=actividades=>renderToStaticMarkup(React.createElement(WeeklyOperationsSummary,{data:{estacion:{nombre:'URDESA'},inicio:'2026-10-26',fin:'2026-11-01',actividades}}));
test('Resumen semanal conserva catálogo, orden, ceros, cantidades y período real',()=>{
 const activities=initialActivities.map((nombre,i)=>({id:i+1,nombre,cantidad:i===0?123:0}));
 const html=render(activities),blocks=html.split('<tbody>').slice(1);
 assert.equal(blocks.length,2);
 for(const block of blocks)assert.equal((block.match(/data-weekly-activity=/g)||[]).length,7);
 assert.ok(html.includes('ESTACIÓN DE ACCIÓN SEGURA URDESA'));
 assert.ok(html.includes('26/10/2026'));assert.ok(html.includes('01/11/2026'));
 assert.equal((html.match(/weekly-positive/g)||[]).length,1);
 assert.equal((html.match(/weekly-zero/g)||[]).length,13);
 assert.ok(html.includes('<strong>123</strong>'));
 let previous=-1;for(const a of activities){const position=html.indexOf('data-weekly-activity="'+a.id+'"');assert.ok(position>previous);previous=position}
 assert.ok(!html.includes('<input'));
});
test('Resumen semanal admite catálogo ampliado y escapa nombres del administrador',()=>{
 const html=render([...initialActivities,'NUEVA <ACTIVIDAD>'].map((nombre,i)=>({id:i+1,nombre,cantidad:0})));
 assert.equal((html.match(/data-weekly-activity=/g)||[]).length,15);
 assert.ok(html.includes('NUEVA &lt;ACTIVIDAD&gt;'));
 assert.ok(!html.includes('NUEVA <ACTIVIDAD>'));
 assert.ok(render([]).includes('No hay actividades configuradas'));
});

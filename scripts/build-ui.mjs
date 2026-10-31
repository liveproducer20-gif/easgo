import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=await build({absWorkingDir:root,entryPoints:['src/consolidados.jsx'],outfile:'public/consolidados.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'inline',define:{'process.env.NODE_ENV':'"production"'},metafile:true,plugins:[{name:'existing-public-modules',setup(builder){builder.onResolve({filter:/^\.\.\/public\/(operatividad|reportar)\.js$/},args=>({path:'./'+path.basename(args.path),external:true}))}}]});
const bytes=Object.values(result.metafile.outputs).reduce((sum,output)=>sum+output.bytes,0);
console.log(`Interfaz de Consolidados compilada: ${Math.round(bytes/1024)} KB. Backend sin cambios.`);

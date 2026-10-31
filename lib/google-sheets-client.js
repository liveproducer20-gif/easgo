import {readFileSync} from 'node:fs';
const fail=(message,status=503)=>{throw Object.assign(Error(message),{status})};
export class GoogleSheetsClient{
 constructor({env=process.env,fetcher=fetch,authorization}={}){this.env=env;this.fetcher=fetcher;this.authorization=authorization;this.auth=null}
 credentials(){try{if(!this.env.GOOGLE_APPLICATION_CREDENTIALS)fail('La autenticación legacy no está configurada. Use OAuth o una identidad ADC adjunta.');const c=JSON.parse(readFileSync(this.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));if(c.type!=='service_account'||!c.client_email||!c.private_key)fail('Credenciales legacy inválidas.');return c}catch(e){if(e.status)throw e;fail('No se pudo leer la configuración legacy. Use OAuth.') }}
 mode(){return this.env.GOOGLE_AUTH_MODE||'oauth'}
 account(){if(this.mode()!=='service_account')return this.authorization?.status().cuenta||null;try{return this.credentials().client_email}catch{return null}}
 async token(force=false){
  if(this.mode()==='oauth'){if(!this.authorization)fail('Configure OAuth y utilice CONECTAR CON GOOGLE.',401);return this.authorization.accessToken({force})}
  if(!['adc','service_account'].includes(this.mode()))fail('GOOGLE_AUTH_MODE debe ser oauth, adc o service_account.');
  if(this.mode()==='adc'&&this.env.GOOGLE_APPLICATION_CREDENTIALS)fail('Para ADC con identidad adjunta, retire GOOGLE_APPLICATION_CREDENTIALS. No se necesitan claves JSON.');
  if(!this.auth){const {GoogleAuth}=await import('google-auth-library');this.auth=new GoogleAuth({...(this.mode()==='service_account'?{credentials:this.credentials()}:{}),scopes:['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/drive.metadata.readonly']})}
  try{const token=await this.auth.getAccessToken();if(this.mode()==='adc'){const credentials=await this.auth.getCredentials();this.authorization?.setADCIdentity(credentials.client_email)}return token}catch{fail('No se pudo autenticar la identidad del entorno. Revise la cuenta adjunta y sus permisos.')}
 }
 async request(path,options={}){return this.authorizedRequest('https://sheets.googleapis.com/v4/spreadsheets/'+path,options)}
 async authorizedRequest(url,{method='GET',body}={}){
  let token=await this.token(),renewed=false;
  for(let attempt=0;attempt<4;attempt++){
   let r;try{r=await this.fetcher(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)})}catch{fail('No hubo respuesta de Google. Compruebe la conexión; verifique las escrituras antes de reintentarlas.')}
   if(r.ok)return r.json();if(r.status===401&&method==='GET'&&this.mode()==='oauth'&&!renewed){renewed=true;token=await this.token(true);continue}
   if(method==='GET'&&(r.status===429||r.status>=500)&&attempt<3){await new Promise(resolve=>setTimeout(resolve,500*2**attempt+Math.random()*200));continue}
   if(r.status===401){this.authorization?.invalidateAccessToken(token);fail('Google rechazó la autorización. Vuelva a conectar con Google.',401)};
   fail(r.status===403?'Google denegó el acceso. Revise los permisos de la cuenta conectada y las API habilitadas.':r.status===404?'Documento o pestaña no accesible para la cuenta conectada.':r.status===429?'Google limitó las consultas. Espere antes de reintentar.':'Google rechazó la solicitud ('+r.status+').',r.status===403?403:503);
  }
  fail('Google no confirmó la solicitud. Reintente la consulta.',503);
 }
 async permissions(documento){const data=await this.authorizedRequest('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(documento)+'?supportsAllDrives=true&fields=id,mimeType,capabilities(canEdit)');if(data.id!==documento||data.mimeType!=='application/vnd.google-apps.spreadsheet')fail('El destino no es la hoja de cálculo esperada.',409);return {documento,canEdit:data.capabilities?.canEdit===true,comprobado_en:new Date().toISOString()}}
 async read(config){
  const id=encodeURIComponent(config.documento),meta=await this.request(id+'?fields=spreadsheetId,properties,sheets(properties,merges,protectedRanges)');const sheet=meta.sheets?.find(s=>s.properties.title===config.pestana);if(!sheet)fail('No existe la pestaña seleccionada.',409);
  const count=sheet.properties.gridProperties.rowCount;if(count>50000)fail('La pestaña supera 50000 filas. Configure una lectura acotada antes de sincronizar.',409);
  const cells={};for(let start=1;start<=count;start+=2000){const range="'"+config.pestana.replaceAll("'","''")+"'!B"+start+':Z'+Math.min(count,start+1999),fields='sheets(data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,dataValidation,effectiveFormat(numberFormat)))))';const part=await this.request(id+'?ranges='+encodeURIComponent(range)+'&fields='+encodeURIComponent(fields));for(const s of part.sheets||[])for(const d of s.data||[])for(const [ri,row] of (d.rowData||[]).entries())for(const [ci,c] of (row.values||[]).entries())if(Object.keys(c).length)cells[(d.startRow||0)+ri+1+'|'+((d.startColumn||0)+ci+1)]=c}
  return {documento:meta.spreadsheetId,nombre:meta.properties.title,zona:meta.properties.timeZone,locale:meta.properties.locale,pestana:config.pestana,sheetId:sheet.properties.sheetId,rows:count,cells,merges:sheet.merges||[],protected:sheet.protectedRanges||[],sheets:meta.sheets.map(s=>s.properties.title)};
 }
 async write(config,changes){if(!(await this.permissions(config.documento)).canEdit)fail('La cuenta conectada no tiene permiso de edición en este documento.',403);return this.request(encodeURIComponent(config.documento)+'/values:batchUpdate',{method:'POST',body:{valueInputOption:'RAW',includeValuesInResponse:true,data:changes.map(c=>({range:c.celda,values:[[c.final]]}))}})}
}

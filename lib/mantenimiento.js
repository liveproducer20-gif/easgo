export function oilMaintenance(kilometraje){
 const km=Number(kilometraje);
 if(!Number.isFinite(km)||km<0)throw Error('Kilometraje inválido');
 const intervalo=5000,umbral=500,proximo=km===0?intervalo:Math.ceil(km/intervalo)*intervalo;
 const restantes=Math.max(0,proximo-km);
 return {intervalo_km:intervalo,umbral_alerta_km:umbral,proximo_km:proximo,km_restantes:restantes,alerta:restantes<=umbral,estado:restantes===0?'corresponde':restantes<=umbral?'proximo':'programado'};
}

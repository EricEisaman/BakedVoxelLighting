export const DAY_DURATION_SECONDS=24*60;
export function advanceHour(hour,elapsedSeconds){return ((hour+elapsedSeconds*24/DAY_DURATION_SECONDS)%24+24)%24;}
export function solarState(hour){
 const angle=(hour-6)*Math.PI/12;
 const y=Math.sin(angle),h=Math.cos(angle);
 return {direction:[-.7808688094*h,y,-.6246950476*h],daylight:Math.max(0,Math.min(1,(y+.06)/.26)),elevation:Math.asin(y)*180/Math.PI};
}

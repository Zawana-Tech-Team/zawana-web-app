/** Shared court rate policy: holiday override, peak hours, and preserved session duration. */
export function rentalDestinationPrice(baseRate:number,startMinutes:number,durationMinutes:number,holiday:{active:boolean;price:number}|null){
 return Array.from({length:Math.ceil(durationMinutes/60)},(_,index)=>holiday?.active?holiday.price:baseRate+(startMinutes+index*60>=900?5000:0)).reduce((total,price)=>total+price,0);
}

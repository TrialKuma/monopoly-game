// Shared world-unit dimensions for every harbor parcel. The street,
// island edge and renderer must use the same footprint and walking clearance.
// Index lookup also supports route diagrams, which only pass { index }.
const PUBLIC_INDICES = new Set([5,10,11,12,13,14,16,17,18,20,21,23,24,25,26,28,33]);
const ESTATE_INDICES = new Set([2,3,7,8,30,31]);
const CIVIC = Object.freeze({
  kind:'civic',isPublic:true,
  width:2.65,depth:2.50,scale:Object.freeze([1.95,2.05,1.85]),
  walkSetback:1.83,modelSetback:.12,
});
const PUBLIC = Object.freeze({
  kind:'public',isPublic:true,
  width:2.15,depth:2.10,scale:Object.freeze([1.50,1.50,1.50]),
  walkSetback:1.58,modelSetback:.12,
});
const PROPERTY = Object.freeze({
  kind:'property',isPublic:false,
  width:1.85,depth:1.85,scale:Object.freeze([1.28,1.28,1.28]),
  walkSetback:1.42,modelSetback:.10,
});
const ESTATE = Object.freeze({
  kind:'estate',isPublic:false,
  width:4.20,depth:2.45,scale:Object.freeze([1.65,1.55,1.65]),
  walkSetback:1.72,modelSetback:.10,
});

export function harborParcelSpec(tile) {
  const index=Number(tile?.index);
  if(!Number.isInteger(index)||index<0||index>33)return null;
  return index===0?CIVIC:PUBLIC_INDICES.has(index)?PUBLIC:ESTATE_INDICES.has(index)?ESTATE:PROPERTY;
}

// Preserve the existing layout/renderer import while callers adopt the broader
// parcel name. Presence of a spec does not mean that a tile is a public service.
export const harborLandmarkSpec=harborParcelSpec;

export function harborWalkSetback(tile) {
  return harborLandmarkSpec(tile)?.walkSetback??1.18;
}

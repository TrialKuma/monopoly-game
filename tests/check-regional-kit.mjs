// Production architecture follows the current Blender contract. Historical
// AI candidates retain their independent strict source/approval audit.
if(process.argv.includes('--candidate'))await import('./check-full-ai-city.mjs');
else await import('./check-blender-city.mjs');

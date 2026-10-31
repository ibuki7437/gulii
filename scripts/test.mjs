import {spawnSync} from 'node:child_process';
const files=['test-boxes.mjs','test-archive.mjs','test-member-query.mjs','test-notes-sheet.mjs','test-items.mjs','test-weights.mjs','test-import.mjs'];
for(const file of files){const r=spawnSync(process.execPath,[file],{stdio:'inherit'});if(r.status!==0)process.exit(r.status??1);}

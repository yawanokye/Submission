'use strict';
const assert=require('assert/strict');
const {claimantRows,registerSpreadsheet,renderRegisterPdf}=require('../lib/claim-register-pdf');
const {execFileSync}=require('child_process');
const combined=require('../lib/claim-register-combined-pdf');
const base={category:'project-distance',categoryLabel:'Project Work, Distance',departmentName:'Business',quantity:1};
const item=(id,name,email,extra={})=>({...base,id,reference:id,name,email,...extra});
const items=[
  item('A1','Dr. Ama Boateng','shared@example.edu',{quantity:2}),
  item('A2','Ama Boateng','shared@example.edu',{quantity:3}),
  item('B','Kofi Mensah','shared@example.edu',{quantity:4}),
  item('C','Esi Doe','different@example.edu',{staffId:'123',quantity:5}),
  item('D','Kwame Doe','different@example.edu',{staffId:'123',quantity:6}),
  item('E','Ama Boateng','shared@example.edu',{departmentName:'Education',quantity:7}),
  item('F','Unverified Person','',{quantity:8}),
  item('G','Unverified Person','',{quantity:9})
];
const rows=claimantRows(items);
assert.equal(rows.length,7,'matching project work combines while different payees and departments stay separate');
assert.equal(rows.find(row=>row.references==='A1 | A2').quantity,5);
for(const [id,quantity] of [['B',4],['C',5],['D',6],['E',7],['F',8],['G',9]])assert.equal(rows.find(row=>row.references===id).quantity,quantity,`${id} must retain its own claims`);
const csv=registerSpreadsheet({items},null,'csv').toString('utf8');
assert.match(csv,/"Kofi Mensah","4"/);
assert.match(csv,/"Esi Doe","5"/);
assert.match(csv,/"Kwame Doe","6"/);
const packets=[{department:'business',items:[item('P1','Same Person','same@example.edu',{departmentName:''})]},{department:'education',items:[item('P2','Same Person','same@example.edu',{departmentName:''})]}];
assert.equal(claimantRows(combined.combinedModel(packets).items).length,2,'consolidating registers must preserve department boundaries');
renderRegisterPdf({reference:'TEST',createdAt:'2026-11-17',departmentName:'Test departments',items}).then(bytes=>{
  const text=execFileSync('pdftotext',['-layout','-','-'],{input:bytes,encoding:'utf8'});
  for(const [name,quantity] of [['Kofi Mensah',4],['Esi Doe',5],['Kwame Doe',6]])assert.match(text,new RegExp(`${name}\\s+${quantity}`));
  assert.match(text,/CATEGORY TOTAL CLAIMS:?\s+44/);
  console.log('Register payee grouping keeps different names, departments and unverified identities separate in PDF and spreadsheet rows.');
}).catch(error=>{console.error(error);process.exitCode=1;});

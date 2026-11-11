'use strict';
const {renderRegisterPdf}=require('./claim-register-pdf');
const historical=packet=>Boolean(packet.supersededBy||packet.stage==='returned-to-department');
function combinedModel(packets,{departmentName='',records=[]}={}){
 const current=new Map(records.map(record=>[record.id,record])),items=new Map(),ordered=[...packets].sort((a,b)=>Number(historical(a))-Number(historical(b))||String(b.createdAt).localeCompare(String(a.createdAt))||Number(b.version||0)-Number(a.version||0));
 for(const packet of ordered)for(const item of packet.items){
  // A source appearing in a returned register and its replacement counts once.
  // Prefer the current snapshot and omit formally excluded payment copies.
  if(current.get(item.id)?.paymentDuplicateResolution?.status==='excluded')continue;
  const key=JSON.stringify([packet.department,item.category,item.id||item.reference]);if(!items.has(key))items.set(key,{...item,departmentName:item.departmentName||packet.departmentName});
 }
 return {reference:'CONSOLIDATED SENT CLAIMS',departmentName,createdAt:new Date().toISOString(),items:[...items.values()],sourceRegisterCount:packets.length,categoryLabel:packets[0]?.categoryLabel||''};
}
module.exports=async function combinedRegisterPdf(packets,readPdf,options={}){
 // Verify all saved source PDFs before producing the continuous list.
 for(const packet of packets)await readPdf(packet);
 const model=combinedModel(packets,options);if(!model.items.length)throw Object.assign(new Error('No current claim entries remain in the selected registers.'),{status:400});
 return renderRegisterPdf(model,{logoPath:options.logoPath,title:'Consolidated Claim Register',continuousNumbering:true,footerLabel:'Consolidated reference list',notice:`One continuous list from ${packets.length} source register(s). Approval decisions remain on the source registers.`});
};
module.exports.combinedModel=combinedModel;

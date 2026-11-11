'use strict';
const PDFKit=require('pdfkit'),{PDFDocument}=require('pdf-lib');
const ORDER=['project-distance','project-non-residential','field-experience','teaching-practice','assessor'];
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
async function registerIndex(packets,departmentName){
 return new Promise((resolve,reject)=>{
  const doc=new PDFKit({size:'A4',margin:36,bufferPages:true}),chunks=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);
  const width=doc.page.width-72;let y=0,category='';
  const heading=label=>{doc.font('Helvetica-Bold').fontSize(15).fillColor('#173e59').text('Registers sent for approval',36,36,{width});doc.font('Helvetica').fontSize(10).text(clean(departmentName||'Authorised departments'),36,61,{width});doc.fontSize(8).text(`${packets.length} selected registers. Saved register pages follow this index, grouped by category.`,36,81,{width});doc.text('Reference copy for verification. Approval decisions remain on each source register.',36,96,{width});doc.font('Helvetica-Bold').fontSize(11).text(clean(label),36,123,{width});y=146;};
  let first=true;for(const packet of packets){if(packet.category!==category){if(!first)doc.addPage();category=packet.category;heading(packet.categoryLabel||category);first=false;}
   const reference=clean(packet.reference),stage=clean(packet.stageLabel||packet.stage),history=packet.supersededBy?'REPLACED VERSION':packet.stage==='returned-to-department'?'RETURNED FOR CORRECTION':'CURRENT REGISTER';doc.font('Helvetica-Bold').fontSize(9);const height=doc.heightOfString(reference,{width:width-20})+58;
   if(y+height>755){doc.addPage();heading(packet.categoryLabel||category);}
   doc.rect(36,y,width,height).fill('#f1f5f8');doc.fillColor('#173e59').font('Helvetica-Bold').fontSize(9).text(reference,46,y+9,{width:width-20});const line=y+doc.heightOfString(reference,{width:width-20})+18;doc.font('Helvetica').fontSize(9).text(stage,46,line,{width:width-20});doc.fontSize(8).text(`${packet.items.length} submissions | ${packet.items.reduce((sum,item)=>sum+item.quantity,0)} recorded claim units | ${history}`,46,line+16,{width:width-20});y+=height+9;
  }
  const range=doc.bufferedPageRange();for(let page=0;page<range.count;page++){doc.switchToPage(page);doc.font('Helvetica').fontSize(8).fillColor('#526777').text(`Register index ${page+1} of ${range.count} | Prepared ${new Date().toLocaleDateString('en-GB',{timeZone:'Africa/Accra'})}`,36,790,{width,lineBreak:false});}doc.end();
 });
}
module.exports=async function combinedRegisterPdf(packets,readPdf,{departmentName=''}={}){
 const ordered=[...packets].sort((a,b)=>ORDER.indexOf(a.category)-ORDER.indexOf(b.category)||String(a.createdAt).localeCompare(String(b.createdAt))||String(a.reference).localeCompare(String(b.reference))),output=await PDFDocument.create();
 const append=async bytes=>{const source=await PDFDocument.load(bytes),pages=await output.copyPages(source,source.getPageIndices());for(const page of pages)output.addPage(page);};
 await append(await registerIndex(ordered,departmentName));for(const packet of ordered)await append(await readPdf(packet));output.setTitle('Registers sent for approval, consolidated reference copy');output.setAuthor('UCC-CoDE eServices');return Buffer.from(await output.save());
};

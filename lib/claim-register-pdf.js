'use strict';
const PDFDocument=require('pdfkit');
const XLSX=require('xlsx');
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
const CATEGORY_ORDER=['project-distance','project-non-residential','field-experience','teaching-practice','assessor'];
const EXPORT_FIELDS=Object.freeze({name:'Claimant name',quantity:'Number of claims',category:'Category',submissionCount:'Submissions',references:'Submission references',email:'Email',staffId:'Staff / payroll ID',department:'Department',bankName:'Bank name',accountNumber:'Account number',bankBranch:'Bank branch',amount:'Amount',notes:'Notes',blank:'Blank column'});
function claimantRows(items){
  const groups=new Map();
  for(const item of items){const key=`${item.category}:${String(item.staffId||item.email||item.name).toLowerCase()}`;if(!groups.has(key))groups.set(key,{name:item.name,email:item.email,staffId:item.staffId||'',department:item.departmentName,category:item.categoryLabel,categoryKey:item.category,quantity:0,submissionCount:0,references:[],bankName:'',accountNumber:'',bankBranch:'',amount:'',notes:''});const row=groups.get(key);row.quantity+=item.quantity;row.submissionCount++;row.references.push(item.reference);}
  return [...groups.values()].map(row=>({...row,references:row.references.join(' | ')})).sort((a,b)=>CATEGORY_ORDER.indexOf(a.categoryKey)-CATEGORY_ORDER.indexOf(b.categoryKey)||a.name.replace(/^(?:(?:prof(?:essor)?|dr|mr|mrs|ms)\.?\s+)+/i,'').localeCompare(b.name.replace(/^(?:(?:prof(?:essor)?|dr|mr|mrs|ms)\.?\s+)+/i,''),'en',{sensitivity:'base'}));
}
function renderRegisterPdf(model,{signature=null,logoPath=null,title='Claim Register'}={}){
  return new Promise((resolve,reject)=>{
    const document=new PDFDocument({size:'A4',layout:'portrait',margin:36,bufferPages:true,info:{Title:`${title} - ${model.reference}`,Author:'UCC-CoDE eServices'}}),chunks=[];
    document.on('data',chunk=>chunks.push(chunk));document.on('end',()=>resolve(Buffer.concat(chunks)));document.on('error',reject);
    const width=document.page.width-72,left=36,bottom=650,rows=claimantRows(model.items),sections=new Map();
    for(const row of rows){if(!sections.has(row.categoryKey))sections.set(row.categoryKey,{label:row.category,rows:[]});sections.get(row.categoryKey).rows.push(row);}
    if(!sections.size)sections.set('empty',{label:model.categoryLabel||'No eligible claims',rows:[]});
    const date=new Date(model.createdAt||Date.now()).toLocaleDateString('en-GB',{timeZone:'Africa/Accra'});let y=0;
    const heading=category=>{
      if(logoPath)try{document.image(logoPath,left,32,{fit:[36,42]});}catch{}
      document.fillColor('#12344d').font('Helvetica-Bold').fontSize(13).text('UNIVERSITY OF CAPE COAST',logoPath?82:left,34,{width:width-46});
      document.fontSize(11).text('College of Distance Education',logoPath?82:left,53,{width:width-46});
      document.fontSize(15).text(title,left,82,{width});document.font('Helvetica').fontSize(9).fillColor('#34495e').text(clean(model.departmentName),left,105,{width});
      document.fontSize(7.5).text(`Reference: ${clean(model.reference)}    Prepared: ${date}`,left,121,{width});
      document.font('Helvetica-Bold').fontSize(11).fillColor('#173e59').text(clean(category),left,140,{width});
      document.font('Helvetica').fontSize(8).text(`${model.items.length} approved submissions | ${rows.length} claimant/category rows | ${model.items.reduce((sum,item)=>sum+item.quantity,0)} claim units`,left,158,{width});y=179;
      document.rect(left,y,width,24).fill('#173e59');document.fillColor('white').font('Helvetica-Bold').fontSize(10).text('S/N',left+7,y+7,{width:29});document.text('Name of claimant',left+39,y+7,{width:width-133});document.text('No. of claims',left+width-91,y+7,{width:84,align:'right'});y+=24;
    };
    let first=true;
    for(const section of sections.values()){
      if(!first)document.addPage();first=false;heading(section.label);let total=0;
      section.rows.forEach((row,index)=>{
        document.font('Helvetica').fontSize(10);const height=Math.max(25,document.heightOfString(clean(row.name),{width:width-140})+11),last=index===section.rows.length-1;
        if(y+height+(last?57:0)>bottom){document.addPage();heading(section.label);}
        document.rect(left,y,width,height).fill(index%2?'#f4f7fa':'#ffffff');document.strokeColor('#d7e0e6').lineWidth(.5).moveTo(left,y+height).lineTo(left+width,y+height).stroke();
        document.font('Helvetica').fontSize(10).fillColor('#162c3c').text(String(index+1),left+7,y+8,{width:28});document.text(clean(row.name),left+39,y+8,{width:width-140});document.font('Helvetica-Bold').text(String(row.quantity),left+width-91,y+8,{width:84,align:'right'});y+=height;total+=row.quantity;
      });
      document.rect(left,y,width,28).fill('#e2edf2');document.font('Helvetica-Bold').fontSize(11).fillColor('#173e59').text('CATEGORY TOTAL CLAIMS',left+8,y+9,{width:width-110});document.text(String(total),left+width-91,y+9,{width:84,align:'right'});y+=39;
      const submissions=model.items.filter(item=>item.category===section.rows[0]?.categoryKey).length;document.font('Helvetica').fontSize(9).text(`${section.rows.length} claimant(s) from ${submissions} approved submission(s).`,left,y,{width});
    }
    const range=document.bufferedPageRange();
    for(let index=range.start;index<range.start+range.count;index++){
      document.switchToPage(index);document.strokeColor('#bacbd5').lineWidth(.6).moveTo(left,674).lineTo(left+width,674).stroke();
      document.font('Helvetica-Bold').fontSize(9).fillColor('#173e59').text('HEAD OF DEPARTMENT',left,685,{width:260});
      if(signature?.image)document.image(signature.image,left+5,701,{fit:[145,37]});
      document.strokeColor('#728997').moveTo(left,741).lineTo(left+240,741).stroke();
      document.font('Helvetica').fontSize(9).text('HoD signature',left,747,{width:240});
      document.fontSize(8).text(signature?clean(signature.name):'Name: ........................................................',left,762,{width:275});
      document.text(signature?`Approved: ${new Date(signature.at).toLocaleDateString('en-GB',{timeZone:'Africa/Accra'})}`:'Date: ..........................................................',left,775,{width:275});
      document.strokeColor('#9eb4c1').rect(left+315,687,width-315,74).stroke();document.fontSize(9).text('Official stamp',left+315,766,{width:width-315,align:'center'});
      document.fontSize(8).fillColor('#526777').text(`${clean(model.reference)} | ${signature?'HoD endorsed':'Prepared for review'}`,left,793,{width:width-90,lineBreak:false});document.text(`Page ${index+1} of ${range.count}`,left+width-85,793,{width:85,align:'right',lineBreak:false});
    }
    document.end();
  });
}
function registerSpreadsheet(model,columns=null,format='xlsx'){
  const selected=columns||[{key:'name',label:'Name of claimant'},{key:'quantity',label:'Number of claims'},{key:'category',label:'Category'},{key:'references',label:'Submission references'}];
  if(!Array.isArray(selected)||!selected.length||selected.length>40||selected.some(column=>!Object.hasOwn(EXPORT_FIELDS,column.key)||!clean(column.label)||clean(column.label).length>100))throw new Error('Choose valid export columns and headings.');
  const rows=claimantRows(model.items),table=[selected.map(column=>clean(column.label)),...rows.map(row=>selected.map(column=>column.key==='blank'?'':row[column.key]??''))];
  if(format==='csv')return Buffer.from(table.map(row=>row.map(value=>`"${String(typeof value==='string'&&/^[=+@\-]/.test(value)?"'"+value:value).replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n','utf8');
  const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(table);sheet['!cols']=selected.map(column=>({wch:column.key==='name'?38:column.key==='references'?60:column.key==='quantity'?18:28}));sheet['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:table.length-1,c:selected.length-1}})};sheet['!margins']={left:.35,right:.35,top:.5,bottom:.5,header:.2,footer:.2};sheet['!pageSetup']={orientation:'portrait',paperSize:9,fitToWidth:1,fitToHeight:0};XLSX.utils.book_append_sheet(book,sheet,'Claim Register');
  if(!columns){
    const detail=XLSX.utils.aoa_to_sheet([['Submission reference','Name of claimant','Category','Number of claims'],...model.items.map(item=>[item.reference,item.name,item.categoryLabel,item.quantity])]);detail['!cols']=[{wch:30},{wch:38},{wch:32},{wch:18}];detail['!autofilter']={ref:`A1:D${model.items.length+1}`};XLSX.utils.book_append_sheet(book,detail,'Submission Detail');
    const summary=XLSX.utils.aoa_to_sheet([['Register summary','Count'],['Approved submissions',model.items.length],['Claimant/category rows',rows.length],['Claim units',model.items.reduce((sum,item)=>sum+item.quantity,0)],[],['Prepared',clean(model.createdAt)],['Reference',clean(model.reference)],['Selection fingerprint',model.exportFingerprint||'Saved approval register'],[],['Category','Submissions','Claimant/category rows','Claim units'],...CATEGORY_ORDER.filter(category=>model.items.some(item=>item.category===category)).map(category=>{const items=model.items.filter(item=>item.category===category);return [items[0].categoryLabel,items.length,claimantRows(items).length,items.reduce((sum,item)=>sum+item.quantity,0)];})]);summary['!cols']=[{wch:35},{wch:28},{wch:28},{wch:18}];XLSX.utils.book_append_sheet(book,summary,'Register Summary');
  }
  return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
module.exports={renderRegisterPdf,registerSpreadsheet,claimantRows,EXPORT_FIELDS};

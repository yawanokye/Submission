'use strict';
const PDFDocument=require('pdfkit');
const XLSX=require('xlsx');
const clean=value=>String(value??'').replace(/[\r\n\t]+/g,' ').trim();
const CATEGORY_ORDER=['project-distance','project-non-residential','field-experience','teaching-practice','assessor'];
const EXPORT_FIELDS=Object.freeze({name:'Claimant name',quantity:'Number of claims',category:'Category',mode:'Study mode',activity:'Activity',submissionCount:'Submissions',references:'Submission references',email:'Email',staffId:'Staff / payroll ID',department:'Department',bankName:'Bank name',accountNumber:'Account number',bankBranch:'Bank branch',amount:'Amount',notes:'Notes',blank:'Blank column'});
function claimantRows(items,{individualSubmissions=false}={}){
  const groups=new Map(),normaliseName=value=>clean(value).toLowerCase().replace(/^(?:(?:prof(?:essor)?|dr|mr|mrs|ms)\.?\s+)+/i,'').replace(/\s+/g,' ');
  for(const [index,item] of items.entries()){
    const name=normaliseName(item.name),identity=clean(item.staffId||item.email).toLowerCase(),department=clean(item.department||item.departmentName).toLowerCase();
    // Project work is combined only for the same identifiable claimant in the
    // same department, mode and activity. Other activities keep separate rows.
    const project=['project-distance','project-non-residential'].includes(item.category),key=JSON.stringify([item.category,department,clean(item.mode).toLowerCase(),clean(item.activity).toLowerCase(),name,identity,individualSubmissions||!project||!name||!identity?item.id||item.reference||index:'']);
    if(!groups.has(key))groups.set(key,{name:item.name||'',email:item.email||'',staffId:item.staffId||'',department:item.departmentName||item.department||'',category:item.categoryLabel||'',categoryKey:item.category||'',mode:item.mode||'',activity:item.activity||'',quantity:0,submissionCount:0,references:[],ids:[],canPrepare:true,bankName:'',accountNumber:'',bankBranch:'',amount:'',notes:''});
    const row=groups.get(key);row.quantity+=item.quantity;row.submissionCount++;row.references.push(item.reference||'');row.ids.push(item.id);row.canPrepare=row.canPrepare&&item.canPrepare!==false;
  }
  return [...groups.values()].map(row=>({...row,references:row.references.join(' | ')})).sort((a,b)=>{
    const category=CATEGORY_ORDER.indexOf(a.categoryKey)-CATEGORY_ORDER.indexOf(b.categoryKey);if(category)return category;
    for(const field of ['department','mode','activity','name','references']){const result=clean(a[field]).localeCompare(clean(b[field]),'en',{sensitivity:'base',numeric:true});if(result)return result;}return 0;
  });
}
function renderRegisterPdf(model,{signature=null,logoPath=null,title='Claim Register',continuousNumbering=false,footerLabel='',notice='',individualSubmissions=false}={}){
  return new Promise((resolve,reject)=>{
    const document=new PDFDocument({size:'A4',layout:'portrait',margin:36,bufferPages:true,info:{Title:`${title} - ${model.reference}`,Author:'UCC-CoDE eServices'}}),chunks=[];
    document.on('data',chunk=>chunks.push(chunk));document.on('end',()=>resolve(Buffer.concat(chunks)));document.on('error',reject);
    const width=document.page.width-72,left=36,bottom=650,rows=claimantRows(model.items,{individualSubmissions}),sections=new Map();
    for(const row of rows){const key=JSON.stringify([row.categoryKey,row.department,row.mode,row.activity]);if(!sections.has(key))sections.set(key,{label:row.category,categoryKey:row.categoryKey,context:[row.department,row.mode,row.activity].filter(Boolean).join(' | '),rows:[]});sections.get(key).rows.push(row);}
    if(!sections.size)sections.set('empty',{label:model.categoryLabel||'No eligible claims',rows:[]});
    const date=new Date(model.createdAt||Date.now()).toLocaleDateString('en-GB',{timeZone:'Africa/Accra'});let y=0;
    const heading=(category,context)=>{
      if(logoPath)try{document.image(logoPath,left,32,{fit:[36,42]});}catch{}
      document.fillColor('#12344d').font('Helvetica-Bold').fontSize(13).text('UNIVERSITY OF CAPE COAST',logoPath?82:left,34,{width:width-46});
      document.fontSize(11).text('College of Distance Education',logoPath?82:left,53,{width:width-46});
      document.fontSize(15).text(title,left,82,{width});document.font('Helvetica').fontSize(9).fillColor('#34495e').text(clean(model.departmentName),left,105,{width});
      document.fontSize(7.5).text(`Reference: ${clean(model.reference)}    Prepared: ${date}`,left,121,{width});
      document.font('Helvetica-Bold').fontSize(11).fillColor('#173e59').text(clean(category),left,140,{width});
      document.font('Helvetica').fontSize(8);const contextHeight=context?document.heightOfString(clean(context),{width}):0;if(context)document.text(clean(context),left,155,{width});
      const countsY=155+contextHeight+3;document.text(`${model.items.length} approved submissions | ${rows.length} claimant and activity rows | ${model.items.reduce((sum,item)=>sum+item.quantity,0)} claim units`,left,countsY,{width});y=countsY+21;
      if(notice){const noticeY=countsY+15;document.fontSize(7.5).text(clean(notice),left,noticeY,{width});y=Math.max(y,noticeY+document.heightOfString(clean(notice),{width})+9);}
      document.rect(left,y,width,24).fill('#173e59');document.fillColor('white').font('Helvetica-Bold').fontSize(10).text('S/N',left+7,y+7,{width:29});document.text('Name of claimant',left+39,y+7,{width:width-133});document.text('No. of claims',left+width-91,y+7,{width:84,align:'right'});y+=24;
    };
    let first=true,serial=0;const orderedSections=[...sections.values()];
    for(const [sectionIndex,section] of orderedSections.entries()){
      if(!first)document.addPage();first=false;heading(section.label,section.context);let total=0;
      section.rows.forEach((row,index)=>{
        serial++;
        document.font('Helvetica').fontSize(10);const height=Math.max(34,document.heightOfString(clean(row.name),{width:width-140})+23),last=index===section.rows.length-1;
        if(y+height+(last?90:0)>bottom){document.addPage();heading(section.label,section.context);}
        document.rect(left,y,width,height).fill(index%2?'#f4f7fa':'#ffffff');document.strokeColor('#d7e0e6').lineWidth(.5).moveTo(left,y+height).lineTo(left+width,y+height).stroke();
        document.font('Helvetica').fontSize(10).fillColor('#162c3c').text(String(serial),left+7,y+8,{width:28});document.text(clean(row.name),left+39,y+5,{width:width-140});document.font('Helvetica').fontSize(7).fillColor('#526777').text(clean(row.submissionCount>1?`${row.submissionCount} submissions, see Excel for references`:row.references),left+39,y+height-12,{width:width-140,lineBreak:false});document.font('Helvetica-Bold').fontSize(10).fillColor('#162c3c').text(String(row.quantity),left+width-91,y+8,{width:84,align:'right'});y+=height;total+=row.quantity;
      });
      const multiple=orderedSections.filter(part=>part.categoryKey===section.categoryKey).length>1;
      document.rect(left,y,width,28).fill('#e2edf2');document.font('Helvetica-Bold').fontSize(11).fillColor('#173e59').text(multiple?'SECTION TOTAL CLAIMS':'CATEGORY TOTAL CLAIMS',left+8,y+9,{width:width-110});document.text(String(total),left+width-91,y+9,{width:84,align:'right'});y+=39;
      if(multiple&&orderedSections[sectionIndex+1]?.categoryKey!==section.categoryKey){const categoryTotal=rows.filter(row=>row.categoryKey===section.categoryKey).reduce((sum,row)=>sum+row.quantity,0);document.font('Helvetica-Bold').fontSize(10).text(`CATEGORY TOTAL CLAIMS: ${categoryTotal}`,left,y,{width});y+=18;}
      document.font('Helvetica').fontSize(9).text(`${section.rows.length} claimant and activity row(s) in this section.`,left,y,{width});
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
      document.fontSize(8).fillColor('#526777').text(`${clean(model.reference)} | ${footerLabel||(signature?'HoD endorsed':'Prepared for review')}`,left,793,{width:width-90,lineBreak:false});document.text(`Page ${index+1} of ${range.count}`,left+width-85,793,{width:85,align:'right',lineBreak:false});
    }
    document.end();
  });
}
function registerSpreadsheet(model,columns=null,format='xlsx'){
  const selected=columns||[{key:'name',label:'Name of claimant'},{key:'quantity',label:'Number of claims'},{key:'category',label:'Category'},{key:'department',label:'Department'},{key:'mode',label:'Study mode'},{key:'activity',label:'Activity'},{key:'references',label:'Submission references'}];
  if(!Array.isArray(selected)||!selected.length||selected.length>40||selected.some(column=>!Object.hasOwn(EXPORT_FIELDS,column.key)||!clean(column.label)||clean(column.label).length>100))throw new Error('Choose valid export columns and headings.');
  const rows=claimantRows(model.items),table=[selected.map(column=>clean(column.label)),...rows.map(row=>selected.map(column=>column.key==='blank'?'':row[column.key]??''))];
  if(format==='csv')return Buffer.from(table.map(row=>row.map(value=>`"${String(typeof value==='string'&&/^[=+@\-]/.test(value)?"'"+value:value).replace(/"/g,'""')}"`).join(',')).join('\r\n')+'\r\n','utf8');
  const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(table);sheet['!cols']=selected.map(column=>({wch:column.key==='name'?38:column.key==='references'?60:column.key==='quantity'?18:28}));sheet['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:table.length-1,c:selected.length-1}})};sheet['!margins']={left:.35,right:.35,top:.5,bottom:.5,header:.2,footer:.2};sheet['!pageSetup']={orientation:'portrait',paperSize:9,fitToWidth:1,fitToHeight:0};XLSX.utils.book_append_sheet(book,sheet,'Claim Register');
  if(!columns){
    const detail=XLSX.utils.aoa_to_sheet([['Submission reference','Name of claimant','Category','Number of claims','Department','Study mode','Activity'],...model.items.map(item=>[item.reference,item.name,item.categoryLabel,item.quantity,item.departmentName||item.department||'',item.mode||'',item.activity||''])]);detail['!cols']=[{wch:30},{wch:38},{wch:32},{wch:18},{wch:32},{wch:20},{wch:35}];detail['!autofilter']={ref:`A1:G${model.items.length+1}`};XLSX.utils.book_append_sheet(book,detail,'Submission Detail');
    const summary=XLSX.utils.aoa_to_sheet([['Register summary','Count'],['Approved submissions',model.items.length],['Claimant and activity rows',rows.length],['Claim units',model.items.reduce((sum,item)=>sum+item.quantity,0)],[],['Prepared',clean(model.createdAt)],['Reference',clean(model.reference)],['Selection fingerprint',model.exportFingerprint||'Saved approval register'],[],['Category','Submissions','Claimant and activity rows','Claim units'],...CATEGORY_ORDER.filter(category=>model.items.some(item=>item.category===category)).map(category=>{const items=model.items.filter(item=>item.category===category);return [items[0].categoryLabel,items.length,claimantRows(items).length,items.reduce((sum,item)=>sum+item.quantity,0)];})]);summary['!cols']=[{wch:35},{wch:28},{wch:28},{wch:18}];XLSX.utils.book_append_sheet(book,summary,'Register Summary');
  }
  return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
module.exports={renderRegisterPdf,registerSpreadsheet,claimantRows,EXPORT_FIELDS};

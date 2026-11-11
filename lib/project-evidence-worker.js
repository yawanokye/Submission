'use strict';
// Parse uploads outside the web server. No extracted text leaves this service.
const fs=require('fs/promises'),crypto=require('crypto');
function plainHtml(html){
  const decode=text=>text.replace(/&#(x[0-9a-f]+|\d+);/gi,(_,number)=>{const value=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):Number(number);return value<=0x10ffff?String.fromCodePoint(value):'';}).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
  return decode(html.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi,row=>row.replace(/<\/t[dh]>/gi,' | ').replace(/<\/p>/gi,' ').replace(/<[^>]+>/g,' ')+'\n').replace(/<\/(?:p|h[1-6]|li|table)>/gi,'\n').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' '));
}
process.once('message',async input=>{
  try{
    const bytes=await fs.readFile(input.path);if(bytes.length>20*1024*1024)throw new Error('This document exceeds the 20 MB text-check limit. Open it for manual review.');if(!bytes.length)throw new Error('This document is empty.');
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');let segments=[],partial=false,totalPages=null;
    if(input.extension==='.docx'){
      const mammoth=require('mammoth'),result=await mammoth.convertToHtml({buffer:bytes},{convertImage:mammoth.images.imgElement(()=>Promise.resolve({src:''}))});segments=[{page:null,text:plainHtml(result.value)}];
    }else if(input.extension==='.doc'){
      const WordExtractor=require('word-extractor'),result=await new WordExtractor().extract(bytes);segments=[{page:null,text:result.getBody()}];
    }else if(input.extension==='.pdf'){
      const {CanvasFactory}=require('pdf-parse/worker'),{PDFParse}=require('pdf-parse'),parser=new PDFParse({data:bytes,CanvasFactory});
      try{const result=await parser.getText({first:input.maxPages||30});totalPages=result.total;partial=totalPages>(input.maxPages||30);segments=(result.pages||[]).map(page=>({page:page.num,text:page.text}));if(!segments.length)segments=[{page:null,text:result.text}];}finally{await parser.destroy();}
    }else throw new Error('Text checks support DOCX, DOC and searchable PDF files. Open this file for manual review.');
    let remaining=input.textLimit||300000;segments=segments.map(segment=>{if(segment.text.length>remaining)partial=true;const text=segment.text.slice(0,Math.max(0,remaining));remaining-=text.length;return {...segment,text};}).filter(segment=>segment.text.trim());
    const readable=segments.some(segment=>/[A-Za-z]{3}/.test(segment.text));process.send({ok:true,sha256,segments,totalPages,partial,readable},()=>process.exit(0));
  }catch(exception){process.send({ok:false,error:String(exception.message||exception).slice(0,250)},()=>process.exit(0));}
});

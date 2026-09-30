export type ExportDay = { date: string; day: number; first: string; second: string };
const escape = (s: string) => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
// A stored ZIP archive: workbook exports stay in the browser with no external service.
function zip(files: Record<string,string>) {
 const enc=new TextEncoder(), parts:Uint8Array[]=[], directory:Uint8Array[]=[]; let offset=0;
 for(const [name,text] of Object.entries(files)) {
  const n=enc.encode(name), data=enc.encode(text); let crc=0xffffffff;
  for(const byte of data){crc^=byte;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);} crc=(crc^0xffffffff)>>>0;
  const h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,n.length,true);h.set(n,30);parts.push(h,data);
  const c=new Uint8Array(46+n.length),cv=new DataView(c.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);c.set(n,46);directory.push(c);offset+=h.length+data.length;
 }
 const size=directory.reduce((n,c)=>n+c.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
 v.setUint32(0,0x06054b50,true);v.setUint16(8,directory.length,true);v.setUint16(10,directory.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
 const result=new Uint8Array(offset+size+22);let at=0;for(const p of [...parts,...directory,end]){result.set(p,at);at+=p.length;}return result;
}
const cell=(ref:string,value:string,style=0)=>`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
const row=(r:number,cells:string,height:number)=>`<row r="${r}" ht="${height}" customHeight="1">${cells}</row>`;
export function scheduleWorkbook(year:number,month:number,facility:string,days:ExportDay[]):Uint8Array {
 const label=new Date(year,month-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'});
 const missing=days.filter(d=>d.first==='Unassigned'||d.second==='Unassigned').length;
 const title=row(1,cell('A1',`A3i / ${label}`,1),38)+row(2,cell('A2',`${facility} | ${missing?`${missing} unfinished days`:'All days assigned'} | Saved copy`,2),28);
 let calendar=title+row(3,cell('A3','First and second call. Edit in A3i, then download a fresh copy.',2),25);
 calendar+=row(4,['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i)=>cell(`${String.fromCharCode(65+i)}4`,d,3)).join(''),26);
 const lead=new Date(year,month-1,1).getDay(),weeks=Math.ceil((lead+days.length)/7);
 for(let w=0;w<weeks;w++)for(let part=0;part<3;part++){
  const r=5+w*3+part;
  calendar+=row(r,Array.from({length:7},(_,c)=>{
   const d=days[w*7+c-lead];return cell(`${String.fromCharCode(65+c)}${r}`,d?(part===0?String(d.day):`${part===1?'1st':'2nd'}  ${part===1?d.first:d.second}`):'',d?(part===0?4:5):6);
  }).join(''),part===0?24:33);
 }
 let list=title+row(3,cell('A3','Saved assignments from a3isolution.com. File edits do not update A3i.',2),25);
 list+=row(4,['Date','Day','First call','Second call'].map((d,i)=>cell(`${String.fromCharCode(65+i)}4`,d,3)).join(''),26);
 for(const d of days){const r=d.day+4,date=Date.UTC(year,month-1,d.day);list+=row(r,`<c r="A${r}" s="7"><v>${date/86400000+25569}</v></c>`+cell(`B${r}`,new Date(date).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),5)+cell(`C${r}`,d.first,5)+cell(`D${r}`,d.second,5),28);}
 const sheet=(data:string,cols:string,last:number,end:string,filter=false)=>`<worksheet xmlns="${ns}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${end}${last}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${data}</sheetData>${filter?`<autoFilter ref="A4:D${last}"/>`:''}<mergeCells count="3"><mergeCell ref="A1:${end}1"/><mergeCell ref="A2:${end}2"/><mergeCell ref="A3:${end}3"/></mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.3" bottom="0.3" header="0.1" footer="0.1"/><pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>`;
 const xf=(font:number,fill:number,border:number,fmt=0)=>`<xf numFmtId="${fmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment vertical="center" wrapText="1" indent="1"/></xf>`;
 const styles=`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="mmm d, yyyy"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/><color rgb="FF172D35"/></font><font><b/><sz val="24"/><name val="Calibri"/><color rgb="FF126B60"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="13"/><name val="Calibri"/><color rgb="FF172D35"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF126B60"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F2EE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F4F3"/></patternFill></fill></fills><borders count="2"><border/><border><left style="hair"><color rgb="FFCEDBD6"/></left><right style="hair"><color rgb="FFCEDBD6"/></right><top/><bottom style="hair"><color rgb="FFCEDBD6"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8">${xf(0,0,0)}${xf(1,0,0)}${xf(0,0,0)}${xf(2,2,0)}${xf(3,3,1)}${xf(0,0,1)}${xf(0,4,0)}${xf(0,0,1,164)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
 return zip({
 '[Content_Types].xml':`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${[1,2].map(i=>`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
 '_rels/.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
 'xl/workbook.xml':`<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="Monthly calendar" sheetId="1" r:id="rId1"/><sheet name="Assignments" sheetId="2" r:id="rId2"/></sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[1,2].map(i=>`<Relationship Id="rId${i}" Type="${rel}/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId3" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
 'xl/styles.xml':styles,
 'xl/worksheets/sheet1.xml':sheet(calendar,'<col min="1" max="7" width="25" customWidth="1"/>',4+weeks*3,'G'),
 'xl/worksheets/sheet2.xml':sheet(list,'<col min="1" max="2" width="20" customWidth="1"/><col min="3" max="4" width="32" customWidth="1"/>',4+days.length,'D',true)
 });
}

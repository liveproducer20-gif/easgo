"""Read-only XLSX inspection; stores hashes, headers and station codes, never credentials."""
from openpyxl.formula.translate import Translator
import sys,zipfile,xml.etree.ElementTree as E,json,hashlib,pathlib
N={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def inspect(path):
 with zipfile.ZipFile(path) as z:
  wb=E.fromstring(z.read('xl/workbook.xml'));rels={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))};sheets=[(s.attrib['name'],rels[s.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]) for s in wb.find('s:sheets',N)]
  strings=[''.join(t.itertext()) for t in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',N)] if 'xl/sharedStrings.xml' in z.namelist() else []
  target=dict(sheets)['EAS PRODUCTIVIDAD'];root=E.fromstring(z.read(target.lstrip('/') if target.startswith('/') else 'xl/'+target));rows=root.findall('s:sheetData/s:row',N);headers={};codes=set();hashes={};formulas=0;shared={}
  for row in rows:
   values={}
   for c in row:
    address=c.attrib['r'];col=''.join(filter(str.isalpha,address));v=c.find('s:v',N);f=c.find('s:f',N);t=c.attrib.get('t');value=strings[int(v.text)] if t=='s' and v is not None else ''.join(c.find('s:is',N).itertext()) if t=='inlineStr' else v.text if v is not None else ''
    if t not in ('s','inlineStr','b','e') and value:
     try:value=float(value);value=int(value) if value.is_integer() else value
     except ValueError:pass
    if row.attrib['r']=='3':headers[col]=value
    if col=='D' and str(value).startswith('EAS') and str(value)[3:4].isdigit():codes.add(value)
    if col<'B' or len(col)>1:continue
    if f is not None:
     formulas+=1;formula=f.text or ''
     if f.attrib.get('t')=='shared':
      si=f.attrib['si']
      if formula:shared[si]=(address,formula)
      elif si in shared:formula=Translator('='+shared[si][1],origin=shared[si][0]).translate_formula(address)[1:]
      else:raise ValueError('Shared formula has no origin: '+address)
     values[col]={'formula':formula}
    elif value!='':values[col]=value
   if values:hashes[row.attrib['r']]=hashlib.sha256(json.dumps(values,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
  return {'source':pathlib.Path(path).name,'sheet':'EAS PRODUCTIVIDAD','sheets':[s[0] for s in sheets],'headerRow':3,'headers':headers,'stations':sorted(codes),'rowHashes':hashes,'rows':max(int(r.attrib['r']) for r in rows),'formulas':formulas,'merges':[m.attrib['ref'] for m in root.findall('s:mergeCells/s:mergeCell',N)]}
if __name__=='__main__':
 reference=inspect(sys.argv[1]);pathlib.Path(sys.argv[2]).write_text(json.dumps(reference,ensure_ascii=False),encoding='utf8')
 if len(sys.argv)>3:
  online=inspect(sys.argv[3]);differences={'headers':reference['headers']!=online['headers'],'sheets':reference['sheets']!=online['sheets'],'merges':reference['merges']!=online['merges'],'formulas':[reference['formulas'],online['formulas']],'rows':[reference['rows'],online['rows']],'changedRows':[r for r in set(reference['rowHashes'])|set(online['rowHashes']) if reference['rowHashes'].get(r)!=online['rowHashes'].get(r)]};pathlib.Path(sys.argv[2]+'.comparison.json').write_text(json.dumps(differences,ensure_ascii=False),encoding='utf8');print(json.dumps({**differences,'changedRows':len(differences['changedRows'])}))

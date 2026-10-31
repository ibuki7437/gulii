/* Exact CN + product quantity aggregation. Shared by the offline page and tests. */
function aggregateWorkbook(wb,X){
  const columns=[],names=[],records=[],checks=[],nameOrder=[];
  for(const sheet of wb.SheetNames){
    const rows=X.utils.sheet_to_json(wb.Sheets[sheet],{header:1,defval:'',raw:true});
    const heads=rows.map((row,i)=>String(row[1]??'').trim()==='种类'?i:-1).filter(i=>i>=0);
    if(!heads.length)continue;
    if(heads.length>1)throw Error(`“${sheet}”中有多段种类表头，请拆开后分别处理`);
    const h=heads[0],people=rows.findIndex((r,i)=>i>h&&String(r[1]).includes('昵称/总数'));
    if(people<0)throw Error(`“${sheet}”缺少昵称/总数行`);
    for(const row of rows.slice(people+1)){const cn=String(row[1]??'').trim();if(cn&&!nameOrder.includes(cn))nameOrder.push(cn);}
    const categoryRow=rows.slice(0,h).find(r=>String(r[1]).trim()==='分类')??[];
    const priceRow=rows.slice(h+1,people).find(r=>String(r[1]).includes('单价'))??[];
    let category=sheet;
    const width=Math.max(...rows.map(r=>r.length));
    for(let c=2;c<width;c++){
      if(String(categoryRow[c]??'').trim())category=String(categoryRow[c]).trim();
      const product=String(rows[h][c]??'').trim();
      let actual=0;
      for(let r=people+1;r<rows.length;r++){
        const cell=wb.Sheets[sheet][X.utils.encode_cell({r,c})];
        if(cell?.f&&(cell.v===undefined||cell.v===null||cell.v===''))throw Error(`“${sheet}”的 ${X.utils.encode_cell({r,c})} 公式没有可读取的结果，请先在 Excel 中重新计算并保存`);
        if(cell?.t==='e')throw Error(`“${sheet}”的 ${X.utils.encode_cell({r,c})} 存在公式错误`);
        const raw=rows[r][c];if(raw===''||raw===null||raw===undefined)continue;
        if(!['number','string'].includes(typeof raw)||!Number.isSafeInteger(Number(raw))||Number(raw)<0)throw Error(`“${sheet}”第 ${r+1} 行、第 ${c+1} 列不是有效的非负整数数量`);
        const qty=Number(raw);if(!qty)continue;
        const cn=String(rows[r][1]??'').trim();
        if(!cn||!product)throw Error(`“${sheet}”第 ${r+1} 行、第 ${c+1} 列有数量，但缺少 CN 或种类`);
        if(['合计','总计','总数'].includes(cn))throw Error(`“${sheet}”第 ${r+1} 行疑似合计行，请先去掉该行，避免重复计数`);
        actual+=qty;if(!Number.isSafeInteger(actual))throw Error('数量过大');
        if(!names.includes(cn))names.push(cn);
        records.push({sheet,category,product,cn,qty,price:priceRow[c]??'',cell:X.utils.encode_cell({r,c})});
      }
      if(!product)continue;
      const expected=rows[people][c];
      if(expected!==''&&expected!==null&&expected!==undefined&&(!Number.isSafeInteger(Number(expected))||Number(expected)!==actual))throw Error(`“${sheet}” ${category}／${product}：表头总数 ${expected} 与逐人数量 ${actual} 不一致`);
      columns.push({sheet,category,product,qty:actual,column:c+1});
      checks.push(actual);
    }
  }
  if(!columns.length)throw Error('没有找到原始排表，请选择含“种类”和“昵称/总数”的 Excel 汇总表');
  const products=[...new Set(columns.map(c=>c.product))];
  const categories=[...new Set(columns.map(c=>c.category))];
  names.sort((a,b)=>nameOrder.indexOf(a)-nameOrder.indexOf(b));
  const matrix=names.map(cn=>({cn,counts:products.map(product=>records.filter(r=>r.cn===cn&&r.product===product).reduce((s,r)=>s+r.qty,0))}));
  const total=records.reduce((s,r)=>s+r.qty,0);
  if(!Number.isSafeInteger(total))throw Error('总件数过大');
  const after=matrix.reduce((s,row)=>s+row.counts.reduce((a,b)=>a+b,0),0);
  if(after!==total||checks.reduce((s,n)=>s+n,0)!==total)throw Error('数量核对未通过');
  return {columns,names,products,categories,records,matrix,total};
}
function summaryWorkbook(result,X,name){
  const end=result.names.length+5;
  const rows=[['按 CN 合并的数量汇总'],['','分类',name],['','种类',...result.products],['单位：件','单价未合并'],['个人件数','昵称/总数',...result.products.map((_,c)=>result.matrix.reduce((s,row)=>s+row.counts[c],0))],...result.matrix.map(row=>[row.counts.reduce((s,n)=>s+n,0),row.cn,...row.counts])];
  const sheet=X.utils.aoa_to_sheet(rows);
  for(let r=5;r<rows.length;r++){const cell=sheet[X.utils.encode_cell({r,c:0})];cell.f=`SUM(C${r+1}:${X.utils.encode_col(result.products.length+1)}${r+1})`;}
  result.products.forEach((_,c)=>{sheet[X.utils.encode_cell({r:4,c:c+2})].f=`SUM(${X.utils.encode_col(c+2)}6:${X.utils.encode_col(c+2)}${end})`;});
  sheet['!cols']=[{wch:12},{wch:30},...result.products.map(()=>({wch:12}))];
  const wb=X.utils.book_new();X.utils.book_append_sheet(wb,sheet,'CN汇总');
  const detail=[['原分类','种类名称','CN','数量','原单价','来源工作表','来源单元格'],...result.records.map(r=>[r.category,r.product,r.cn,r.qty,r.price,r.sheet,r.cell])];
  const ds=X.utils.aoa_to_sheet(detail);ds['!cols']=[{wch:16},{wch:16},{wch:30},{wch:10},{wch:12},{wch:20},{wch:16}];X.utils.book_append_sheet(wb,ds,'来源明细');return wb;
}
export {aggregateWorkbook,summaryWorkbook};

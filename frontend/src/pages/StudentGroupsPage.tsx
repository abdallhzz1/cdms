import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Copy, Link2, Plus, Trash2, Upload } from 'lucide-react';

type Subgroup={id:number;name:string;capacity:number;max_size:number;is_active:boolean;current_students_count:number};
type Group={id:number;name:string;subgroups:Subgroup[]};
type Cycle={id:number;public_id:string;academic_year_id:number;academic_year?:{code:string;name?:string};academic_level:string;status:string;default_capacity:number;rosters_count:number;registered_rosters_count:number;public_url:string;groups:Group[]};
type Year={id:number;code:string;name?:string};
const levels={fourth:'السنة الرابعة — L, M, N',fifth:'السنة الخامسة — A, B, C',sixth:'السنة السادسة'};

export function StudentGroupsPage(){
  const {can}=useAuth(), qc=useQueryClient();
  const [yearId,setYearId]=useState(''),[level,setLevel]=useState('fourth'),[capacity,setCapacity]=useState(6),[selectedId,setSelectedId]=useState<number|null>(null),[csv,setCsv]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const {data:cycles=[],refetch}=useQuery({queryKey:['group-registration-cycles'],queryFn:()=>apiFetch<Cycle[]>('/group-registration-cycles')});
  const {data:years=[]}=useQuery({queryKey:['academic-years'],queryFn:()=>apiFetch<Year[]>('/academic-years?per_page=100')});
  const selected=useMemo(()=>cycles.find(c=>c.id===selectedId)||cycles[0],[cycles,selectedId]);
  const run=async(fn:()=>Promise<unknown>)=>{setBusy(true);setError('');try{await fn();await qc.invalidateQueries({queryKey:['group-registration-cycles']});await refetch();}catch(e){setError(e instanceof ApiError?e.message:'تعذر تنفيذ العملية.')}finally{setBusy(false)}};
  const create=(e:FormEvent)=>{e.preventDefault();run(()=>apiFetch('/group-registration-cycles',{method:'POST',body:{academic_year_id:Number(yearId),academic_level:level,default_capacity:capacity}}));};
  const updateCycle=(status:string)=>selected&&run(()=>apiFetch(`/group-registration-cycles/${selected.id}`,{method:'PUT',body:{status}}));
  const importRoster=()=>{if(!selected)return;const lines=csv.trim().split(/\r?\n/).filter(Boolean);const rows=lines.map(line=>{const c=line.split(',').map(x=>x.trim());return {university_number:c[0],full_name_ar:c[1]||undefined,main_group_code:c[2],academic_registration_status:(c[3]||'registered').toLowerCase()};}).filter((_,i)=>!(i===0&&/university|الرقم/.test(lines[0].toLowerCase())));run(()=>apiFetch(`/group-registration-cycles/${selected.id}/roster`,{method:'POST',body:{students:rows}})).then(()=>setCsv(''));};
  const addSub=(group:Group)=>{const next=group.subgroups.length+1;const name=prompt('اسم المجموعة الفرعية',`${group.name}${next}`);if(name&&selected)run(()=>apiFetch(`/group-registration-cycles/${selected.id}/groups/${group.id}/subgroups`,{method:'POST',body:{name,capacity:selected.default_capacity}}));};
  const editSub=(s:Subgroup)=>{if(!selected)return;const name=prompt('اسم المجموعة الفرعية',s.name);if(!name)return;const cap=Number(prompt('السعة 5 أو 6',String(s.capacity||s.max_size||6)));if(![5,6].includes(cap))return;run(()=>apiFetch(`/group-registration-cycles/${selected.id}/subgroups/${s.id}`,{method:'PUT',body:{name,capacity:cap,is_active:s.is_active}}));};
  const removeSub=(s:Subgroup)=>selected&&confirm(`حذف/أرشفة ${s.name}؟`)&&run(()=>apiFetch(`/group-registration-cycles/${selected.id}/subgroups/${s.id}`,{method:'DELETE'}));
  const copyLink=()=>selected&&navigator.clipboard.writeText(`${location.origin}${selected.public_url}`);
  return <div dir="rtl" className="space-y-6">
    <div><h1 className="text-2xl font-black text-slate-900">إدارة التسجيل الذاتي للمجموعات</h1><p className="mt-1 text-sm text-slate-500">إنشاء الدورات، استيراد القوائم، إدارة الشعب، وفتح الرابط العام الآمن.</p></div>
    {error&&<div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{error}</div>}
    {can('group_registration.manage_groups')&&<Card className="p-5"><form onSubmit={create} className="grid gap-3 md:grid-cols-4"><select required value={yearId} onChange={e=>setYearId(e.target.value)} className="rounded-xl border p-2"><option value="">العام الأكاديمي</option>{years.map(y=><option key={y.id} value={y.id}>{y.name||y.code}</option>)}</select><select value={level} onChange={e=>setLevel(e.target.value)} className="rounded-xl border p-2">{Object.entries(levels).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select><select value={capacity} onChange={e=>setCapacity(Number(e.target.value))} className="rounded-xl border p-2"><option value={6}>السعة 6</option><option value={5}>السعة 5</option></select><Button isLoading={busy}><Plus className="ml-2 h-4 w-4"/>إنشاء دورة ومجموعات فارغة</Button></form></Card>}
    <div className="flex gap-2 overflow-x-auto">{cycles.map(c=><button key={c.id} onClick={()=>setSelectedId(c.id)} className={`whitespace-nowrap rounded-xl border px-4 py-2 text-sm font-bold ${(selected?.id===c.id)?'bg-teal-600 text-white':'bg-white'}`}>{levels[c.academic_level as keyof typeof levels]} · {c.academic_year?.code} · {c.status}</button>)}</div>
    {selected&&<>
      <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black">{levels[selected.academic_level as keyof typeof levels]} · {selected.academic_year?.code}</h2><p className="mt-1 text-sm text-slate-500">القائمة: {selected.rosters_count} · المسجلون أكاديمياً: {selected.registered_rosters_count}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copyLink}><Copy className="ml-1 h-4 w-4"/>نسخ الرابط</Button>{can('group_registration.open_close')&&<Button variant={selected.status==='open'?'danger':'primary'} onClick={()=>updateCycle(selected.status==='open'?'closed':'open')} isLoading={busy}>{selected.status==='open'?'إغلاق التسجيل':'فتح التسجيل'}</Button>}</div></div><div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 p-3 font-mono text-xs"><Link2 className="h-4 w-4"/>{location.origin}{selected.public_url}</div></Card>
      {can('group_registration.manage_roster')&&<Card className="p-5 space-y-3"><h3 className="font-bold">استيراد قائمة الطلبة</h3><p className="text-xs text-slate-500">كل سطر: الرقم الجامعي، الاسم، المجموعة الرئيسية، registered أو unregistered</p><input type="file" accept=".csv,text/csv" className="block w-full rounded-xl border p-2 text-sm" onChange={e=>{const file=e.target.files?.[0];if(file){const reader=new FileReader();reader.onload=event=>setCsv(String(event.target?.result||''));reader.readAsText(file,'UTF-8');}}}/><textarea rows={7} value={csv} onChange={e=>setCsv(e.target.value)} className="w-full rounded-xl border p-3 font-mono text-sm" placeholder={'22210466,اسم الطالب,L,registered\n22210467,اسم الطالب,M,unregistered'}/><Button onClick={importRoster} disabled={!csv.trim()} isLoading={busy}><Upload className="ml-2 h-4 w-4"/>استيراد وحفظ القائمة</Button></Card>}
      <div className="grid gap-5 lg:grid-cols-3">{selected.groups.map(g=><Card key={g.id} className="p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-black">المجموعة {g.name}</h3>{can('group_registration.manage_groups')&&<button onClick={()=>addSub(g)} className="rounded-lg bg-teal-50 p-2 text-teal-700"><Plus className="h-4 w-4"/></button>}</div><div className="space-y-2">{g.subgroups.map(s=><div key={s.id} className={`rounded-xl border p-3 ${!s.is_active?'opacity-50':''}`}><div className="flex items-center justify-between"><button onClick={()=>can('group_registration.manage_groups')&&editSub(s)} className="font-bold">{s.name}</button><span className="text-xs">{s.current_students_count||0}/{s.capacity||s.max_size}</span>{can('group_registration.manage_groups')&&<button onClick={()=>removeSub(s)} className="text-red-500"><Trash2 className="h-4 w-4"/></button>}</div></div>)}</div></Card>)}</div>
    </>}
  </div>;
}

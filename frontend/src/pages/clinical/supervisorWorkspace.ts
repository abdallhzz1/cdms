export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';
export type Student = { id:number; university_number:string; full_name_ar:string; full_name_en?:string|null };
export type Assignment = { id:number; distribution_version_id:number; rotation_block_id:number|null; training_site_id:number|null; student_subgroup_id:number|null; session_start_date?:string|null; session_end_date?:string|null; student:Student; student_subgroup?:{name:string;group?:{name:string}}|null; rotation_block?:{block_code:string;from_week?:number|null;to_week?:number|null;rotation?:{name?:string;start_date?:string|null;course?:{name_ar?:string;name_en?:string};academic_year?:{code:string}}}|null; training_site?:{name_ar:string;name_en?:string|null}|null; department?:{name_ar:string;name_en?:string|null}|null };
export type AttendanceRecord = { student_id:number; status:AttendanceStatus; excuse_note?:string|null; session?:{rotation_block_id:number|null;session_date:string}|null };
export type Assessment = { id:number; student_id:number; score:string|number|null; status:string; notes?:string|null; return_reason?:string|null; created_at:string; student?:Student; session?:{rotation_block_id:number|null;session_date:string}|null };
export type Workspace = { supervisor:{full_name_ar:string;full_name_en:string}; assignments:Assignment[]; attendance_records:AttendanceRecord[]; assessments:Assessment[] };
export type SupervisorGroup = { key:string; assignmentId:number; rotationBlockId:number|null; subgroup:string; group:string; courseAr:string; courseEn:string; periodAr:string; periodEn:string; siteAr:string; siteEn:string; departmentAr:string; departmentEn:string; academicYear:string; startDate:string; endDate:string; students:Student[] };

export const workspaceQueryKey = ['supervisor-workspace'] as const;
export const dateValue = (date:Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const today = () => dateValue(new Date());
export const isDateValue = (value:string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const normalizedDate = (value:string|null|undefined) => { const raw=String(value??''); if(isDateValue(raw))return raw; const parsed=new Date(raw); return Number.isNaN(parsed.getTime())?'':dateValue(parsed); };
const addDays = (value:string,days:number) => { const base=normalizedDate(value); if(!base)return ''; const date=new Date(`${base}T12:00:00`); date.setDate(date.getDate()+days); return dateValue(date); };
export const clampDate = (group:SupervisorGroup,value:string) => { const candidate=normalizedDate(value)||normalizedDate(group.startDate)||today(); return group.startDate && candidate < group.startDate ? group.startDate : group.endDate && candidate > group.endDate ? group.endDate : candidate; };
export const defaultGroupDate = (group:SupervisorGroup) => clampDate(group,today());
export const studentName = (student:Student,ar:boolean) => ar ? student.full_name_ar : student.full_name_en || student.full_name_ar;
export const groupName = (group:SupervisorGroup,ar:boolean) => `${ar?group.courseAr:group.courseEn} — ${group.group} (${group.subgroup})`;
export function supervisorErrorMessage(error:unknown,ar:boolean,fallback:string){
  if(!(error instanceof ApiError))return fallback;
  const first=Object.values(error.errors??{}).flatMap(value=>Array.isArray(value)?value:[value]).find(value=>typeof value==='string');
  const message=String(first??error.message??'');
  if(!ar)return message||fallback;
  if(message.includes('session date field is required')||message.includes('session_date'))return 'يرجى تحديد تاريخ الجلسة أولاً.';
  if(message.includes('valid date'))return 'تاريخ الجلسة غير صالح. اختر تاريخاً من الحقل المخصص.';
  if(message.includes('Every student in the selected group'))return 'يجب إدخال علامة صحيحة لكل طالب في المجموعة قبل الإرسال.';
  if(message.includes('already has an assessment awaiting review or approved'))return 'يوجد تقييم مرسل أو معتمد مسبقاً لهذا التاريخ ولا يمكن إرساله مرة أخرى.';
  return message||fallback;
}

export function groupSupervisorAssignments(assignments:Assignment[]):SupervisorGroup[]{
  const map=new Map<string,SupervisorGroup>();
  for(const item of assignments){
    const key=[item.distribution_version_id,item.rotation_block_id??'x',item.training_site_id??'x',item.student_subgroup_id??'x'].join('-');
    const block=item.rotation_block,rotation=block?.rotation,start=normalizedDate(rotation?.start_date),from=Number(block?.from_week??1),to=Number(block?.to_week??from),serverStart=normalizedDate(item.session_start_date),serverEnd=normalizedDate(item.session_end_date);
    if(!map.has(key))map.set(key,{key,assignmentId:item.id,rotationBlockId:item.rotation_block_id,subgroup:item.student_subgroup?.name??'—',group:item.student_subgroup?.group?.name??item.student_subgroup?.name??'—',courseAr:rotation?.course?.name_ar??rotation?.name??'المساق السريري',courseEn:rotation?.course?.name_en??rotation?.name??'Clinical course',periodAr:block?.from_week&&block?.to_week?`الأسبوع ${block.from_week}–${block.to_week}`:block?.block_code??'الفترة الحالية',periodEn:block?.from_week&&block?.to_week?`Week ${block.from_week}–${block.to_week}`:block?.block_code??'Current period',siteAr:item.training_site?.name_ar??'غير محدد',siteEn:item.training_site?.name_en??item.training_site?.name_ar??'Not specified',departmentAr:item.department?.name_ar??'غير محدد',departmentEn:item.department?.name_en??item.department?.name_ar??'Not specified',academicYear:rotation?.academic_year?.code??'—',startDate:serverStart||(start?addDays(start,(from-1)*7):''),endDate:serverEnd||(start?addDays(start,to*7-1):''),students:[]});
    const group=map.get(key)!;if(!group.students.some(student=>student.id===item.student.id))group.students.push(item.student);
  }
  return [...map.values()];
}
import { ApiError } from '@/api/client';

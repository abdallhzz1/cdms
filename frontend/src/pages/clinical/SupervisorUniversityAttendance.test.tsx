import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SupervisorUniversityAttendance } from './SupervisorUniversityAttendance';
import { today } from './supervisorWorkspace';

vi.mock('qrcode',()=>({default:{toDataURL:vi.fn(async()=> 'data:image/png;base64,cXJjb2Rl')}}));

const envelope=(data:unknown)=>new Response(JSON.stringify({success:true,data,message:null,meta:{}}),{status:200,headers:{'Content-Type':'application/json'}});
const date='2026-10-08';
const lecture=(id:number,title:string,time:string)=>({id,title,weekday:'thursday',starts_at:time,ends_at:'11:00:00',scheduled_dates:[date],student_group_id:4,group:{name:'A',academic_year:{code:'2026/2027'}},is_active:true});
const rows=[
  {student:{id:7,university_number:'22010007',full_name_ar:'طالب أول',full_name_en:'First Student'},subgroup:{id:1,name:'A1'},status:null,excuse_note:null,recorded_by:null,updated_at:null},
  {student:{id:8,university_number:'22010008',full_name_ar:'طالب ثان',full_name_en:'Second Student'},subgroup:{id:2,name:'A2'},status:null,excuse_note:null,recorded_by:null,updated_at:null},
];
afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; Max-Age=0; path=/';});

describe('university lecture attendance',()=>{
  it('shows all subgroups and keeps two same-day lectures as separate registers',async()=>{
    window.localStorage.setItem('cdms.locale','en');document.cookie='XSRF-TOKEN=test; path=/';
    const sent:{url:string;body:Record<string,unknown>}[]=[];const saved=new Map<number,typeof rows>();
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,roles:['CLINICAL_SUPERVISOR'],permissions:[]});
      if(url.includes('/university-attendance/mine'))return envelope([lecture(11,'First lecture','08:00:00'),lecture(12,'Second lecture','10:00:00')]);
      if(url.includes('/university-attendance/plans/')&&init?.method==='POST'){const body=JSON.parse(String(init.body));sent.push({url,body});saved.set(url.includes('/12/')?12:11,rows.map(row=>({...row,status:body.records.find((record:{student_id:number})=>record.student_id===row.student.id).status})));return envelope({session_id:19,is_approved:true});}
      if(url.includes('/university-attendance/plans/')){const id=url.includes('/12/')?12:11;return envelope({session_id:saved.has(id)?19:null,is_approved:saved.has(id),can_edit:!saved.has(id),lecture:lecture(id,'First lecture','08:00:00'),rows:saved.get(id)??rows});}
      throw new Error(`Unmocked ${url}`);
    });
    renderWithProviders(<SupervisorUniversityAttendance/>,{route:`/supervisor/attendance?date=${date}`});
    expect(await screen.findByText('Subgroup A1 · 1')).toBeVisible();
    expect(screen.getByText('Subgroup A2 · 1')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'All present'}));
    await userEvent.click(screen.getAllByRole('button',{name:'Approve attendance'})[0]);
    await waitFor(()=>expect(sent).toHaveLength(1));
    expect(sent[0].url).toContain('/plans/11/day');
    expect(sent[0].body).toMatchObject({session_date:date,records:[{student_id:7,status:'present'},{student_id:8,status:'present'}]});
    await screen.findByText('Approved attendance register');
    expect(screen.queryByRole('button',{name:'All present'})).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Lecture and main group'),'12');
    await waitFor(()=>expect(screen.getAllByRole('button',{name:'Approve attendance'})[0]).toBeDisabled());
    await userEvent.click(screen.getByRole('button',{name:'All present'}));
    await userEvent.click(screen.getAllByRole('button',{name:'Approve attendance'})[0]);
    await waitFor(()=>expect(sent).toHaveLength(2));
    expect(sent[1].url).toContain('/plans/12/day');
  });
  it('opens and closes QR inside the existing supervisor attendance screen',async()=>{
    window.localStorage.setItem('cdms.locale','en');document.cookie='XSRF-TOKEN=test; path=/';
    const sessionDate=today();let state:'open'|'closed'|null=null;
    const calls:string[]=[];
    vi.spyOn(window,'confirm').mockReturnValue(true);
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);calls.push(`${init?.method??'GET'} ${url}`);
      const item={...lecture(21,'Campus lecture','09:00:00'),scheduled_dates:[sessionDate]};
      if(url.includes('/auth/me'))return envelope({id:1,roles:['CLINICAL_SUPERVISOR'],permissions:[]});
      if(url.includes('/university-attendance/mine'))return envelope([item]);
      if(url.includes('/qr/open')){state='open';return envelope({session_id:30,qr_state:state});}
      if(url.includes('/qr/close')){state='closed';return envelope({session_id:30,qr_state:state});}
      if(url.includes('/qr?'))return envelope({token:'signed-lecture-token',expires_at:new Date().toISOString()});
      if(url.includes('/university-attendance/plans/'))return envelope({session_id:state?30:null,qr_state:state,lecture:item,rows});
      throw new Error(`Unmocked ${url}`);
    });
    renderWithProviders(<SupervisorUniversityAttendance/>,{route:`/supervisor/attendance?date=${sessionDate}`});
    await screen.findByText('Subgroup A1 · 1');
    await userEvent.click(screen.getByRole('button',{name:'QR'}));
    await userEvent.click(screen.getByRole('button',{name:'Open lecture QR'}));
    expect(await screen.findByAltText('Lecture attendance QR code')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Manual'}));
    expect(screen.queryByRole('button',{name:'All present'})).not.toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'Approve attendance'})[0]).toBeEnabled();
    await userEvent.click(screen.getByRole('button',{name:'QR'}));
    await userEvent.click(screen.getByRole('button',{name:'Approve attendance and close QR'}));
    await waitFor(()=>expect(calls.some(call=>call.includes('/qr/close'))).toBe(true));
    await screen.findByText('Approved attendance register');
    expect(screen.queryByRole('button',{name:'QR'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Approve attendance'})).not.toBeInTheDocument();
  });
  it('opens approved registers read-only and requires an explicit authorized correction with a reason',async()=>{
    window.localStorage.setItem('cdms.locale','en');document.cookie='XSRF-TOKEN=test; path=/';
    let corrected=false;let sent:Record<string,unknown>|null=null;
    const item=lecture(11,'Approved lecture','08:00:00');
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:2,roles:['ADMIN_ASSISTANT'],permissions:[]});
      if(init?.method==='POST'){sent=JSON.parse(String(init.body));corrected=true;return envelope({session_id:19,is_approved:true});}
      if(url.includes('/plans/11/day'))return envelope({session_id:19,qr_state:null,is_approved:true,can_edit:true,can_correct_approved:true,lecture:item,rows:rows.map((row,index)=>({...row,status:corrected&&index===0?'absent':'present'}))});
      throw new Error(`Unmocked ${url}`);
    });
    renderWithProviders(<SupervisorUniversityAttendance lecture={item} sessionDate={date} canRecord={false}/>,{route:'/attendance/university'});
    await screen.findByText('Approved attendance register');
    expect(screen.queryByRole('button',{name:'All present'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'QR'})).not.toBeInTheDocument();
    expect(screen.queryByRole('group',{name:'Status of First Student'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'Correct register'}));
    await userEvent.click(within(screen.getByRole('group',{name:'Status of First Student'})).getByRole('button',{name:'Absent'}));
    expect(screen.getAllByRole('button',{name:'Save correction'})[0]).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Correction reason (at least 10 characters)'),'Correct documented attendance');
    await userEvent.click(screen.getAllByRole('button',{name:'Save correction'})[0]);
    await waitFor(()=>expect(sent).toMatchObject({session_date:date,correction_reason:'Correct documented attendance',records:[{student_id:7,status:'absent'},{student_id:8,status:'present'}]}));
    await waitFor(()=>expect(screen.queryByRole('button',{name:'Save correction'})).not.toBeInTheDocument());
    expect(screen.queryByRole('button',{name:'All present'})).not.toBeInTheDocument();
  });

});

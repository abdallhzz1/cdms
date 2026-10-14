import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SupervisorUniversityAttendance } from './SupervisorUniversityAttendance';

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
    const sent:{url:string;body:Record<string,unknown>}[]=[];
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,roles:['CLINICAL_SUPERVISOR'],permissions:[]});
      if(url.includes('/university-attendance/mine'))return envelope([lecture(11,'First lecture','08:00:00'),lecture(12,'Second lecture','10:00:00')]);
      if(url.includes('/university-attendance/plans/')&&init?.method==='POST'){sent.push({url,body:JSON.parse(String(init.body))});return envelope({session_id:19});}
      if(url.includes('/university-attendance/plans/'))return envelope({session_id:null,lecture:lecture(url.includes('/12/')?12:11,'First lecture','08:00:00'),rows});
      throw new Error(`Unmocked ${url}`);
    });
    renderWithProviders(<SupervisorUniversityAttendance/>,{route:`/supervisor/attendance?date=${date}`});
    expect(await screen.findByText('Subgroup A1 · 1')).toBeVisible();
    expect(screen.getByText('Subgroup A2 · 1')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'All present'}));
    await userEvent.click(screen.getByRole('button',{name:'Save lecture attendance'}));
    await waitFor(()=>expect(sent).toHaveLength(1));
    expect(sent[0].url).toContain('/plans/11/day');
    expect(sent[0].body).toMatchObject({session_date:date,records:[{student_id:7,status:'present'},{student_id:8,status:'present'}]});
    await userEvent.selectOptions(screen.getByLabelText('Lecture and main group'),'12');
    await waitFor(()=>expect(screen.getByRole('button',{name:'Save lecture attendance'})).toBeDisabled());
    await userEvent.click(screen.getByRole('button',{name:'All present'}));
    await userEvent.click(screen.getByRole('button',{name:'Save lecture attendance'}));
    await waitFor(()=>expect(sent).toHaveLength(2));
    expect(sent[1].url).toContain('/plans/12/day');
  });
});

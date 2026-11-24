import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { UniversityAttendanceAdminPage } from './UniversityAttendanceAdminPage';
import { today } from './supervisorWorkspace';

const envelope=(data:unknown)=>new Response(JSON.stringify({success:true,data,message:null,meta:{}}),{status:200,headers:{'Content-Type':'application/json'}});
afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; Max-Age=0; path=/';});

describe('university lecture planning',()=>{
  it('lets an attendance-only administrative assistant open another lecturers register and QR',async()=>{
    window.localStorage.setItem('cdms.locale','en');document.cookie='XSRF-TOKEN=test; path=/';
    const date=today();let state:'open'|null=null;const calls:string[]=[];
    const group={id:4,name:'A',academic_level:'fourth',academic_year:{code:'2026/2027',start_date:'2026-09-01',end_date:'2027-08-31',is_current:true}};
    const plan={id:21,student_group_id:4,title:'Training lecture',weekday:'thursday',starts_at:'09:00:00',ends_at:'11:30:00',starts_on:date,ends_on:date,scheduled_dates:[date],is_active:true,sessions_count:0,can_record_attendance:true,group,supervisor:{id:9,full_name_ar:'محاضر تجريبي',full_name_en:'Test lecturer'}};
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);calls.push(url);
      if(url.includes('/auth/me'))return envelope({id:2,roles:['ADMIN_ASSISTANT'],permissions:[{code:'university_lectures.attendance.manage',scope:'global'}]});
      if(url.includes('/qr/open')){state='open';return envelope({session_id:30,qr_state:state});}
      if(url.includes('/qr?'))return envelope({token:'signed-token',expires_at:new Date().toISOString()});
      if(url.includes('/plans/21/day'))return envelope({session_id:state?30:null,qr_state:state,lecture:plan,rows:[{student:{id:7,university_number:'22123456',full_name_ar:'طالب تجريبي',full_name_en:'Test student'},subgroup:{id:8,name:'A1'},status:null,excuse_note:null}]});
      if(url.includes('/university-attendance/plans'))return envelope({groups:[group],supervisors:[],lectures:[plan],sessions:[]});
      throw new Error(`Unmocked ${init?.method} ${url}`);
    });
    renderWithProviders(<UniversityAttendanceAdminPage/>,{route:'/attendance/university'});
    await userEvent.click(await screen.findByRole('button',{name:'Attendance register'}));
    expect(await screen.findByText('Test student')).toBeVisible();
    expect(screen.queryByRole('button',{name:'Add lecture'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button',{name:'QR'}));
    await userEvent.click(screen.getByRole('button',{name:'Open lecture QR'}));
    expect(await screen.findByAltText('Lecture attendance QR code')).toBeVisible();
    expect(calls.some(url=>url.includes('/plans/21/qr/open'))).toBe(true);
    expect(calls.some(url=>url.includes('/university-attendance/mine'))).toBe(false);
  });

  it('allows an RTA to add a dated lecture with only date, instructor, time and topic',async()=>{
    window.localStorage.setItem('cdms.locale','en');document.cookie='XSRF-TOKEN=test; path=/';
    let posted:Record<string,unknown>|null=null;
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,roles:['RTA'],permissions:[{code:'university_lectures.manage',scope:'global'}]});
      if(url.includes('/university-attendance/plans')&&init?.method==='POST'){posted=JSON.parse(String(init.body));return envelope({id:10});}
      if(url.includes('/university-attendance/plans'))return envelope({groups:[{id:4,name:'A',academic_level:'fourth',academic_year:{code:'2026/2027',start_date:'2026-09-01',end_date:'2027-08-31',is_current:true}}],supervisors:[{id:9,full_name_ar:'د. خالد',full_name_en:'Dr Khaled'},{id:10,full_name_ar:'د. أحمد',full_name_en:'Dr Ahmad'}],lectures:[],sessions:[]});
      throw new Error(`Unmocked ${url}`);
    });
    renderWithProviders(<UniversityAttendanceAdminPage/>,{route:'/attendance/university'});
    await screen.findByText('Main-group university lectures');
    await userEvent.click(await screen.findByRole('button',{name:'Add lecture'}));
    await userEvent.type(await screen.findByLabelText('Topic'),'Clinical lecture');
    await userEvent.type(screen.getByLabelText('Date'),'2026-10-15');
    await userEvent.type(screen.getByRole('combobox',{name:'Lecturer'}),'Khaled');
    expect(screen.queryByRole('option',{name:'Dr Ahmad'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option',{name:'Dr Khaled'}));
    await userEvent.click(screen.getAllByRole('button',{name:'Add lecture'}).at(-1)!);
    await waitFor(()=>expect(posted).toMatchObject({student_group_id:4,supervisor_person_id:9,title:'Clinical lecture',weekday:'thursday',starts_on:'2026-10-15',ends_on:'2026-10-15'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('allows a separately authorized administrative assistant to permanently delete a lecture and its registers',async()=>{
    window.localStorage.setItem('cdms.locale','en');document.cookie='XSRF-TOKEN=test; path=/';
    let deleted:Record<string,unknown>|null=null;
    let removed=false;
    const plan={id:21,student_group_id:4,supervisor_person_id:9,title:'Training lecture',weekday:'thursday',starts_at:'09:00:00',ends_at:'11:30:00',starts_on:'2026-10-15',ends_on:'2026-10-15',is_active:true,sessions_count:1,supervisor:{id:9,full_name_ar:'د. خالد',full_name_en:'Dr Khaled'}};
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:2,roles:['ADMIN_ASSISTANT'],permissions:[{code:'university_lectures.manage',scope:'global'},{code:'university_lectures.delete_with_attendance',scope:'global'}]});
      if(url.includes('/plans/21/with-attendance')&&init?.method==='DELETE'){deleted=JSON.parse(String(init.body));removed=true;return envelope({result:'deleted_with_attendance',sessions_deleted:1,records_deleted:2});}
      if(url.includes('/university-attendance/plans'))return envelope({groups:[{id:4,name:'A',academic_level:'fourth',academic_year:{code:'2026/2027',start_date:'2026-09-01',end_date:'2027-08-31',is_current:true}}],supervisors:[plan.supervisor],lectures:removed?[]:[plan],sessions:[]});
      throw new Error(`Unmocked ${url}`);
    });
    renderWithProviders(<UniversityAttendanceAdminPage/>,{route:'/attendance/university'});
    await screen.findByText('Main-group university lectures');
    await userEvent.click(await screen.findByText('More'));
    await userEvent.click(await screen.findByRole('button',{name:'Permanently delete with registers'}));
    const confirm=screen.getByRole('button',{name:'Delete lecture and registers permanently'});
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Administrative reason (at least 10 characters)'),'Duplicate lecture and register');
    await userEvent.type(screen.getByLabelText('Type the lecture title to confirm: Training lecture'),'Training lecture');
    await userEvent.click(confirm);
    await waitFor(()=>expect(deleted).toEqual({reason:'Duplicate lecture and register',confirmation:'Training lecture'}));
    expect(await screen.findByText('Lecture and 1 registers (2 attendance records) deleted.')).toBeInTheDocument();
  });
});

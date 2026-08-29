import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SupervisorPortalPage } from './SupervisorPortalPage';
import { SupervisorAttendancePage } from './SupervisorAttendancePage';
import { SupervisorAssessmentsPage } from './SupervisorAssessmentsPage';

const envelope=(data:unknown,status=200)=>new Response(JSON.stringify({success:status<400,data:status<400?data:null,message:status<400?null:'Forbidden',errors:{},meta:{}}),{status,headers:{'Content-Type':'application/json'}});
const permissions=['supervisor.workspace.view','attendance.view','attendance.record','assessment.view','assessment.create'].map(code=>({code,scope:'global'}));
const workspace={supervisor:{person_id:9,user_id:1,full_name_ar:'د. أحمد المشرف',full_name_en:'Dr Ahmad Supervisor'},assignments:[{id:21,distribution_version_id:3,rotation_block_id:4,training_site_id:5,student_subgroup_id:6,session_start_date:'2026-08-24',session_end_date:'2026-09-06',student:{id:7,university_number:'22010001',full_name_ar:'طالب سريري',full_name_en:'Clinical Student'},student_subgroup:{id:6,name:'L1',group:{id:2,name:'L'}},rotation_block:{id:4,block_code:'W1',from_week:1,to_week:2,rotation:{name:'Surgery',start_date:'2026-08-23T21:00:00.000000Z',course:{name_ar:'الجراحة العامة',name_en:'General Surgery'},academic_year:{code:'2026-2027'}}},training_site:{id:5,name_ar:'المستشفى الأهلي',name_en:'Al Ahli Hospital'},department:{id:8,name_ar:'قسم الجراحة',name_en:'Surgery Department'}}],attendance_records:[],assessments:[]};
const user={id:1,name:'Supervisor',email:'doctor@hebron.edu',roles:['CLINICAL_SUPERVISOR'],permissions};
afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'});

describe('clinical supervisor workspace',()=>{
  it('keeps summaries and shortcuts on the supervisor dashboard',async()=>{
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope(user):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>);
    expect(await screen.findByText('Current group summaries')).toBeVisible();
    expect(screen.getAllByRole('link').some(link=>link.getAttribute('href')==='/supervisor/attendance')).toBe(true);
    expect(screen.getAllByRole('link').some(link=>link.getAttribute('href')==='/supervisor/assessments')).toBe(true);
  });

  it('records a whole group from the separate attendance table',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(url.includes('/auth/me'))return envelope(user);if(url.includes('/my-supervisor-workspace'))return envelope(workspace);if(url.includes('/my-supervisor-attendance'))return envelope({session_id:12});throw new Error(`Unmocked ${url} ${init?.method}`)});
    renderWithProviders(<SupervisorAttendancePage/>,{route:'/supervisor/attendance'});
    expect(await screen.findByDisplayValue('2026-08-29')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Absent'}));
    await userEvent.click(screen.getByRole('button',{name:'Save group'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/my-supervisor-attendance')&&String(init?.body).includes('"status":"absent"'))).toBe(true));
  });

  it('submits the grouped assessment roster from its separate screen',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(url.includes('/auth/me'))return envelope(user);if(url.includes('/my-supervisor-workspace'))return envelope(workspace);if(url.includes('/my-supervisor-assessment-batches'))return envelope({batch_uuid:'batch-1'});throw new Error(`Unmocked ${url} ${init?.method}`)});
    renderWithProviders(<SupervisorAssessmentsPage/>,{route:'/supervisor/assessments'});
    const score=await screen.findByRole('spinbutton');await userEvent.type(score,'18');
    await userEvent.click(screen.getByRole('button',{name:'Submit group'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/my-supervisor-assessment-batches')&&String(init?.body).includes('"student_id":7')&&String(init?.body).includes('"score":18'))).toBe(true));
  });

  it('does not treat a director role alone as a clinical supervisor',async()=>{
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope({...user,roles:['CLINICAL_DIRECTOR']}):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>);
    expect(await screen.findByText('Clinical supervisor dashboard')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('/my-supervisor-workspace'))).toBe(false);
  });
});

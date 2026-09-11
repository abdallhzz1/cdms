import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SupervisorPortalPage } from './SupervisorPortalPage';
import { SupervisorAttendancePage } from './SupervisorAttendancePage';
import { SupervisorAssessmentsPage } from './SupervisorAssessmentsPage';
import { Sidebar } from '@/components/layout/Sidebar';
import { sortAgendaByNextSession } from './SupervisorSchedulePage';

const envelope=(data:unknown,status=200)=>new Response(JSON.stringify({success:status<400,data:status<400?data:null,message:status<400?null:'Forbidden',errors:{},meta:{}}),{status,headers:{'Content-Type':'application/json'}});
const permissions=['supervisor.workspace.view','attendance.view','attendance.record','assessment.view','assessment.create'].map(code=>({code,scope:'global'}));
const workspace={supervisor:{person_id:9,user_id:1,full_name_ar:'د. أحمد المشرف',full_name_en:'Dr Ahmad Supervisor'},assignments:[{id:21,distribution_version_id:3,rotation_block_id:4,training_site_id:5,student_subgroup_id:6,session_start_date:'2026-08-24',session_end_date:'2026-09-06',scheduled_dates:['2026-08-27','2026-09-03'],evaluation_weeks:[{number:1,start_date:'2026-08-24',end_date:'2026-08-30'},{number:2,start_date:'2026-08-31',end_date:'2026-09-06'}],student:{id:7,university_number:'22010001',full_name_ar:'طالب سريري',full_name_en:'Clinical Student',batch_year:2026},student_subgroup:{id:6,name:'L1',group:{id:2,name:'L'}},rotation_block:{id:4,block_code:'W1',from_week:1,to_week:2,rotation:{name:'Surgery',start_date:'2026-08-23T21:00:00.000000Z',course:{id:10,name_ar:'الجراحة العامة',name_en:'General Surgery'},academic_year:{code:'2026-2027'}}},training_site:{id:5,name_ar:'المستشفى الأهلي',name_en:'Al Ahli Hospital'},department:{id:8,name_ar:'قسم الجراحة',name_en:'Surgery Department'}}],attendance_records:[],assessments:[],student_notes:[],assessment_templates:[{id:31,name_ar:'التقييم الأسبوعي',name_en:'Weekly assessment',course_id:10,batch_year:2026,total_score:10,is_active:true,criteria:[{id:1,name_ar:'المهنية',name_en:'Professionalism',max_score:10}]}],schedule_configured:true};
const user={id:1,name:'Supervisor',email:'doctor@hebron.edu',roles:['CLINICAL_SUPERVISOR'],permissions};
afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'});

describe('clinical supervisor workspace',()=>{
  it('places today and upcoming sessions before faded past sessions',()=>{
    const ordered=sortAgendaByNextSession([
      {date:'2026-09-01'},
      {date:'2026-09-15'},
      {date:'2026-09-10'},
      {date:'2026-09-13'},
      {date:'2026-09-12'},
    ],'2026-09-12');
    expect(ordered.map(item=>item.date)).toEqual([
      '2026-09-12','2026-09-13','2026-09-15','2026-09-10','2026-09-01',
    ]);
  });

  it('keeps direct supervisor links for supervisor-only users',async()=>{
    vi.spyOn(window,'fetch').mockImplementation(async()=>envelope(user));
    renderWithProviders(<Sidebar/>);
    expect(await screen.findByText('Supervisor Dashboard')).toBeVisible();
    expect(screen.getByText('Attendance')).toBeVisible();
    expect(screen.getByText('Student Assessments')).toBeVisible();
  });

  it('groups supervisor tools under one workspace link for multi-role users',async()=>{
    vi.spyOn(window,'fetch').mockImplementation(async()=>envelope({...user,roles:['CLINICAL_SUPERVISOR','DEPARTMENT_HEAD']}));
    renderWithProviders(<Sidebar/>);
    expect(await screen.findByText('Clinical Supervisor Workspace')).toBeVisible();
    expect(screen.queryByText('My Students Attendance')).not.toBeInTheDocument();
    expect(screen.queryByText('My Student Assessments')).not.toBeInTheDocument();
  });

  it('keeps concise statistics and prominent work buttons on the supervisor dashboard',async()=>{
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope(user):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>);
    expect(await screen.findByText('My clinical schedule')).toBeVisible();
    expect(screen.getAllByText('Attendance').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Assessment').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link').some(link=>link.getAttribute('href')?.startsWith('/supervisor/attendance?'))).toBe(true);
    expect(screen.getAllByRole('link').some(link=>link.getAttribute('href')?.startsWith('/supervisor/assessments?'))).toBe(true);
  });

  it('records a whole group from the separate attendance table',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(url.includes('/auth/me'))return envelope(user);if(url.includes('/my-supervisor-workspace'))return envelope(workspace);if(url.includes('/my-supervisor-attendance'))return envelope({session_id:12});throw new Error(`Unmocked ${url} ${init?.method}`)});
    renderWithProviders(<SupervisorAttendancePage/>,{route:'/supervisor/attendance'});
    await screen.findByRole('heading',{name:'General Surgery — L (L1)'});
    expect(screen.getAllByText(/Thursday —/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button',{name:'Absent'}));
    await userEvent.click(screen.getByRole('button',{name:'Save group'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/my-supervisor-attendance')&&String(init?.body).includes('"status":"absent"'))).toBe(true));
  });

  it('submits one student assessment independently from its separate screen',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(url.includes('/auth/me'))return envelope(user);if(url.includes('/my-supervisor-workspace'))return envelope(workspace);if(url.includes('/my-supervisor-assessment-batches'))return envelope({batch_uuid:'test',assessments:[{id:1,status:'submitted'}]});throw new Error(`Unmocked ${url} ${init?.method}`)});
    renderWithProviders(<SupervisorAssessmentsPage/>,{route:'/supervisor/assessments'});
    const score=await screen.findByRole('spinbutton');await userEvent.type(score,'9');
    await userEvent.click(screen.getByRole('button',{name:'Submit group assessment'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/my-supervisor-assessment-batches')&&String(init?.body).includes('"student_id":7')&&String(init?.body).includes('"score":9'))).toBe(true));
  });

  it('submits only a student added after the rest of the group was approved',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const secondAssignment={...workspace.assignments[0],id:22,student:{id:8,university_number:'22010002',full_name_ar:'طالب جديد',full_name_en:'New Student',batch_year:2026}};
    const mixedWorkspace={...workspace,assignments:[workspace.assignments[0],secondAssignment],assessments:[{id:41,student_id:7,student_clinical_assignment_id:21,evaluation_week:1,score:10,max_score:10,status:'approved',created_at:'2026-08-30'}]};
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(url.includes('/auth/me'))return envelope(user);if(url.includes('/my-supervisor-workspace'))return envelope(mixedWorkspace);if(url.includes('/my-supervisor-assessment-batches'))return envelope({batch_uuid:'new-batch',assessments:[{id:42,status:'submitted'}]});throw new Error(`Unmocked ${url} ${init?.method}`)});
    renderWithProviders(<SupervisorAssessmentsPage/>,{route:'/supervisor/assessments?week=1'});
    const submitButton=await screen.findByRole('button',{name:'Submit 1 new assessment'});
    expect(submitButton).toBeDisabled();
    const scoreInputs=screen.getAllByRole('spinbutton');
    expect(scoreInputs[0]).toBeDisabled();
    await userEvent.type(scoreInputs[1],'8');
    expect(submitButton).toBeEnabled();
    await userEvent.click(submitButton);
    await waitFor(()=>{const call=fetchSpy.mock.calls.find(([input])=>String(input).includes('/my-supervisor-assessment-batches'));const body=String(call?.[1]?.body);expect(body).toContain('"student_id":8');expect(body).not.toContain('"student_id":7');});
  });

  it('does not treat a director role alone as a clinical supervisor',async()=>{
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope({...user,roles:['CLINICAL_DIRECTOR']}):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>);
    expect(await screen.findByText('Clinical supervisor dashboard')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('/my-supervisor-workspace'))).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SupervisorPortalPage } from './SupervisorPortalPage';
import { SupervisorAssessmentsPage } from './SupervisorAssessmentsPage';
import { Sidebar } from '@/components/layout/Sidebar';
import { agendaWeekStart, buildSupervisorAgenda, preferredAgendaWeek, sortAgendaByNextSession } from './SupervisorSchedulePage';

const envelope=(data:unknown,status=200)=>new Response(JSON.stringify({success:status<400,data:status<400?data:null,message:status<400?null:'Forbidden',errors:{},meta:{}}),{status,headers:{'Content-Type':'application/json'}});
const permissions=['supervisor.workspace.view','attendance.view','attendance.record','assessment.view','assessment.create'].map(code=>({code,scope:'global'}));
const workspace={supervisor:{person_id:9,user_id:1,full_name_ar:'د. أحمد المشرف',full_name_en:'Dr Ahmad Supervisor'},assignments:[{id:21,distribution_version_id:3,rotation_block_id:4,training_site_id:5,student_subgroup_id:6,session_start_date:'2026-08-24',session_end_date:'2026-09-06',scheduled_dates:['2026-08-27','2026-09-03'],evaluation_weeks:[{number:1,start_date:'2026-08-24',end_date:'2026-08-30'},{number:2,start_date:'2026-08-31',end_date:'2026-09-06'}],student:{id:7,university_number:'22010001',full_name_ar:'طالب سريري',full_name_en:'Clinical Student',batch_year:2026},student_subgroup:{id:6,name:'L1',group:{id:2,name:'L'}},rotation_block:{id:4,block_code:'W1',from_week:1,to_week:2,rotation:{name:'Surgery',start_date:'2026-08-23T21:00:00.000000Z',course:{id:10,name_ar:'الجراحة العامة',name_en:'General Surgery'},academic_year:{code:'2026-2027'}}},training_site:{id:5,name_ar:'المستشفى الأهلي',name_en:'Al Ahli Hospital'},department:{id:8,name_ar:'قسم الجراحة',name_en:'Surgery Department'}}],attendance_records:[],assessments:[],student_notes:[],assessment_templates:[{id:31,name_ar:'التقييم الأسبوعي',name_en:'Weekly assessment',course_id:10,batch_year:2026,version:1,total_score:10,is_active:true,criteria:[{id:1,code:'professionalism',name_ar:'المهنية',name_en:'Professionalism',max_score:10}]}],schedule_configured:true};
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

  it('uses Sunday-based weeks and selects the nearest upcoming week on mobile',()=>{
    expect(agendaWeekStart('2026-09-24')).toBe('2026-09-20');
    expect(preferredAgendaWeek([{date:'2026-09-17'},{date:'2026-09-27'}],'2026-09-24')).toBe('2026-09-27');
    expect(preferredAgendaWeek([{date:'2026-09-17'},{date:'2026-09-24'}],'2026-09-24')).toBe('2026-09-20');
  });

  it('fills all seven days and includes a second work site without a student assignment there',()=>{
    const agenda=buildSupervisorAgenda({...workspace,work_schedules:[
      {training_site_id:5,training_site:{name_ar:'المستشفى الأهلي',name_en:'Al Ahli Hospital'},valid_from:'2026-08-23',valid_until:'2026-08-29',days:[{day:'thursday',status:'work'}]},
      {training_site_id:8,training_site:{name_ar:'مركز تدريب ثانٍ',name_en:'Second Training Centre'},valid_from:'2026-08-23',valid_until:'2026-08-29',days:[{day:'monday',status:'work'}]},
    ]},'2026-08-24');
    const firstWeek=agenda.filter(item=>agendaWeekStart(item.date)==='2026-08-23');
    expect(firstWeek).toHaveLength(7);
    expect(firstWeek.find(item=>item.date==='2026-08-23')?.duties).toHaveLength(0);
    expect(firstWeek.find(item=>item.date==='2026-08-24')?.duties).toMatchObject([{siteId:8,siteEn:'Second Training Centre',groups:[]}]);
    expect(firstWeek.find(item=>item.date==='2026-08-27')?.duties[0].groups).toHaveLength(1);
  });

  it('shows every day, a no-duty label, and the second site in the portal week',async()=>{
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope(user):envelope({...workspace,work_schedules:[
      {training_site_id:5,training_site:{name_ar:'المستشفى الأهلي',name_en:'Al Ahli Hospital'},valid_from:'2026-08-23',valid_until:'2026-08-29',days:[{day:'thursday',status:'work'}]},
      {training_site_id:8,training_site:{name_ar:'مركز تدريب ثانٍ',name_en:'Second Training Centre'},valid_from:'2026-08-23',valid_until:'2026-08-29',days:[{day:'monday',status:'work'}]},
    ]}));
    renderWithProviders(<SupervisorPortalPage/>);
    const weekSelect=await screen.findByRole('combobox',{name:'Choose week'});
    await userEvent.selectOptions(weekSelect,'2026-08-23');
    const table=screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(8);
    expect(within(table).getByText('Second Training Centre')).toBeVisible();
    expect(within(table).getAllByText('No duty')).toHaveLength(5);
  });

  it('keeps direct supervisor links for supervisor-only users',async()=>{
    vi.spyOn(window,'fetch').mockImplementation(async()=>envelope(user));
    renderWithProviders(<Sidebar/>);
    expect(await screen.findByText('Supervisor Dashboard')).toBeVisible();
    expect(screen.getByText('QR Attendance')).toBeVisible();
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
    expect(screen.getAllByText('QR attendance').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Assessment').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link').some(link=>link.getAttribute('href')?.startsWith('/supervisor/attendance/qr?'))).toBe(true);
    expect(screen.getAllByRole('link').some(link=>link.getAttribute('href')?.startsWith('/supervisor/assessments?'))).toBe(true);
    const actions=screen.getByRole('navigation',{name:'Supervisor actions'});
    expect(within(actions).getByRole('link',{name:'QR attendance'})).toHaveAttribute('href','/supervisor/attendance/qr');
    expect(within(actions).getByRole('link',{name:'Student assessments'})).toHaveAttribute('href','/supervisor/assessments');
  });

  it.each([
    ['CLINICAL_DIRECTOR','CLINICAL_SUPERVISOR'],
    ['CLINICAL_SUPERVISOR','CLINICAL_DIRECTOR'],
    ['DEPARTMENT_HEAD','CLINICAL_SUPERVISOR'],
  ])('shows direct attendance and assessment access for roles %s and %s',async(firstRole,secondRole)=>{
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope({...user,roles:[firstRole,secondRole]}):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>,{route:'/supervisor/portal'});
    const actions=await screen.findByRole('navigation',{name:'Supervisor actions'});
    expect(within(actions).getAllByRole('link')).toHaveLength(2);
    expect(within(actions).getByRole('link',{name:'QR attendance'})).toHaveAttribute('href','/supervisor/attendance/qr');
    expect(within(actions).getByRole('link',{name:'Student assessments'})).toHaveAttribute('href','/supervisor/assessments');
    expect(actions).toHaveClass('grid-cols-2');
    expect(actions.compareDocumentPosition(screen.getByRole('heading',{name:'My clinical schedule'}))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps two concise Arabic actions on mobile even when there are no scheduled sessions',async()=>{
    window.localStorage.setItem('cdms.locale','ar');
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope({...user,roles:['CLINICAL_DIRECTOR','CLINICAL_SUPERVISOR']}):envelope({...workspace,assignments:[]}));
    renderWithProviders(<SupervisorPortalPage/>,{route:'/supervisor/portal'});
    const actions=await screen.findByRole('navigation',{name:'إجراءات المشرف السريري'});
    expect(within(actions).getByRole('link',{name:'الحضور والغياب'})).toHaveClass('min-h-12');
    expect(within(actions).getByRole('link',{name:'تقييم الطلبة'})).toHaveAttribute('href','/supervisor/assessments');
    expect(screen.getByText('لا توجد جلسات ظاهرة. راجع التكليف المنشور وأيام العمل المحددة لك.')).toBeVisible();
  });

  it.each([
    {operation:'attendance',permission:'attendance.record',path:'/supervisor/attendance/qr',otherPath:'/supervisor/assessments'},
    {operation:'assessments',permission:'assessment.create',path:'/supervisor/assessments',otherPath:'/supervisor/attendance/qr'},
  ])('only offers permitted $operation actions in the top navigation and schedule',async({permission,path,otherPath})=>{
    const limitedUser={...user,roles:['CLINICAL_DIRECTOR','CLINICAL_SUPERVISOR'],permissions:permissions.filter(item=>['supervisor.workspace.view',permission].includes(item.code))};
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope(limitedUser):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>,{route:'/supervisor/portal'});
    const actions=await screen.findByRole('navigation',{name:'Supervisor actions'});
    expect(within(actions).getAllByRole('link')).toHaveLength(1);
    expect(within(actions).getByRole('link')).toHaveAttribute('href',path);
    expect(actions).toHaveClass('grid-cols-1');
    expect(screen.getAllByRole('link').some(link=>link.getAttribute('href')?.startsWith(otherPath))).toBe(false);
  });

  it('shows the schedule without operational links when recording and assessment permissions are missing',async()=>{
    const limitedUser={...user,roles:['CLINICAL_DIRECTOR','CLINICAL_SUPERVISOR'],permissions:permissions.filter(item=>item.code==='supervisor.workspace.view')};
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope(limitedUser):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>,{route:'/supervisor/portal'});
    expect(await screen.findByRole('heading',{name:'My clinical schedule'})).toBeVisible();
    expect(screen.queryByRole('navigation',{name:'Supervisor actions'})).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('does not fetch the workspace or show actions without workspace permission',async()=>{
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope({...user,permissions:permissions.filter(item=>item.code!=='supervisor.workspace.view')}):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>,{route:'/supervisor/portal'});
    expect(await screen.findByText('Permission is disabled')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('/my-supervisor-workspace'))).toBe(false);
    expect(screen.queryByRole('navigation',{name:'Supervisor actions'})).not.toBeInTheDocument();
  });

  it('shows one selected week in the phone table and lets the supervisor change weeks',async()=>{
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope(user):envelope(workspace));
    renderWithProviders(<SupervisorPortalPage/>);
    const weekSelect=await screen.findByRole('combobox',{name:'Choose week'});
    const phoneTable=screen.getAllByRole('table')[0];
    expect(within(phoneTable).getAllByRole('row')).toHaveLength(8);
    expect(screen.getByRole('option',{name:'Week starting 23/08'})).toBeInTheDocument();
    expect(within(weekSelect).getAllByRole('option').every(option=>!option.textContent?.includes('–'))).toBe(true);
    await userEvent.selectOptions(weekSelect,'2026-08-23');
    expect(screen.getByText('23/08/2026 – 29/08/2026')).toBeVisible();
    expect(within(phoneTable).getByText('27/08/2026')).toBeVisible();
    expect(within(phoneTable).getAllByRole('link',{name:'QR attendance'})).toHaveLength(1);
  });

  it('submits one student assessment independently from its separate screen',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(url.includes('/auth/me'))return envelope(user);if(url.includes('/my-supervisor-workspace'))return envelope(workspace);if(url.includes('/my-supervisor-assessment-batches'))return envelope({batch_uuid:'test',assessments:[{id:1,status:'submitted'}]});throw new Error(`Unmocked ${url} ${init?.method}`)});
    renderWithProviders(<SupervisorAssessmentsPage/>,{route:'/supervisor/assessments'});
    const score=await screen.findByRole('spinbutton');await userEvent.type(score,'9');
    await userEvent.click(screen.getByRole('button',{name:'Submit group assessment'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/my-supervisor-assessment-batches')&&String(init?.body).includes('"student_id":7')&&String(init?.body).includes('"score":9'))).toBe(true));
  });

  it('shows score progress and names the student still missing a score',async()=>{
    const secondAssignment={...workspace.assignments[0],id:22,student:{id:8,university_number:'22010002',full_name_ar:'طالب جديد',full_name_en:'New Student',batch_year:2026}};
    vi.spyOn(window,'fetch').mockImplementation(async input=>String(input).includes('/auth/me')?envelope(user):envelope({...workspace,assignments:[workspace.assignments[0],secondAssignment]}));
    renderWithProviders(<SupervisorAssessmentsPage/>,{route:'/supervisor/assessments?week=1'});
    const submit=await screen.findByRole('button',{name:'Submit group assessment'});
    expect(submit).toBeDisabled();
    expect(screen.getByText('0/2 ready')).toBeVisible();
    expect(screen.getByText('Enter a score for Clinical Student before submitting.')).toBeVisible();
    await userEvent.type(screen.getAllByRole('spinbutton')[0],'8');
    expect(screen.getByText('1/2 ready')).toBeVisible();
    expect(screen.getByText('Enter a score for New Student before submitting.')).toBeVisible();
    await userEvent.type(screen.getAllByRole('spinbutton')[1],'9');
    expect(submit).toBeEnabled();
  });

  it('shows private supervisor notes without copying them into the official assessment',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const privateText='Needs more practice taking patient history';
    const withNote={...workspace,student_notes:[{id:5,supervisor_person_id:9,student_id:7,student_clinical_assignment_id:21,note_date:'2026-08-27',note:privateText}]};
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{const url=String(input);if(url.includes('/auth/me'))return envelope(user);if(url.includes('/my-supervisor-workspace'))return envelope(withNote);if(url.includes('/my-supervisor-assessment-batches'))return envelope({batch_uuid:'note-test',assessments:[{id:6,status:'submitted'}]});throw new Error(`Unmocked ${url} ${init?.method}`)});
    renderWithProviders(<SupervisorAssessmentsPage/>,{route:'/supervisor/assessments?week=1'});
    expect(await screen.findByText(`Latest private note: ${privateText}`)).toBeVisible();
    await userEvent.type(screen.getByRole('spinbutton'),'8');
    await userEvent.click(screen.getByRole('button',{name:'Submit group assessment'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('/my-supervisor-assessment-batches'))).toBe(true));
    const body=String(fetchSpy.mock.calls.find(([input])=>String(input).includes('/my-supervisor-assessment-batches'))?.[1]?.body);
    expect(body).not.toContain(privateText);
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SupervisorPortalPage } from './SupervisorPortalPage';

const envelope=(data:unknown,status=200)=>new Response(JSON.stringify({success:status<400,data:status<400?data:null,message:status<400?null:'Forbidden',errors:{},meta:{}}),{status,headers:{'Content-Type':'application/json'}});
const permissions=['supervisor.workspace.view','attendance.view','attendance.record','assessment.view','assessment.create'].map(code=>({code,scope:'global'}));
const workspace={
  supervisor:{person_id:9,user_id:1,full_name_ar:'د. أحمد المشرف',full_name_en:'Dr Ahmad Supervisor'},
  assignments:[{id:21,distribution_version_id:3,rotation_block_id:4,training_site_id:5,student_subgroup_id:6,student:{id:7,university_number:'22010001',full_name_ar:'طالب سريري',full_name_en:'Clinical Student'},student_subgroup:{id:6,name:'L1',group:{id:2,name:'L'}},rotation_block:{id:4,block_code:'W1',from_week:1,to_week:2,rotation:{name:'Surgery',course:{name_ar:'الجراحة العامة',name_en:'General Surgery'},academic_year:{code:'2026-2027'}}},training_site:{id:5,name_ar:'المستشفى الأهلي',name_en:'Al Ahli Hospital'},department:{id:8,name_ar:'قسم الجراحة',name_en:'Surgery Department'}}],
  attendance_records:[],assessments:[],
};

afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'});

describe('SupervisorPortalPage',()=>{
  it('opens for a multi-role supervisor and saves official attendance',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,name:'Director Doctor',email:'doctor@hebron.edu',roles:['CLINICAL_DIRECTOR','CLINICAL_SUPERVISOR'],permissions});
      if(url.includes('/my-supervisor-workspace'))return envelope(workspace);
      if(url.includes('/my-supervisor-attendance'))return envelope({session_id:12});
      throw new Error(`Unmocked request: ${url} ${init?.method}`);
    });
    renderWithProviders(<SupervisorPortalPage/>,{route:'/supervisor/portal?tab=attendance'});
    expect(await screen.findByText('Record group attendance')).toBeVisible();
    await userEvent.click(screen.getByRole('button',{name:'Absent'}));
    await userEvent.click(screen.getByRole('button',{name:'Save attendance'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/my-supervisor-attendance')&&String(init?.body).includes('"status":"absent"'))).toBe(true));
  });

  it('does not treat a director role alone as a clinical supervisor',async()=>{
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async input=>{
      if(String(input).includes('/auth/me'))return envelope({id:1,name:'Director',email:'director@hebron.edu',roles:['CLINICAL_DIRECTOR'],permissions});
      throw new Error(`Unexpected workspace request: ${String(input)}`);
    });
    renderWithProviders(<SupervisorPortalPage/>);
    expect(await screen.findByText('Clinical supervisors portal')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('/my-supervisor-workspace'))).toBe(false);
  });

  it('loads a returned assessment for revision and resubmits its official id',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const returned={id:44,student_id:7,score:12,max_score:20,status:'returned',notes:'Initial note',return_reason:'Add clinical findings',created_at:'2026-09-10',student:workspace.assignments[0].student,session:{rotation_block_id:4,training_site_id:5,session_date:'2026-09-10'}};
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,name:'Supervisor',email:'doctor@hebron.edu',roles:['CLINICAL_SUPERVISOR'],permissions});
      if(url.includes('/my-supervisor-workspace'))return envelope({...workspace,assessments:[returned]});
      if(url.includes('/my-supervisor-assessments'))return envelope({...returned,status:'submitted'});
      throw new Error(`Unmocked request: ${url} ${init?.method}`);
    });
    renderWithProviders(<SupervisorPortalPage/>,{route:'/supervisor/portal?tab=assessments'});
    await userEvent.click(await screen.findByRole('button',{name:'Revise & resubmit'}));
    const score=screen.getByRole('spinbutton');
    await userEvent.clear(score);await userEvent.type(score,'16');
    await userEvent.click(screen.getByRole('button',{name:'Save & resubmit'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/my-supervisor-assessments')&&String(init?.body).includes('"assessment_id":44')&&String(init?.body).includes('"score":16'))).toBe(true));
  });

  it('submits every student in a group as one assessment batch',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,name:'Supervisor',email:'doctor@hebron.edu',roles:['CLINICAL_SUPERVISOR'],permissions});
      if(url.includes('/my-supervisor-workspace'))return envelope(workspace);
      if(url.includes('/my-supervisor-assessment-batches'))return envelope({batch_uuid:'batch-1',assessments:[{id:1}]});
      throw new Error(`Unmocked request: ${url} ${init?.method}`);
    });
    renderWithProviders(<SupervisorPortalPage/>,{route:'/supervisor/portal?tab=group_assessments'});
    const score=await screen.findByRole('spinbutton',{name:'22010001 score'});
    await userEvent.type(score,'18');
    await userEvent.click(screen.getByRole('button',{name:'Submit full group for approval'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/my-supervisor-assessment-batches')&&String(init?.body).includes('"student_id":7')&&String(init?.body).includes('"score":18'))).toBe(true));
  });
});

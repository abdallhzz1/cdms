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
});

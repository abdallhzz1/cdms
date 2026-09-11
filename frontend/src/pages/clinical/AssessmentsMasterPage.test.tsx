import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AssessmentsMasterPage } from './AssessmentsMasterPage';

const envelope=(data:unknown)=>new Response(JSON.stringify({success:true,data,message:null,errors:{},meta:{}}),{status:200,headers:{'Content-Type':'application/json'}});
const permissions=['assessment.review'].map(code=>({code,scope:'global'}));
const assessment=(id:number,evaluatorUserId:number)=>({id,status:'submitted',assessment_batch_uuid:null,score:9,max_score:10,student:{id,university_number:`2201000${id}`,full_name_ar:`طالب ${id}`,full_name_en:`Student ${id}`},evaluator:{id:evaluatorUserId,user_id:evaluatorUserId,full_name_ar:`طبيب ${evaluatorUserId}`,full_name_en:`Doctor ${evaluatorUserId}`},session:{session_date:'2026-09-10',rotation_block:{rotation:{course:{name_ar:'الجراحة',name_en:'Surgery'}}}}});

afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'});

describe('AssessmentsMasterPage workflow',()=>{
  it('does not treat the supervisor portal permission as assessment review access for a dual-role user',async()=>{
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:2,name:'Director Supervisor',email:'director@hebron.edu',roles:['CLINICAL_DIRECTOR','CLINICAL_SUPERVISOR'],permissions:[{code:'assessment.view',scope:'global'},{code:'assessment.create',scope:'global'}]});
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<AssessmentsMasterPage/>,{route:'/assessments'});
    expect(await screen.findByText('You do not have permission to review assessments')).toBeVisible();
    expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('/clinical-assessments'))).toBe(false);
  });

  it('shows submitted supervisor assessments as ready for the final grade sheet without approval actions',async()=>{
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,name:'RTA',email:'rta@hebron.edu',roles:['RTA'],permissions});
      if(url.includes('/clinical-assessments-summary'))return envelope({total:2,submitted:2,returned:0,approved:0,draft:0,batches:0,approved_average_percentage:null,clinical_periods:[]});
      if(url.includes('/clinical-assessments')&&(!init?.method||init.method==='GET'))return envelope({items:[assessment(1,1),assessment(2,2)],pagination:{current_page:1,last_page:1,total:2}});
      throw new Error(`Unmocked request: ${url} ${init?.method}`);
    });

    renderWithProviders(<AssessmentsMasterPage/>,{route:'/assessments'});
    expect(await screen.findByText('Clinical Assessment Records')).toBeVisible();
    expect(screen.getAllByText('Ready for grade sheet').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button',{name:'Approve'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Return'})).not.toBeInTheDocument();
  });
});

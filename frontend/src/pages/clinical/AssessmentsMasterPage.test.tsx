import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AssessmentsMasterPage } from './AssessmentsMasterPage';

const envelope=(data:unknown)=>new Response(JSON.stringify({success:true,data,message:null,errors:{},meta:{}}),{status:200,headers:{'Content-Type':'application/json'}});
const permissions=['assessment.view','assessment.approve'].map(code=>({code,scope:'global'}));
const assessment=(id:number,evaluatorUserId:number)=>({id,status:'submitted',score:18,max_score:20,student:{id,university_number:`2201000${id}`,full_name_ar:`طالب ${id}`,full_name_en:`Student ${id}`},evaluator:{id:evaluatorUserId,user_id:evaluatorUserId,full_name_ar:`طبيب ${evaluatorUserId}`,full_name_en:`Doctor ${evaluatorUserId}`},session:{session_date:'2026-09-10',rotation_block:{rotation:{course:{name_ar:'الجراحة',name_en:'Surgery'}}}}});

afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'});

describe('AssessmentsMasterPage workflow',()=>{
  it('prevents self approval and requires a reason before returning another assessment',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,name:'Director Supervisor',email:'director@hebron.edu',roles:['CLINICAL_DIRECTOR','CLINICAL_SUPERVISOR'],permissions});
      if(url.includes('/clinical-assessments')&&(!init?.method||init.method==='GET'))return envelope([assessment(1,1),assessment(2,2)]);
      if(url.includes('/clinical-assessments/2/return'))return envelope({...assessment(2,2),status:'returned'});
      throw new Error(`Unmocked request: ${url} ${init?.method}`);
    });

    renderWithProviders(<AssessmentsMasterPage/>,{route:'/assessments'});
    expect(await screen.findByText('Cannot approve your own')).toBeVisible();
    expect(screen.getAllByRole('button',{name:'Approve'})).toHaveLength(1);
    await userEvent.click(screen.getByRole('button',{name:'Return'}));
    const confirm=screen.getByRole('button',{name:'Confirm return'});
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('Clearly state the return reason and required revision…'),'Add clinical findings');
    await userEvent.click(confirm);
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).includes('/clinical-assessments/2/return')&&String(init?.body).includes('Add clinical findings'))).toBe(true));
  });
});

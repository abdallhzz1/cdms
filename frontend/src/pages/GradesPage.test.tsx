import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { GradesPage } from './GradesPage';

const envelope=(data:unknown)=>new Response(JSON.stringify({success:true,data,message:null,errors:{},meta:{}}),{status:200,headers:{'Content-Type':'application/json'}});

afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'});

describe('GradesPage official workflow',()=>{
  it('loads the scoped official roster and never submits a client clinical score',async()=>{
    document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,name:'RTA',email:'rta@hebron.edu',roles:['RTA'],assigned_levels:['fourth'],department_ids:[1],permissions:[{code:'grades.view',scope:'global'},{code:'grades.create',scope:'global'}]});
      if(url.includes('/grade-entries/options'))return envelope({academic_years:[{id:3,code:'2026-2027',is_current:true}],courses:[{id:8,code:'MED401',name_ar:'الجراحة',name_en:'Surgery',academic_level:'fourth',is_active:true}],assigned_levels:['fourth']});
      if(url.includes('/grade-entries/roster'))return envelope([{student:{id:5,university_number:'22210001',full_name_ar:'طالب',full_name_en:'Clinical Student',academic_level:'fourth'},official_clinical_score:18,grade_entry:null}]);
      if(url.endsWith('/grade-entries/batch'))return envelope([]);
      throw new Error(`Unmocked request: ${url} ${init?.method}`);
    });
    renderWithProviders(<GradesPage/>,{route:'/grades'});
    expect(await screen.findByText('Clinical Student')).toBeVisible();
    expect(screen.getByText('18')).toBeVisible();
    const inputs=screen.getAllByRole('spinbutton');
    await userEvent.type(inputs[0],'35'); await userEvent.type(inputs[1],'37');
    await userEvent.click(screen.getByRole('button',{name:'Save draft'}));
    await waitFor(()=>{
      const call=fetchSpy.mock.calls.find(([input])=>String(input).endsWith('/grade-entries/batch'));
      expect(call).toBeTruthy();
      expect(String(call?.[1]?.body)).toContain('"osce_score":35');
      expect(String(call?.[1]?.body)).not.toContain('clinical_score');
    });
  });
});

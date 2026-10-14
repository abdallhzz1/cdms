import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { UniversityAttendanceAdminPage } from './UniversityAttendanceAdminPage';

const envelope=(data:unknown)=>new Response(JSON.stringify({success:true,data,message:null,meta:{}}),{status:200,headers:{'Content-Type':'application/json'}});
afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; Max-Age=0; path=/';});

describe('university lecture planning',()=>{
  it('allows an RTA to add a dated lecture with only date, instructor, time and topic',async()=>{
    window.localStorage.setItem('cdms.locale','en');document.cookie='XSRF-TOKEN=test; path=/';
    let posted:Record<string,unknown>|null=null;
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,roles:['RTA'],permissions:[{code:'attendance.review',scope:'global'}]});
      if(url.includes('/university-attendance/plans')&&init?.method==='POST'){posted=JSON.parse(String(init.body));return envelope({id:10});}
      if(url.includes('/university-attendance/plans'))return envelope({groups:[{id:4,name:'A',academic_level:'fourth',academic_year:{code:'2026/2027',start_date:'2026-09-01',end_date:'2027-08-31',is_current:true}}],supervisors:[{id:9,full_name_ar:'د. خالد',full_name_en:'Dr Khaled'},{id:10,full_name_ar:'د. أحمد',full_name_en:'Dr Ahmad'}],lectures:[],sessions:[]});
      throw new Error(`Unmocked ${url}`);
    });
    renderWithProviders(<UniversityAttendanceAdminPage/>,{route:'/attendance/university'});
    await screen.findByText('Main-group university lectures');
    await userEvent.type(await screen.findByLabelText('Topic'),'Clinical lecture');
    await userEvent.type(screen.getByLabelText('Date'),'2026-10-15');
    await userEvent.type(screen.getByRole('combobox',{name:'Clinical supervisor'}),'Khaled');
    expect(screen.queryByRole('option',{name:'Dr Ahmad'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('option',{name:'Dr Khaled'}));
    await userEvent.click(screen.getByRole('button',{name:'Add lecture'}));
    await waitFor(()=>expect(posted).toMatchObject({student_group_id:4,supervisor_person_id:9,title:'Clinical lecture',weekday:'thursday',starts_on:'2026-10-15',ends_on:'2026-10-15'}));
    await waitFor(()=>expect(screen.getByRole('combobox',{name:'Clinical supervisor'})).toHaveValue(''));
  });
});

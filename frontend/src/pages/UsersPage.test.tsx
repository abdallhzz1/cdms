import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { UsersPage } from './UsersPage';

const envelope=(data:unknown)=>new Response(JSON.stringify({success:true,data,message:null,meta:{}}),{status:200,headers:{'Content-Type':'application/json'}});

afterEach(()=>{vi.restoreAllMocks();localStorage.removeItem('cdms.locale');document.cookie='XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'});

describe('UsersPage multi-role assignment',()=>{
  it('submits department head and clinical supervisor roles together',async()=>{
    localStorage.setItem('cdms.locale','en');document.cookie='XSRF-TOKEN=test; path=/';
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);
      if(url.includes('/auth/me'))return envelope({id:1,name:'System Admin',email:'admin@hebron.edu',roles:['SYS_ADMIN'],permissions:[{code:'users.manage',scope:'global'}]});
      if(url.includes('/users/departments-for-assignment'))return envelope([{id:4,name_ar:'الجراحة',name_en:'Surgery',code:'SURG'}]);
      if(url.includes('/users?'))return envelope({items:[],total:0,last_page:1});
      if(url.endsWith('/api/v1/users')&&init?.method==='POST')return envelope({id:9});
      throw new Error(`Unmocked request ${url}`);
    });
    renderWithProviders(<UsersPage/>);
    await userEvent.click(await screen.findByRole('button',{name:'Add account'}));
    await userEvent.type(screen.getByLabelText('Full name'),'Dr Multi Role');
    await userEvent.type(screen.getByLabelText('University email'),'multi@hebron.edu');
    await userEvent.type(screen.getByLabelText(/Initial password/),'Strong!Password123');
    await userEvent.click(screen.getByLabelText('Department Head'));
    await userEvent.selectOptions(screen.getByLabelText(/Department for scoped role/),'4');
    await userEvent.click(screen.getByRole('button',{name:'Save account & roles'}));
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input,init])=>String(input).endsWith('/api/v1/users')&&String(init?.body).includes('"roles":["CLINICAL_SUPERVISOR","DEPARTMENT_HEAD"]')&&String(init?.body).includes('"department_id":4'))).toBe(true));
  });
});

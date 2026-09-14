import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { ProtectedFinancialDocumentPage } from './ProtectedFinancialDocumentPage';

const envelope=(data:unknown,status=200)=>new Response(JSON.stringify({success:status<400,data,message:null,errors:{},meta:{}}),{status,headers:{'Content-Type':'application/json'}});

afterEach(()=>{vi.restoreAllMocks();document.cookie='XSRF-TOKEN=; Max-Age=0; path=/'});

describe('protected financial document',()=>{
  it('keeps metadata hidden until the Arabic password form is unlocked',async()=>{
    localStorage.setItem('cdms.locale','en');
    vi.spyOn(window,'fetch').mockImplementation(async(input,init)=>{
      const url=String(input);const method=init?.method??'GET';
      if(url==='/sanctum/csrf-cookie')return new Response(null,{status:204});
      if(url.includes('/public/confidential-financial-vaults/permanent-token/unlock')&&method==='POST')return envelope({unlocked:true,session_minutes:30,vault:{title:'الملف المالي السنوي',description:'سري',files:[{id:9,original_name:'finance.pdf',mime_type:'application/pdf',file_size:2048}]}});
      if(url.includes('/public/confidential-financial-vaults/permanent-token'))return envelope({unlocked:false});
      throw new Error(`Unmocked request: ${url}`);
    });

    renderWithProviders(<Routes><Route path="/secure/financial-documents/:token" element={<ProtectedFinancialDocumentPage/>}/></Routes>,{route:'/secure/financial-documents/permanent-token'});

    expect(await screen.findByRole('heading',{name:'هذا المستند محمي'})).toBeVisible();
    expect(screen.queryByText('finance.pdf')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('كلمة المرور'),{target:{value:'StrongSecret2026!'}});
    fireEvent.click(screen.getByRole('button',{name:'فتح المستند'}));

    expect(await screen.findByRole('heading',{name:'الملف المالي السنوي'})).toBeVisible();
    expect(screen.getByText('finance.pdf')).toBeVisible();
    expect(screen.getByRole('link',{name:'عرض'})).toHaveAttribute('href','/api/v1/public/confidential-financial-vaults/permanent-token/files/9');
  });
});

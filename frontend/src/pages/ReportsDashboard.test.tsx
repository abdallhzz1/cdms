import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportsDashboard } from './ReportsDashboard';
import { renderWithProviders } from '@/test/renderWithProviders';

const envelope = (data:unknown) => new Response(JSON.stringify({success:true,data,message:null,meta:{}}), {status:200,headers:{'Content-Type':'application/json'}});
const summary = {
  academic_years:[{id:1,code:'2026-2027',is_current:true,status:'active'}],
  metrics:{students:12,academically_registered:10,students_in_groups:8,students_in_published_schedule:7,active_supervisors:4,vacant_schedule_rows:1,course_reports_pending_approval:2},
  reports:[
    {key:'student_directory',category:'academic',title:'دليل الطلبة الأكاديمي',description:'بيانات الطلبة'},
    {key:'data_gaps',category:'monitoring',title:'نواقص البيانات والتشغيل',description:'الحالات التي تحتاج متابعة'},
  ],
  generated_at:'2026-08-25T10:00:00+03:00',
};
const preview = {definition:summary.reports[1],columns:['نوع النقص','الاسم'],rows:[['طالب دون مجموعة','طالب تجريبي']],total:1,preview_limit:20};

function mockApi(exportResponse?:Response) {
  return vi.spyOn(window,'fetch').mockImplementation(async(input)=>{
    const url=typeof input==='string'?input:input.toString();
    if(url.includes('/auth/me'))return envelope({id:1,name:'Admin',email:'admin@hebron.edu',roles:['SYS_ADMIN'],department_ids:[],permissions:[{code:'reports.view',scope:'global'},{code:'reports.export',scope:'global'}]});
    if(url.includes('/report-center/summary'))return envelope(summary);
    if(url.includes('/preview'))return envelope(preview);
    if(url.includes('/export'))return exportResponse||new Response(new Blob(['report']),{status:200,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="report.xlsx"'}});
    return new Response(JSON.stringify({success:false,message:'Not found'}),{status:404});
  });
}

afterEach(()=>vi.restoreAllMocks());

describe('ReportsDashboard',()=>{
  it('renders the compact report controls and preview',async()=>{
    const fetchSpy=mockApi();
    renderWithProviders(<ReportsDashboard/>);
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('summary?academic_year_id=1'))).toBe(true));
    await waitFor(()=>expect(screen.getByText('Annual reports and statistics')).toBeVisible());
    expect(screen.getByText('Report')).toBeVisible();
    expect(screen.getAllByText('Data and operational gaps').length).toBeGreaterThanOrEqual(1);
    await waitFor(()=>expect(screen.getByText('طالب تجريبي')).toBeVisible());
    expect(screen.getByRole('button',{name:/Excel/i})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/PDF/i})).toBeInTheDocument();
  });

  it('downloads through the authenticated cookie session',async()=>{
    const fetchSpy=mockApi();
    const createObjectURL=vi.fn(()=> 'blob:test');const revokeObjectURL=vi.fn();
    Object.defineProperty(URL,'createObjectURL',{configurable:true,value:createObjectURL});
    Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revokeObjectURL});
    const clickSpy=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>undefined);
    const user=userEvent.setup();
    renderWithProviders(<ReportsDashboard/>);
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('preview?academic_year_id=1'))).toBe(true));
    const excel=await screen.findByRole('button',{name:/Excel/i});
    await waitFor(()=>expect(excel).toBeEnabled());
    await user.click(excel);
    await waitFor(()=>expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/api/v1/report-center/data_gaps/export?'),expect.objectContaining({credentials:'include'})));
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('opens the counted student list from a monthly training-site number',async()=>{
    const user=userEvent.setup();
    const report={key:'clinical_training_sites_sep_nov_2026',category:'clinical',title:'إحصائية طلبة التدريب السريري في المراكز التدريبية',description:'إحصائية شهرية'};
    const fetchSpy=vi.spyOn(window,'fetch').mockImplementation(async(input)=>{
      const url=typeof input==='string'?input:input.toString();
      if(url.includes('/auth/me'))return envelope({id:1,name:'Admin',email:'admin@hebron.edu',roles:['SYS_ADMIN'],department_ids:[],permissions:[{code:'reports.view',scope:'global'}]});
      if(url.includes('/report-center/summary'))return envelope({...summary,reports:[...summary.reports,report]});
      if(url.includes('/clinical-training-sites-2026/details'))return envelope({site:{id:5,name_ar:'مستشفى الخليل'},month:'september',month_label:'سبتمبر 2026',total:2,students:[{student_id:1,university_number:'22001',student_name:'طالب أول',courses:'الجراحة',subgroups:'A1',training_start:'2026-09-01',training_end:'2026-09-30'},{student_id:2,university_number:'22002',student_name:'طالب ثان',courses:'الباطني',subgroups:'A2',training_start:'2026-09-08',training_end:'2026-10-05'}]});
      if(url.includes('/clinical_training_sites_sep_nov_2026/preview'))return envelope({definition:report,columns:['المركز','سبتمبر','أكتوبر','نوفمبر','الإجمالي'],rows:[['مستشفى الخليل',2,1,0,3]],total:1,preview_limit:20,audit_sites:{'مستشفى الخليل':5}});
      if(url.includes('/preview'))return envelope(preview);
      return new Response(JSON.stringify({success:false,message:'Not found'}),{status:404});
    });
    renderWithProviders(<ReportsDashboard/>);
    await screen.findByText('طالب تجريبي');
    const reportSelect=await screen.findByLabelText('Report');
    await user.selectOptions(reportSelect,'clinical_training_sites_sep_nov_2026');
    expect(reportSelect).toHaveValue('clinical_training_sites_sep_nov_2026');
    await waitFor(()=>expect(fetchSpy.mock.calls.some(([input])=>String(input).includes('/clinical_training_sites_sep_nov_2026/preview'))).toBe(true));
    await screen.findByText('مستشفى الخليل');
    await user.click(await screen.findByRole('button',{name:'2'}));
    expect(await screen.findByText('طالب أول')).toBeVisible();
    expect(screen.getByText('طالب ثان')).toBeVisible();
    expect(screen.getByText('22001')).toBeVisible();
  });
});

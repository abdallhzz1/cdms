import { afterEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import type { DistributionSubgroupItem, DistributionVersionDetail } from '@/api/distribution';
import { SubgroupAssignmentModal } from './SubgroupAssignmentModal';

afterEach(()=>{vi.restoreAllMocks();localStorage.removeItem('cdms.locale')});

it('includes a supervisor linked through a secondary hospital in the subgroup picker', async()=>{
  localStorage.setItem('cdms.locale','en');
  vi.spyOn(window,'fetch').mockResolvedValue(new Response(JSON.stringify({success:true,data:{id:1,roles:['SYS_ADMIN'],permissions:[]}}),{headers:{'Content-Type':'application/json'}}));
  const version={id:1,rotation:{blocks:[],site_capacity_rules:[
    {site:{id:2,name_ar:'ثاني',name_en:'Secondary Hospital'}},
    {site:{id:3,name_ar:'آخر',name_en:'Unrelated Hospital'}},
  ]}} as unknown as DistributionVersionDetail;
  const subgroup={id:1,name:'Q1',main_group:{name:'Q'},student_count:2,allocations:[]} as unknown as DistributionSubgroupItem;
  renderWithProviders(<SubgroupAssignmentModal version={version} subgroup={subgroup} supervisors={[{id:7,full_name_ar:'د. أحمد',full_name_en:'Dr Ahmad',primary_site_id:1,training_site_ids:[1,2],is_active:true}]} onClose={()=>{}} onSuccess={()=>{}}/>);
  const site=screen.getByRole('option',{name:'Secondary Hospital'}).closest('select')!;
  await userEvent.selectOptions(site,'2');
  expect(screen.getByRole('option',{name:'Dr Ahmad'})).toBeInTheDocument();
  await userEvent.selectOptions(site,'3');
  expect(screen.queryByRole('option',{name:'Dr Ahmad'})).not.toBeInTheDocument();
});

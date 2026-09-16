import { apiFetch, apiUrl } from './client';

export type PolicyCampaign = {
  id: number; public_id: string; status: 'draft' | 'published' | 'closed'; deadline: string; target_levels: string[];
  document: { id: number; title_ar: string; title_en: string; version_label: string; effective_date?: string; has_english_document?: boolean };
  academic_year: { id: number; code: string }; counts: Record<string, number>;
};
export type PolicyAssignment = {
  id: number; student: { id: number; university_number: string; full_name_ar: string; full_name_en?: string; academic_level: string };
  opened_at?: string | null; opened_ar_at?: string | null; opened_en_at?: string | null; acknowledged_at?: string | null; paper_received_at?: string | null; scan_attached: boolean;
  scan_name?: string | null; scan_download_url?: string | null;
};
export type CampaignDetails = { campaign: PolicyCampaign; assignments: { data: PolicyAssignment[]; current_page: number; last_page: number; total: number } };
export type PolicyCampaignOptions = { academic_years: Array<{ id: number; code: string; is_current: boolean }> };

export const listPolicyCampaigns = () => apiFetch<PolicyCampaign[]>('/student-policies');
export const getPolicyCampaignOptions = () => apiFetch<PolicyCampaignOptions>('/student-policies/options');
export const getPolicyCampaign = (id: string, query = '') => apiFetch<CampaignDetails>(`/student-policies/campaigns/${id}${query}`);
export const uploadPolicyDocument = (form: FormData) => apiFetch<{ id: number }>('/student-policies/documents', { method: 'POST', body: form });
export const createPolicyCampaign = (body: unknown) => apiFetch<PolicyCampaign>('/student-policies/campaigns', { method: 'POST', body });
export const publishPolicyCampaign = (id: number) => apiFetch<PolicyCampaign>(`/student-policies/campaigns/${id}/publish`, { method: 'POST' });
export const closePolicyCampaign = (id: number) => apiFetch<PolicyCampaign>(`/student-policies/campaigns/${id}/close`, { method: 'POST' });
export const deletePolicyCampaign = (id: number, confirmation: string) => apiFetch(`/student-policies/campaigns/${id}`, { method: 'DELETE', body: { confirmation } });
export const recordPolicyExport = (id: number) => apiFetch(`/student-policies/campaigns/${id}/record-export`, { method: 'POST' });
export const recordPaperReceipt = (id: number) => apiFetch(`/student-policies/assignments/${id}/paper-receipt`, { method: 'POST' });
export const bulkRecordPaperReceipt = (ids: number[]) => apiFetch('/student-policies/assignments/bulk-paper-receipt', { method: 'POST', body: { assignment_ids: ids } });
export const uploadPolicyScan = (id: number, file: File) => { const form = new FormData(); form.append('file', file); return apiFetch(`/student-policies/assignments/${id}/scan`, { method: 'POST', body: form }); };

export async function downloadPrivateFile(path: string, name: string) {
  const response = await fetch(apiUrl(path.replace(/^\/api\/v1/, '')), { credentials: 'include' });
  if (!response.ok) throw new Error('تعذر تنزيل الملف.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

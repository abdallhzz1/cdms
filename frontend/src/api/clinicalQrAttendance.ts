import { apiFetch } from './client';

export type QrAttendanceState = 'check_in_open' | 'check_in_closed' | 'check_out_open' | 'finalized';
export interface QrRoster { id:number; student_id:number; checked_in_at:string|null; checked_out_at:string|null; outcome:string; recording_source:string; is_incomplete:boolean; manual_reason:string|null; student:{id:number; full_name_ar:string; university_number:string} }
export interface QrSession { id:number; public_id:string; student_clinical_assignment_id:number; session_date:string; state:QrAttendanceState; training_site?:{name_ar:string}; roster:QrRoster[] }
export const getQrSessions=()=>apiFetch<QrSession[]>('/operational/clinical-qr-attendance/sessions');
export const openQrSession=(assignment_id:number,session_date:string)=>apiFetch<QrSession>('/operational/clinical-qr-attendance/sessions',{method:'POST',body:{assignment_id,session_date}});
export const getQrSession=(id:number)=>apiFetch<QrSession>(`/operational/clinical-qr-attendance/sessions/${id}`);
export const transitionQrSession=(id:number,action:string,reason?:string)=>apiFetch<QrSession>(`/operational/clinical-qr-attendance/sessions/${id}/transition`,{method:'POST',body:{action,reason}});
export const getQrPayload=(id:number)=>apiFetch<{token:string;phase:string;expires_at:string}>(`/operational/clinical-qr-attendance/sessions/${id}/qr`);
export const scanClinicalQr=(qr_token:string,access_token?:string)=>apiFetch<{operation:string;recorded_at:string;group:string|null;training_site:string|null;idempotent:boolean}>('/public/clinical-attendance/scan',{method:'POST',body:{qr_token,access_token}});
export const clinicalAttendanceIdentity=(access_token?:string)=>apiFetch<{student:{name:string;university_number:string}}>('/public/clinical-attendance/identity',{method:'POST',body:{access_token}});
export const rememberClinicalAttendanceBrowser=(access_token:string)=>apiFetch<{expires_in_days:number}>('/public/clinical-attendance/remember',{method:'POST',body:{access_token}});

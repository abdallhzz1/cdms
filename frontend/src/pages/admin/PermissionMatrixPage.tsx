import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Shield, Check, X, Lock, CheckCircle2 } from 'lucide-react';

export function PermissionMatrixPage() {
  const qc = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-permission-matrix'],
    queryFn: () => apiFetch<any>('/admin/permissions/matrix'),
  });

  const toggleMutation = useMutation({
    mutationFn: (body: { role_id: number; permission_id: number }) =>
      apiFetch('/admin/permissions/toggle', { method: 'POST', body }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['admin-permission-matrix'] });
      setSuccessMessage(res?.message || 'تم تحديث مصفوفة الصلاحيات بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const roles = data?.roles || [];
  const permissions = data?.permissions || [];
  const matrix = data?.matrix || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="مصفوفة الأدوار والصلاحيات التفصيلية"
        description="عرض وتعديل مصفوفة الصلاحيات (Role-Permission Matrix) في الوقت الفعلي لكل دور تقني بالنظام."
      />

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <Card className="overflow-x-auto border-slate-100 shadow-xs">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            مصفوفة التحكم بالأدوار والمكونات
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            تأثير فوري ومباشر على صلاحيات واجهة المستخدم والـ API
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">الصلاحية / الوحدة</TableHead>
              {roles.map((r: any) => (
                <TableHead key={r.id} className="text-center min-w-[120px]">
                  <div className="font-bold text-slate-900">{r.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{r.code}</div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {permissions.map((perm: any) => (
              <TableRow key={perm.id}>
                <TableCell>
                  <div className="font-bold text-slate-900 text-xs">{perm.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{perm.code}</div>
                </TableCell>

                {roles.map((role: any) => {
                  const roleMatrix = matrix.find((m: any) => m.role_id === role.id);
                  const permState = roleMatrix?.permissions?.find((p: any) => p.permission_id === perm.id);
                  const isGranted = permState?.granted ?? false;
                  const isSysAdmin = role.code === 'SYS_ADMIN';

                  return (
                    <TableCell key={role.id} className="text-center">
                      {isSysAdmin ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 text-slate-400" title="صلاحية مطلقة دائماً">
                          <Lock className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <button
                          onClick={() => toggleMutation.mutate({ role_id: role.id, permission_id: perm.id })}
                          disabled={toggleMutation.isPending}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-xl transition-all ${
                            isGranted
                              ? 'bg-emerald-500 text-white shadow-xs hover:bg-emerald-600'
                              : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {isGranted ? <Check className="w-4 h-4 stroke-[3]" /> : <X className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

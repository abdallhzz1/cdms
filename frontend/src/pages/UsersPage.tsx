import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import {
  UserPlus, Search, Key, Edit2, Trash2,
  CheckCircle2, XCircle, AlertTriangle, Filter
} from 'lucide-react';

const ROLE_LABELS: Record<string, { ar: string; en: string }> = {
  SYS_ADMIN: { ar: 'مدير النظام الفني', en: 'System Admin' },
  DEAN: { ar: 'عميد الكلية', en: 'Dean' },
  VICE_DEAN: { ar: 'نائب العميد', en: 'Vice Dean' },
  CLINICAL_DIRECTOR: { ar: 'مدير الدائرة السريرية', en: 'Clinical Director' },
  ADMIN_ASSISTANT: { ar: 'مساعد إداري', en: 'Admin Assistant' },
  DEPARTMENT_HEAD: { ar: 'رئيس القسم الأكاديمي', en: 'Department Head' },
  RTA: { ar: 'مساعد بحث وتدريس (TA)', en: 'Teaching & Research Assistant (TA)' },
  CLINICAL_SUPERVISOR: { ar: 'المشرف السريري', en: 'Clinical Supervisor' },
  ACADEMIC_ADVISOR: { ar: 'المرشد الأكاديمي', en: 'Academic Advisor' },
  QUALITY: { ar: 'مسؤول الجودة والاعتماد', en: 'Quality Officer' },
};

export function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<any | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<any | null>(null);

  // Form States
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: '',
    roles: ['CLINICAL_SUPERVISOR'],
    is_active: true,
  });

  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    roles: [] as string[],
    is_active: true,
  });

  const [newPassword, setNewPassword] = useState('');

  // Fetch Users
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: () => apiFetch<any>('/users?per_page=500'),
  });

  const usersList = useMemo(() => {
    return data?.data?.items || data?.items || data?.data || [];
  }, [data]);

  // Instant Client-Side Filter
  const filteredUsers = useMemo(() => {
    return usersList.filter((u: any) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q));

      if (!matchesSearch) return false;
      if (roleFilter === 'ALL') return true;
      const userRoleCodes = u.roles?.map((r: any) => r.code) || [u.role];
      return userRoleCodes.includes(roleFilter);
    });
  }, [usersList, search, roleFilter]);

  // Create User Mutation
  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/users', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users-list'] });
      setIsAddModalOpen(false);
      setAddForm({ name: '', email: '', password: '', roles: ['CLINICAL_SUPERVISOR'], is_active: true });
      setSuccessMessage('تم إنشاء الحساب بنجاح في النظام.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  // Update User Mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => apiFetch(`/users/${id}`, { method: 'PUT', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users-list'] });
      setEditingUser(null);
      setSuccessMessage('تم تحديث بيانات الحساب والأدوار بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  // Toggle Active Mutation
  const toggleMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}/toggle`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users-list'] });
      setSuccessMessage('تم تغيير حالة تفعيل الحساب بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  // Reset Password Mutation
  const resetPasswordMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      apiFetch(`/users/${id}/reset-password`, { method: 'POST', body: { password } }),
    onSuccess: () => {
      setResetPasswordUser(null);
      setNewPassword('');
      setSuccessMessage('تم إعادة تعيين كلمة المرور بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  // Delete User Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users-list'] });
      setDeleteConfirmUser(null);
      setSuccessMessage('تم حذف الحساب نهائياً من قاعدة البيانات بنجاح.');
      setTimeout(() => setSuccessMessage(null), 3000);
    },
  });

  const openEditModal = (u: any) => {
    setEditingUser(u);
    setEditForm({
      name: u.name,
      email: u.email,
      roles: u.roles?.map((r: any) => r.code) || [u.role],
      is_active: u.is_active ?? true,
    });
  };

  if (isLoading && !data) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="شاشة إدارة المستخدمين والأدوار التقنية"
          description="إنشاء وتعديل الحسابات، تعيين وتحديث الأدوار، وتجميد أو تفعيل الحسابات."
        />
        <Button
          onClick={() => setIsAddModalOpen(true)}
          className="gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-xs"
        >
          <UserPlus className="w-4 h-4" />
          إضافة حساب جديد
        </Button>
      </div>

      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Controls: Search & Role Filter Pills */}
      <Card className="p-4 border-slate-100 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
            <input
              type="text"
              placeholder="ابحث بالاسم أو البريد الإلكتروني الجامعي..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-slate-50/50"
            />
          </div>
          <div className="text-xs font-bold text-slate-500 flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-600" />
            <span>عرض {filteredUsers.length} من أصل {usersList.length} حساب</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setRoleFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${roleFilter === 'ALL' ? 'bg-slate-900 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            جميع الحسابات
          </button>
          {Object.entries(ROLE_LABELS).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setRoleFilter(code)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${roleFilter === code ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {label.ar}
            </button>
          ))}
        </div>
      </Card>

      {/* Users Table */}
      <Card className="overflow-hidden border-slate-100 shadow-xs">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead>المستخدم والبريد الإلكتروني</TableHead>
              <TableHead>الأدوار والمسمى التقني</TableHead>
              <TableHead className="text-center">حالة الحساب</TableHead>
              <TableHead className="text-center">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12 text-slate-400 text-xs">
                  لا يوجد مستخدمين مطابقين لهذا التصفية.
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((u: any) => {
                const userRoles = u.roles || [];
                const isPrimaryAdmin = u.email === 'admin1@hebron.edu';
                const isSelf = currentUser?.id === u.id;

                return (
                  <TableRow key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell>
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        {u.name}
                        {isPrimaryAdmin && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">مدير رئيسي 👑</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">{u.email}</div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {userRoles.map((r: any) => {
                          const label = ROLE_LABELS[r.code] || { ar: r.code };
                          return (
                            <span key={r.id || r.code} className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-100 text-[10px] font-bold">
                              {label.ar}
                            </span>
                          );
                        })}
                      </div>
                    </TableCell>

                    <TableCell className="text-center">
                      <button
                        onClick={() => toggleMutation.mutate(u.id)}
                        disabled={isSelf || isPrimaryAdmin || toggleMutation.isPending}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all inline-flex items-center gap-1.5 ${u.is_active ?? true ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}
                      >
                        {u.is_active ?? true ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {u.is_active ?? true ? 'حساب نشط' : 'حساب مجمد'}
                      </button>
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditModal(u)} title="تعديل الحساب والأدوار" className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100 rounded-lg">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setResetPasswordUser(u)} title="إعادة تعيين كلمة المرور" className="h-8 w-8 p-0 text-indigo-600 hover:bg-indigo-50 rounded-lg">
                          <Key className="w-4 h-4" />
                        </Button>
                        {!isSelf && !isPrimaryAdmin && (
                          <Button size="sm" variant="ghost" onClick={() => setDeleteConfirmUser(u)} title="حذف الحساب نهائياً" className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* 1. Add User Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="إضافة حساب مستخدم جديد">
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(addForm); }} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل للمستخدم</label>
            <input type="text" required placeholder="مثال: د. معاذ الشريف" value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني الجامعي</label>
            <input type="email" required placeholder="user@hebron.edu" value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور</label>
            <input type="password" required minLength={12} placeholder="12+ أحرف مع رقم ورمز" value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الدور التقني</label>
            <select value={addForm.roles[0]} onChange={(e) => setAddForm({ ...addForm, roles: [e.target.value] })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-white">
              {Object.entries(ROLE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label.ar}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>إلغاء</Button>
            <Button type="submit" disabled={createMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs">
              إنشاء الحساب
            </Button>
          </div>
        </form>
      </Modal>

      {/* 2. Edit User Modal */}
      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title="تعديل بيانات الحساب والأدوار">
        <form onSubmit={(e) => { e.preventDefault(); if (editingUser) updateMutation.mutate({ id: editingUser.id, body: editForm }); }} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل</label>
            <input type="text" required value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
            <input type="email" required value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">الدور التقني</label>
            <select value={editForm.roles[0] || 'CLINICAL_SUPERVISOR'}
              onChange={(e) => setEditForm({ ...editForm, roles: [e.target.value] })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-teal-500 outline-hidden font-medium bg-white">
              {Object.entries(ROLE_LABELS).map(([code, label]) => (
                <option key={code} value={code}>{label.ar}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="ghost" onClick={() => setEditingUser(null)}>إلغاء</Button>
            <Button type="submit" disabled={updateMutation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs">
              حفظ التعديلات
            </Button>
          </div>
        </form>
      </Modal>

      {/* 3. Reset Password Modal */}
      <Modal isOpen={!!resetPasswordUser} onClose={() => setResetPasswordUser(null)} title="تغيير كلمة المرور">
        <form onSubmit={(e) => { e.preventDefault(); if (resetPasswordUser) resetPasswordMutation.mutate({ id: resetPasswordUser.id, password: newPassword }); }} className="space-y-4">
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
            تعيين كلمة مرور جديدة للحساب: <b>{resetPasswordUser?.name}</b> ({resetPasswordUser?.email})
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور الجديدة</label>
            <input type="password" required minLength={12} placeholder="12+ أحرف مع حرف كبير وصغير ورقم ورمز" value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 outline-hidden font-medium" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setResetPasswordUser(null)}>إلغاء</Button>
            <Button type="submit" disabled={resetPasswordMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
              تغيير كلمة المرور
            </Button>
          </div>
        </form>
      </Modal>

      {/* 4. Delete Confirm Modal */}
      <Modal isOpen={!!deleteConfirmUser} onClose={() => setDeleteConfirmUser(null)} title="تأكيد حذف الحساب نهائياً">
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">هل أنت متأكد من حذف هذا الحساب نهائياً؟</p>
              <p className="mt-1 text-red-700">
                سيتم حذف (<b>{deleteConfirmUser?.name}</b> - {deleteConfirmUser?.email}) من قاعدة البيانات نهائياً وتجريده من كافة الأدوار والصلاحيات.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setDeleteConfirmUser(null)}>إلغاء الأمر</Button>
            <Button onClick={() => deleteMutation.mutate(deleteConfirmUser?.id)} disabled={deleteMutation.isPending} className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs">
              تأكيد الحذف النهائي
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

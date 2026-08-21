import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/api/client';
import { useI18n } from '@/i18n/I18nContext';
import { useAuth } from '@/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Search, Plus, Edit2, Shield, UserX, CheckCircle2 } from 'lucide-react';

export function UsersPage() {
  const { t, locale } = useI18n();
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({ name: '', email: '', password: '', roles: [] as string[], person_id: '', is_active: true });

  const query = new URLSearchParams({ per_page: '25', page: String(page) });
  if (search.trim()) query.set('search', search.trim());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['users', page, search],
    queryFn: () => apiFetch<any>(`/users?${query.toString()}`),
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles'],
    queryFn: () => apiFetch<any[]>('/users/roles'),
  });

  const { data: availablePeople = [] } = useQuery({
    queryKey: ['available-people', editingUser?.id],
    queryFn: () => apiFetch<any[]>(`/users/available-people${editingUser ? `?current_user_id=${editingUser.id}` : ''}`),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      const url = editingUser ? `/users/${editingUser.id}` : '/users';
      const method = editingUser ? 'PUT' : 'POST';
      return apiFetch(url, { method, body: data });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setIsModalOpen(false);
      setEditingUser(null);
    }
  });

  const toggleMutation = useMutation({
    mutationFn: (userId: number) => apiFetch(`/users/${userId}/toggle`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] })
  });

  if (!can('users.manage')) return <ErrorState title={t('state.forbidden.title')} message={t('state.forbidden.message')} />;
  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;

  const users = data?.items || [];

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      roles: user.roles.map((r: any) => r.code),
      person_id: user.person?.id?.toString() || '',
      is_active: user.is_active,
    });
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingUser(null);
    setFormData({ name: '', email: '', password: '', roles: [], person_id: '', is_active: true });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader 
          title="إدارة النظام والمستخدمين" 
          description="إدارة الحسابات التقنية، الصلاحيات، وربطها بالملفات المهنية." 
        />
        <Button onClick={handleAddNew} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4" />
          إضافة مستخدم جديد
        </Button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <input 
            value={search} 
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} 
            placeholder="البحث بالاسم أو البريد..." 
            className="block w-full rounded-xl border-none bg-slate-50 py-2.5 pr-10 pl-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-600 transition-shadow" 
          />
        </div>
        <span className="text-sm font-medium text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">
          عرض: <span className="text-indigo-600 font-bold">{users.length}</span> / {data?.total || 0}
        </span>
      </div>

      {users.length === 0 ? (
        <EmptyState message="لا توجد حسابات مسجلة" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المستخدم</TableHead>
              <TableHead>الأدوار (Roles)</TableHead>
              <TableHead>الملف الأكاديمي المرتبط</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-end">الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user: any) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shadow-sm">
                      {user.name.substring(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{user.name}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {user.roles.length === 0 ? <span className="text-xs text-slate-400">—</span> : null}
                    {user.roles.map((r: any) => (
                      <span key={r.code} className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-1 text-xs font-semibold text-purple-700 ring-1 ring-inset ring-purple-600/20">
                        <Shield className="w-3 h-3" />
                        {t(r.name_key)}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  {user.person ? (
                    <div className="text-sm font-medium text-slate-700">
                      {locale === 'ar' ? user.person.full_name_ar : user.person.full_name_en || user.person.full_name_ar}
                      <div className="text-xs text-slate-500">{user.person.department ? (locale === 'ar' ? user.person.department.name_ar : user.person.department.name_en) : '—'}</div>
                    </div>
                  ) : (
                    <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-md">غير مرتبط بملف</span>
                  )}
                </TableCell>
                <TableCell>
                  <button 
                    onClick={() => toggleMutation.mutate(user.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-colors ${
                      user.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    {user.is_active ? <CheckCircle2 className="w-4 h-4"/> : <UserX className="w-4 h-4"/>}
                    {user.is_active ? 'نشط' : 'معطل'}
                  </button>
                </TableCell>
                <TableCell className="text-end">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(user)} className="rounded-xl">
                    <Edit2 className="w-4 h-4 mr-1" /> تعديل
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Pagination (simplified) */}
      <div className="flex justify-end gap-2 mt-4">
        <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</Button>
        <Button variant="outline" disabled={page >= (data?.last_page || 1)} onClick={() => setPage(p => p + 1)}>التالي</Button>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? 'تعديل حساب المستخدم' : 'إنشاء حساب جديد'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">الاسم الكامل</label>
              <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:ring-2 focus:ring-indigo-600 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">البريد الإلكتروني</label>
              <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:ring-2 focus:ring-indigo-600 outline-none" />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">كلمة المرور {editingUser && '(اتركها فارغة إذا لم ترد التغيير)'}</label>
            <input type="password" required={!editingUser} minLength={8} value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:ring-2 focus:ring-indigo-600 outline-none" />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">الأدوار التقنية والأكاديمية (Roles)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-100">
              {roles.map((role: any) => (
                <label key={role.code} className="flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.roles.includes(role.code)}
                    onChange={(e) => {
                      if (e.target.checked) setFormData({...formData, roles: [...formData.roles, role.code]});
                      else setFormData({...formData, roles: formData.roles.filter(r => r !== role.code)});
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-600"
                  />
                  {t(role.name_key)}
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="block text-sm font-semibold text-slate-700 mb-1">ارتباط الملف المهني (Staff Profile)</label>
            <p className="text-xs text-slate-500 mb-2">يحدد هذا الخيار ما إذا كان المستخدم سيرث بيانات وخصائص موظف مسجل.</p>
            <select 
              value={formData.person_id} 
              onChange={e => setFormData({...formData, person_id: e.target.value})}
              className="w-full rounded-xl border border-slate-200 p-2.5 text-sm focus:ring-2 focus:ring-indigo-600 outline-none"
            >
              <option value="">بدون ارتباط (مستخدم تقني فقط)</option>
              {availablePeople.map((person: any) => (
                <option key={person.id} value={person.id}>
                  {locale === 'ar' ? person.full_name_ar : person.full_name_en || person.full_name_ar} {person.staff_code ? `(${person.staff_code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>إلغاء</Button>
            <Button type="submit" disabled={saveMutation.isPending} className="bg-indigo-600 text-white hover:bg-indigo-700">
              {saveMutation.isPending ? 'جاري الحفظ...' : 'حفظ المستخدم'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

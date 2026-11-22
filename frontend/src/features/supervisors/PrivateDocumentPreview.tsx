import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApiFile } from '@/api/client';
import { LoadingState } from '@/components/ui/LoadingState';
import { useI18n } from '@/i18n/I18nContext';

export function PrivateDocumentPreview({ path, name }: { path: string; name: string }) {
  const { locale } = useI18n();
  const [url, setUrl] = useState('');
  const query = useQuery({ queryKey: ['private-document-preview', path], queryFn: () => fetchApiFile(path, name), gcTime: 0, retry: false });
  useEffect(() => {
    if (!query.data) return;
    const next = URL.createObjectURL(query.data.blob);
    setUrl(next);
    return () => { URL.revokeObjectURL(next); setUrl(''); };
  }, [query.data]);
  if (query.isError) return <p role="alert" className="p-4 text-sm text-red-700">{query.error.message}</p>;
  if (!url || !query.data) return <LoadingState />;
  if (['image/jpeg', 'image/png', 'image/webp'].includes(query.data.blob.type)) return <img src={url} alt={name} className="max-h-[60vh] w-full rounded-xl bg-slate-50 object-contain" />;
  if (query.data.blob.type === 'application/pdf') return <iframe src={url} title={name} className="h-[60vh] w-full rounded-xl border border-slate-200" />;
  return <p className="p-6 text-center text-sm text-slate-500">{locale === 'ar' ? 'يمكن تنزيل هذا الملف لفتحه على جهازك.' : 'Download this file to open it on your device.'}</p>;
}

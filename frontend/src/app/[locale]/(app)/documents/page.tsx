import { getTranslations } from 'next-intl/server';
import { DocumentsClient } from './DocumentsClient';

export default async function DocumentsPage() {
  const t = await getTranslations('nav');
  return (
    <div className="flex flex-col gap-5 flex-1">
      <h1 className="text-2xl font-bold text-gray-900">{t('documents')}</h1>
      <DocumentsClient />
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { ClaimsClient } from './ClaimsClient';

export default async function ClaimsPage() {
  const tNav = await getTranslations('nav');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-900">{tNav('claims')}</h1>
      <ClaimsClient />
    </div>
  );
}

import { getTranslations } from 'next-intl/server';
import { RiskMapClient } from './RiskMapClient';

export default async function RiskMapPage() {
  const t = await getTranslations('geo');
  return (
    <div className="flex flex-col gap-4" style={{ height: 'calc(100vh - 3.5rem - 3rem)' }}>
      <h1 className="text-2xl font-bold text-gray-900 shrink-0">{t('riskMap')}</h1>
      <RiskMapClient />
    </div>
  );
}

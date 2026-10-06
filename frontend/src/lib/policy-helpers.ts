import type { UserPolicy } from '@/types';

export const RELATIONSHIP_LABELS: Record<string, string> = {
  self: 'Bản thân (Chính chủ)',
  spouse: 'Vợ / Chồng',
  child: 'Con cái',
  parent: 'Cha / Mẹ',
  sibling: 'Anh / Chị / Em',
  other: 'Khác',
};

/**
 * Lấy nhãn tiếng Việt rõ ràng cho quan hệ (Vợ/Chồng, Con cái, Cha/Mẹ,...)
 * Tuyệt đối không trả về raw key dạng "policies.rel.self"
 */
export function getRelationshipLabel(rel?: string | null, fallback = 'Chính chủ'): string {
  if (!rel) return fallback;
  const key = rel.toLowerCase().trim();
  return RELATIONSHIP_LABELS[key] || rel;
}

/**
 * Trả về chuỗi đại diện đối tượng bảo hiểm (Người thụ hưởng, Biển số xe, Địa chỉ nhà,...)
 * Ví dụ: "(Cho: NGUYỄN VĂN AN - Vợ / Chồng)" hoặc "(Biển số: 29A-123.45)"
 */
export function getPolicySubjectLabel(p: UserPolicy): string {
  if (p.insured_person?.name) {
    const rel = getRelationshipLabel(p.insured_person.relationship);
    return `Cho: ${p.insured_person.name} (${rel})`;
  }
  if (p.subject_details?.license_plate) {
    const brand = [p.subject_details.brand, p.subject_details.model].filter(Boolean).join(' ');
    return `Biển số: ${p.subject_details.license_plate}${brand ? ` · ${brand}` : ''}`;
  }
  if (p.subject_details?.address) {
    return `Địa chỉ: ${p.subject_details.address}`;
  }
  if (p.subject_details?.disaster_plan) {
    return `Gói: ${p.subject_details.disaster_plan}`;
  }
  if (p.subject_details?.crop_type) {
    return `Cây trồng: ${p.subject_details.crop_type}`;
  }
  return 'Bản thân (Chính chủ)';
}

/**
 * Trả về nhãn ngắn gọn cho dropdown chọn gói bảo hiểm (tránh tràn form):
 * Ví dụ: "Sức Khỏe Cơ Bản (NGUYỄN VĂN AN)" hoặc "Xe Máy Cơ Bản (29A-123.45)"
 */
export function getShortPolicyOptionLabel(p: UserPolicy): string {
  let subject = '';
  if (p.insured_person?.name) {
    subject = p.insured_person.name;
  } else if (p.subject_details?.owner_name) {
    subject = p.subject_details.owner_name;
  } else if (p.subject_details?.license_plate) {
    subject = p.subject_details.license_plate;
  } else if (p.subject_details?.address) {
    subject = p.subject_details.address.split(',')[0].trim();
  } else if (p.subject_details?.disaster_plan) {
    subject = p.subject_details.disaster_plan;
  } else if (p.subject_details?.crop_type) {
    subject = p.subject_details.crop_type;
  }

  if (subject) {
    return `${p.plan_name} (${subject})`;
  }
  return p.plan_name;
}

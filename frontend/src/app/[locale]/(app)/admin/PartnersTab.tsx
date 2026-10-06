'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Building2, Check, Clock, HeartPulse, Loader2,
  MapPin, Navigation, Phone, Plus, RefreshCw, Search, Send,
  Shield, Star, Trash2, Truck, Wrench, X, Edit3, CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import api from '@/lib/api';

export interface PartnerItem {
  id: string;
  name: string;
  partner_type: 'garage' | 'hospital' | 'rescue';
  province: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  phone?: string | null;
  hotline?: string | null;
  cashless_supported: boolean;
  rating?: number;
  services: string[];
  opening_hours?: string | null;
  is_active: boolean;
  created_at?: string;
}

const TYPE_CONFIG = {
  garage: {
    label: 'Garage Sửa chữa',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    badgeColor: 'bg-blue-600',
    icon: Wrench,
    serviceLabel: 'Bảo lãnh sửa chữa Gara',
  },
  hospital: {
    label: 'Bệnh viện Bảo lãnh',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    badgeColor: 'bg-emerald-600',
    icon: HeartPulse,
    serviceLabel: 'Bảo lãnh viện phí trực tiếp',
  },
  rescue: {
    label: 'Đội Cứu hộ 24/7',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    badgeColor: 'bg-amber-600',
    icon: Truck,
    serviceLabel: 'Điều phối cứu hộ khẩn cấp',
  },
};

export function PartnersTab() {
  const toast = useToast();
  const confirm = useConfirm();

  const [partners, setPartners] = useState<PartnerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [provinceFilter, setProvinceFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Partner Modal (Add/Edit)
  const [partnerModal, setPartnerModal] = useState<{
    open: boolean;
    mode: 'add' | 'edit';
    partner: Partial<PartnerItem>;
  }>({
    open: false,
    mode: 'add',
    partner: {
      name: '',
      partner_type: 'garage',
      province: 'Hồ Chí Minh',
      address: '',
      phone: '',
      hotline: '',
      cashless_supported: true,
      rating: 4.8,
      services: [],
      opening_hours: '24/7',
      is_active: true,
    },
  });
  const [savingPartner, setSavingPartner] = useState(false);
  const [servicesInput, setServicesInput] = useState('');

  // Dispatch & Direct Billing Modal
  const [dispatchModal, setDispatchModal] = useState<{
    open: boolean;
    partner: PartnerItem | null;
    claimId: string;
    serviceType: string;
    notes: string;
  }>({
    open: false,
    partner: null,
    claimId: '',
    serviceType: 'direct_billing',
    notes: '',
  });
  const [dispatching, setDispatching] = useState(false);

  const loadPartners = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (typeFilter && typeFilter !== 'all') params.partner_type = typeFilter;
      if (provinceFilter) params.province = provinceFilter;
      const res = await api.get<any>('/admin/partners', { params });
      const items = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.items)
        ? res.data.items
        : [];
      setPartners(items);
    } catch (err: any) {
      toast.error('Không thể tải danh sách đối tác.');
      setPartners([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, provinceFilter, toast]);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  const partnerList = Array.isArray(partners) ? partners : [];

  const filteredPartners = partnerList.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.address?.toLowerCase().includes(q) ||
      p.province?.toLowerCase().includes(q) ||
      (Array.isArray(p.services) && p.services.some((s) => s.toLowerCase().includes(q)))
    );
  });

  const handleOpenAdd = () => {
    setServicesInput('Sửa chữa thân vỏ, Cứu hộ cẩu kéo, Giám định hiện trường');
    setPartnerModal({
      open: true,
      mode: 'add',
      partner: {
        name: '',
        partner_type: 'garage',
        province: 'Hồ Chí Minh',
        address: '',
        phone: '',
        hotline: '',
        cashless_supported: true,
        rating: 4.8,
        services: ['Sửa chữa thân vỏ', 'Cứu hộ cẩu kéo', 'Giám định hiện trường'],
        opening_hours: '24/7',
        is_active: true,
      },
    });
  };

  const handleOpenEdit = (p: PartnerItem) => {
    setServicesInput(p.services.join(', '));
    setPartnerModal({
      open: true,
      mode: 'edit',
      partner: { ...p },
    });
  };

  const handleSavePartner = async () => {
    if (!partnerModal.partner.name || !partnerModal.partner.address) {
      toast.error('Vui lòng điền tên và địa chỉ của đối tác.');
      return;
    }

    setSavingPartner(true);
    try {
      const parsedServices = servicesInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        name: partnerModal.partner.name,
        partner_type: partnerModal.partner.partner_type || 'garage',
        province: partnerModal.partner.province || 'Hồ Chí Minh',
        address: partnerModal.partner.address,
        lat: partnerModal.partner.lat || null,
        lng: partnerModal.partner.lng || null,
        phone: partnerModal.partner.phone || null,
        hotline: partnerModal.partner.hotline || null,
        cashless_supported: partnerModal.partner.cashless_supported ?? true,
        rating: Number(partnerModal.partner.rating) || 4.8,
        services: parsedServices,
        opening_hours: partnerModal.partner.opening_hours || '24/7',
        is_active: partnerModal.partner.is_active ?? true,
      };

      if (partnerModal.mode === 'add') {
        await api.post('/admin/partners', payload);
        toast.success('Đã thêm đối tác mới vào mạng lưới liên kết!');
      } else {
        await api.put(`/admin/partners/${partnerModal.partner.id}`, payload);
        toast.success('Đã cập nhật thông tin đối tác thành công!');
      }

      setPartnerModal({ open: false, mode: 'add', partner: {} });
      loadPartners();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Lưu đối tác thất bại');
    } finally {
      setSavingPartner(false);
    }
  };

  const handleDeletePartner = async (p: PartnerItem) => {
    const ok = await confirm({
      title: 'Xoá đối tác liên kết?',
      message: `Bạn có chắc muốn xoá đối tác "${p.name}" khỏi mạng lưới bảo lãnh và cứu hộ?`,
      confirmLabel: 'Xoá vĩnh viễn',
      cancelLabel: 'Huỷ bỏ',
      variant: 'danger',
    });

    if (!ok) return;

    try {
      await api.delete(`/admin/partners/${p.id}`);
      toast.success(`Đã xoá đối tác ${p.name}`);
      loadPartners();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Xoá đối tác thất bại');
    }
  };

  const handleOpenDispatch = (p: PartnerItem) => {
    let defaultService = 'direct_billing';
    if (p.partner_type === 'garage') defaultService = 'garage_repair';
    if (p.partner_type === 'rescue') defaultService = 'rescue_dispatch';

    setDispatchModal({
      open: true,
      partner: p,
      claimId: '',
      serviceType: defaultService,
      notes: `Phát lệnh bảo lãnh dịch vụ đối tác ${p.name}. Yêu cầu phục vụ ưu tiên cho khách hàng ClaimFlow.`,
    });
  };

  const handleDispatchSubmit = async () => {
    if (!dispatchModal.partner || !dispatchModal.claimId.trim()) {
      toast.error('Vui lòng nhập mã hồ sơ bồi thường (Claim ID).');
      return;
    }

    setDispatching(true);
    try {
      await api.post('/admin/partners/dispatch', {
        claim_id: dispatchModal.claimId.trim(),
        partner_id: dispatchModal.partner.id,
        service_type: dispatchModal.serviceType,
        notes: dispatchModal.notes,
      });

      toast.success(
        `Đã gửi lệnh điều phối / bảo lãnh thành công đến ${dispatchModal.partner.name} cho hồ sơ #${dispatchModal.claimId}!`
      );
      setDispatchModal({ open: false, partner: null, claimId: '', serviceType: 'direct_billing', notes: '' });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Gửi lệnh điều phối thất bại');
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header Banner: Deep Harbor Pier ────────────────────────────── */}
      <div className="bg-[#13426f] text-white border border-[#0d2d4c] rounded-[26px] p-7 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="bg-[#2e96ff]/20 text-[#2e96ff] text-xs px-3 py-0.5 rounded-full font-bold border border-[#2e96ff]/30">
                Partner Network & Direct Billing
              </span>
              <span className="text-xs text-white/70">
                {partners.length} Điểm đối tác trên toàn quốc
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Quản trị Mạng lưới Đối tác & Cứu hộ</h2>
            <p className="text-sm text-white/80 mt-1 max-w-2xl leading-relaxed">
              Quản lý danh sách Gara liên kết, Bệnh viện bảo lãnh viện phí trực tiếp và Đội cứu hộ khẩn cấp 24/7. Điều phối hỗ trợ và cấp thư bảo lãnh trực tiếp cho khách hàng khi gặp sự cố.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              onClick={handleOpenAdd}
              className="bg-[#2e96ff] hover:bg-[#2582df] text-white font-bold rounded-full shadow-[0_4px_0_0_rgba(154,207,246,0.5)] active:translate-y-[1px] active:shadow-xs text-sm px-5 py-2.5 transition-all"
            >
              <Plus size={16} className="mr-1.5" /> Thêm đối tác mới
            </Button>
            <Button
              onClick={loadPartners}
              variant="outline"
              size="sm"
              className="bg-white hover:bg-[#eef6ff] text-black font-bold border border-white/60 rounded-full px-4 shadow-xs"
            >
              <RefreshCw size={13} className="mr-1.5 text-black" /> Làm mới
            </Button>
          </div>
        </div>

        {/* Breakdown Stats */}
        <div className="grid grid-cols-3 gap-3.5 mt-6 pt-6 border-t border-white/15">
          <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-4 flex items-center gap-3.5 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-[#2e96ff]/20 text-[#2e96ff] flex items-center justify-center font-bold">
              <Wrench size={20} />
            </div>
            <div>
              <p className="text-xs text-white/70 font-medium">Garage sửa chữa</p>
              <p className="text-xl font-bold text-white">
                {partnerList.filter((p) => p.partner_type === 'garage').length} đơn vị
              </p>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-4 flex items-center gap-3.5 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-emerald-400/20 text-emerald-300 flex items-center justify-center font-bold">
              <HeartPulse size={20} />
            </div>
            <div>
              <p className="text-xs text-white/70 font-medium">Bệnh viện bảo lãnh</p>
              <p className="text-xl font-bold text-white">
                {partnerList.filter((p) => p.partner_type === 'hospital').length} viện
              </p>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-[18px] p-4 flex items-center gap-3.5 border border-white/10">
            <div className="w-10 h-10 rounded-full bg-amber-400/20 text-amber-300 flex items-center justify-center font-bold">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-xs text-white/70 font-medium">Đội cứu hộ 24/7</p>
              <p className="text-xl font-bold text-white">
                {partnerList.filter((p) => p.partner_type === 'rescue').length} trạm
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-4 shadow-[0_4px_14px_rgba(0,0,0,0.04)] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-all ${
              typeFilter === 'all'
                ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                : 'bg-[#f9f7f0] text-[#4a5568] hover:text-[#13426f]'
            }`}
          >
            Tất cả đối tác ({partnerList.length})
          </button>
          <button
            onClick={() => setTypeFilter('garage')}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
              typeFilter === 'garage'
                ? 'bg-[#2e96ff] text-white shadow-[0_3px_0_0_rgba(154,207,246,0.5)]'
                : 'bg-[#eef6ff] text-[#2e96ff] hover:bg-[#2e96ff] hover:text-white'
            }`}
          >
            <Wrench size={13} /> Garage ({partnerList.filter((p) => p.partner_type === 'garage').length})
          </button>
          <button
            onClick={() => setTypeFilter('hospital')}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
              typeFilter === 'hospital'
                ? 'bg-emerald-600 text-white shadow-[0_3px_0_0_rgba(16,185,129,0.4)]'
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <HeartPulse size={13} /> Bệnh viện ({partnerList.filter((p) => p.partner_type === 'hospital').length})
          </button>
          <button
            onClick={() => setTypeFilter('rescue')}
            className={`px-4 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
              typeFilter === 'rescue'
                ? 'bg-amber-500 text-white shadow-[0_3px_0_0_rgba(245,158,11,0.4)]'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            <Truck size={13} /> Cứu hộ 24/7 ({partnerList.filter((p) => p.partner_type === 'rescue').length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm kiếm đối tác, dịch vụ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-4 text-xs border border-[#d0d5dd] rounded-full w-48 sm:w-64 focus:outline-none focus:border-[#2e96ff] bg-[#f9f7f0]/40 shadow-2xs"
            />
          </div>
        </div>
      </div>

      {/* ── Partner Cards Grid ────────────────────────────────────────────── */}
      {loading ? (
        <div className="py-20 text-center text-gray-500">
          <Loader2 className="animate-spin text-[#2e96ff] mb-2 inline" size={28} />
          <p className="text-sm">Đang tải dữ liệu mạng lưới đối tác...</p>
        </div>
      ) : filteredPartners.length === 0 ? (
        <div className="bg-white border border-[#d0d5dd] rounded-[22px] p-12 text-center text-gray-400 shadow-[0_4px_14px_rgba(0,0,0,0.04)]">
          <Building2 size={40} className="mx-auto mb-2 opacity-50 text-gray-400" />
          <p className="text-sm font-bold text-gray-700">Không tìm thấy đối tác nào phù hợp</p>
          <p className="text-xs text-gray-400 mt-1">Thử thay đổi bộ lọc hoặc thêm mới đối tác vào mạng lưới.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPartners.map((p) => {
            const cfg = TYPE_CONFIG[p.partner_type] || TYPE_CONFIG.garage;
            const Icon = cfg.icon;

            return (
              <div
                key={p.id}
                className="bg-white border border-[#d0d5dd] rounded-[22px] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.04)] hover:shadow-[0_7px_0_0_rgba(154,207,246,0.5)] hover:border-[#2e96ff] transition-all flex flex-col justify-between group"
              >
                <div className="space-y-3">
                  {/* Top line: Type badge & Rating */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold px-3 py-1 rounded-full border flex items-center gap-1.5 ${cfg.color}`}
                    >
                      <Icon size={13} /> {cfg.label}
                    </span>
                    <div className="flex items-center gap-1 text-amber-500 text-xs font-bold">
                      <Star size={13} fill="currentColor" />
                      <span>{p.rating || 4.8}</span>
                      {p.cashless_supported && (
                        <span className="ml-1 text-[10px] bg-emerald-50 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                          Bảo lãnh trực tiếp
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Partner Name */}
                  <div>
                    <h3 className="font-bold text-gray-900 text-base leading-snug group-hover:text-blue-600 transition-colors">
                      {p.name}
                    </h3>
                    <p className="text-xs text-gray-500 flex items-start gap-1 mt-1">
                      <MapPin size={13} className="shrink-0 text-gray-400 mt-0.5" />
                      <span>{p.address}</span>
                    </p>
                  </div>

                  {/* Contact Info */}
                  <div className="text-xs text-gray-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Hotline 24/7:</span>
                      <span className="font-bold text-gray-900 font-mono">{p.hotline || p.phone || '1900 xxxx'}</span>
                    </div>
                    {p.phone && p.phone !== p.hotline && (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-400">Số bàn / Tiếp nhận:</span>
                        <span className="font-medium text-gray-700 font-mono">{p.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Giờ hoạt động:</span>
                      <span className="font-medium text-emerald-700">{p.opening_hours || '24/7'}</span>
                    </div>
                  </div>

                  {/* Services Chips */}
                  {p.services && p.services.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.services.slice(0, 3).map((s, idx) => (
                        <span
                          key={idx}
                          className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                        >
                          {s}
                        </span>
                      ))}
                      {p.services.length > 3 && (
                        <span className="text-[11px] text-gray-400 self-center">
                          +{p.services.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions Footer */}
                <div className="pt-4 mt-4 border-t flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm"
                    onClick={() => handleOpenDispatch(p)}
                  >
                    <Send size={13} className="mr-1.5" /> Phát lệnh điều phối
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-2.5 text-gray-600 hover:text-gray-900"
                    onClick={() => handleOpenEdit(p)}
                    title="Chỉnh sửa thông tin"
                  >
                    <Edit3 size={14} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="px-2.5 text-rose-500 border-rose-200 hover:bg-rose-50"
                    onClick={() => handleDeletePartner(p)}
                    title="Xoá đối tác"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Phát lệnh điều phối / Bảo lãnh viện phí / Gara ────────────── */}
      {dispatchModal.open && dispatchModal.partner && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Send size={18} className="text-blue-600" /> Phát lệnh điều phối & Bảo lãnh
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Đối tác: <span className="font-semibold text-gray-900">{dispatchModal.partner.name}</span>
                </p>
              </div>
              <button
                onClick={() =>
                  setDispatchModal({ open: false, partner: null, claimId: '', serviceType: 'direct_billing', notes: '' })
                }
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 p-3.5 rounded-xl text-xs space-y-1.5 text-blue-900">
              <p className="font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-blue-600" />
                Mạng lưới liên kết hỗ trợ cấp Thư bảo lãnh trực tiếp (Cashless Guarantee)
              </p>
              <p className="text-blue-700">
                Sau khi gửi lệnh, hệ thống sẽ tự động gán đối tác vào hồ sơ bồi thường, ghi nhận nhật ký nghiệp vụ và gửi thông báo xác nhận bảo lãnh đến điện thoại của người được bảo hiểm.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-gray-700">
                  Mã hồ sơ bồi thường (Claim ID) <span className="text-rose-500">*</span>
                </Label>
                <Input
                  placeholder="Nhập ID hồ sơ (ví dụ: 67d... hoặc chọn từ danh sách)"
                  value={dispatchModal.claimId}
                  onChange={(e) => setDispatchModal({ ...dispatchModal, claimId: e.target.value })}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700">Loại nghiệp vụ điều phối</Label>
                <select
                  value={dispatchModal.serviceType}
                  onChange={(e) => setDispatchModal({ ...dispatchModal, serviceType: e.target.value })}
                  className="w-full h-10 px-3 border rounded-xl text-sm font-medium bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="direct_billing">Bảo lãnh viện phí trực tiếp tại Bệnh viện (Direct Billing)</option>
                  <option value="garage_repair">Bảo lãnh sửa chữa xe & phụ tùng tại Gara đối tác</option>
                  <option value="rescue_dispatch">Phát lệnh điều xe cứu hộ khẩn cấp 24/7 đến hiện trường</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700">Ghi chú & Yêu cầu nghiệp vụ</Label>
                <textarea
                  value={dispatchModal.notes}
                  onChange={(e) => setDispatchModal({ ...dispatchModal, notes: e.target.value })}
                  rows={3}
                  placeholder="Ghi chú hạn mức bảo lãnh hoặc thông tin liên hệ của khách hàng..."
                  className="w-full text-sm p-3 border rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() =>
                  setDispatchModal({ open: false, partner: null, claimId: '', serviceType: 'direct_billing', notes: '' })
                }
              >
                Hủy bỏ
              </Button>
              <Button
                onClick={handleDispatchSubmit}
                disabled={dispatching || !dispatchModal.claimId.trim()}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
              >
                {dispatching && <Loader2 size={16} className="animate-spin mr-2" />}
                Xác nhận phát lệnh điều phối
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Thêm / Sửa Đối tác ───────────────────────────────────────── */}
      {partnerModal.open && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {partnerModal.mode === 'add' ? 'Thêm Đối tác Mạng lưới Mới' : 'Cập nhật Thông tin Đối tác'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Quản lý gara, bệnh viện và đội cứu hộ trong hệ sinh thái ClaimFlow
                </p>
              </div>
              <button
                onClick={() => setPartnerModal({ open: false, mode: 'add', partner: {} })}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs font-semibold text-gray-700">Tên đơn vị đối tác *</Label>
                <Input
                  placeholder="Ví dụ: Bệnh viện Đa khoa Quốc tế Vinmec Central Park"
                  value={partnerModal.partner.name || ''}
                  onChange={(e) =>
                    setPartnerModal({
                      ...partnerModal,
                      partner: { ...partnerModal.partner, name: e.target.value },
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700">Loại hình đối tác</Label>
                  <select
                    value={partnerModal.partner.partner_type || 'garage'}
                    onChange={(e) =>
                      setPartnerModal({
                        ...partnerModal,
                        partner: {
                          ...partnerModal.partner,
                          partner_type: e.target.value as any,
                        },
                      })
                    }
                    className="w-full h-10 px-3 border rounded-xl text-sm bg-white"
                  >
                    <option value="garage">Garage Sửa chữa xe</option>
                    <option value="hospital">Bệnh viện Bảo lãnh viện phí</option>
                    <option value="rescue">Đội cứu hộ khẩn cấp 24/7</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700">Tỉnh / Thành phố</Label>
                  <Input
                    placeholder="Ví dụ: Hồ Chí Minh, Hà Nội"
                    value={partnerModal.partner.province || ''}
                    onChange={(e) =>
                      setPartnerModal({
                        ...partnerModal,
                        partner: { ...partnerModal.partner, province: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700">Địa chỉ đầy đủ *</Label>
                <Input
                  placeholder="Số nhà, tên đường, phường/quận..."
                  value={partnerModal.partner.address || ''}
                  onChange={(e) =>
                    setPartnerModal({
                      ...partnerModal,
                      partner: { ...partnerModal.partner, address: e.target.value },
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-gray-700">Hotline 24/7</Label>
                  <Input
                    placeholder="1900 xxxx hoặc số hotline"
                    value={partnerModal.partner.hotline || ''}
                    onChange={(e) =>
                      setPartnerModal({
                        ...partnerModal,
                        partner: { ...partnerModal.partner, hotline: e.target.value },
                      })
                    }
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-gray-700">Số điện thoại tiếp nhận</Label>
                  <Input
                    placeholder="028 xxxx xxxx"
                    value={partnerModal.partner.phone || ''}
                    onChange={(e) =>
                      setPartnerModal({
                        ...partnerModal,
                        partner: { ...partnerModal.partner, phone: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-gray-700">
                  Dịch vụ cung cấp (phân cách bằng dấu phẩy)
                </Label>
                <Input
                  placeholder="Ví dụ: Cứu hộ 24/7, Sửa chữa thân vỏ, Bảo lãnh ngoại trú"
                  value={servicesInput}
                  onChange={(e) => setServicesInput(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={partnerModal.partner.cashless_supported ?? true}
                    onChange={(e) =>
                      setPartnerModal({
                        ...partnerModal,
                        partner: { ...partnerModal.partner, cashless_supported: e.target.checked },
                      })
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  Hỗ trợ Bảo lãnh viện phí / Sửa chữa trực tiếp (Cashless)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                variant="outline"
                onClick={() => setPartnerModal({ open: false, mode: 'add', partner: {} })}
              >
                Hủy bỏ
              </Button>
              <Button
                onClick={handleSavePartner}
                disabled={savingPartner}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm"
              >
                {savingPartner && <Loader2 size={16} className="animate-spin mr-2" />}
                {partnerModal.mode === 'add' ? 'Thêm vào mạng lưới' : 'Lưu thay đổi'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

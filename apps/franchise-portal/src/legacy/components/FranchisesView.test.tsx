import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, type FranchiseProfile } from '../services/api';
import { FranchisesView } from './FranchisesView';

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      franchises: vi.fn(),
      franchise: vi.fn(),
      addTerritory: vi.fn(),
      completeSupport: vi.fn(),
      updateDelivery: vi.fn(),
      closeFranchise: vi.fn(),
    },
  };
});

const profile: FranchiseProfile = {
  id: 41, franchise_code: 'HY-0041', shop_name: '南京新能源服务中心', status: '交付中',
  province: '江苏省', city: '南京市',
  territories: [{ id: 5, province: '江苏省', city: '南京市', exclusive: false }],
  delivery: [
    { id: 11, name: '资料准备', kind: 'material', status: 'planned', planned_on: '2026-11-15', evidence: null },
    { id: 12, name: '系统应用', kind: 'application', status: 'unknown', planned_on: null, evidence: null },
    { id: 13, name: '培训应用', kind: 'application', status: 'applied', planned_on: null, evidence: '已确认' },
  ],
  support: [
    { id: 21, milestone: 'd30', due_on: '2026-09-01', completed_on: '2026-09-01', notes: null },
    { id: 22, milestone: 'd60', due_on: '2026-10-01', completed_on: '2026-10-01', notes: null },
    { id: 23, milestone: 'd90', due_on: '2026-11-01', completed_on: '2026-11-01', notes: null },
    { id: 24, milestone: 'monthly', due_on: '2026-12-01', completed_on: null, notes: null },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function view(selectedId?: number) {
  return <><div id="legacy-portals" className="legacy-crm" /><div className="app-shell"><FranchisesView selectedId={selectedId} user={{ id: 1, username: 'operator', role: 'operator', display_name: '业务账号' }} onCreateTraining={vi.fn()} /></div></>;
}

function mount(selectedId?: number) {
  return render(view(selectedId));
}

function mockTwoProfiles() {
  const other: FranchiseProfile = { ...structuredClone(profile), id: 42, franchise_code: 'HY-0042', shop_name: '苏州新能源服务中心', city: '苏州市', support: profile.support.map(item => ({ ...item, id: item.id + 100 })) };
  vi.mocked(api.franchises).mockResolvedValue([structuredClone(profile), other]);
  vi.mocked(api.franchise).mockImplementation(async (id) => id === profile.id ? structuredClone(profile) : other);
  return other;
}

async function openProfile() {
  const trigger = await screen.findByRole('button', { name: '打开档案' });
  await userEvent.click(trigger);
  const detail = await screen.findByRole('dialog', { name: profile.shop_name! });
  await within(detail).findByRole('heading', { name: '授权区域' });
  return { trigger, detail };
}

async function openAuthorization() {
  const { detail } = await openProfile();
  await userEvent.click(within(detail).getByRole('button', { name: '新增授权' }));
  return screen.findByRole('dialog', { name: '新增授权' });
}

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, '', '/crm/franchises');
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('reduced-motion'), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(api.franchises).mockResolvedValue([structuredClone(profile)]);
  vi.mocked(api.franchise).mockResolvedValue(structuredClone(profile));
  vi.mocked(api.addTerritory).mockResolvedValue(structuredClone(profile));
  vi.mocked(api.completeSupport).mockResolvedValue(structuredClone(profile));
  vi.mocked(api.updateDelivery).mockResolvedValue(structuredClone(profile));
});

afterEach(() => vi.unstubAllGlobals());

describe('franchise detail operations', () => {
  it('locks authorization submission and navigation until the pending request settles', async () => {
    const pending = deferred<FranchiseProfile>();
    vi.mocked(api.addTerritory).mockReturnValue(pending.promise);
    mount();
    const dialog = await openAuthorization();
    await userEvent.type(within(dialog).getByRole('textbox', { name: '授权省份' }), '江苏省');
    await userEvent.type(within(dialog).getByRole('textbox', { name: '授权城市' }), '苏州市');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: '独家授权' }));
    const submit = within(dialog).getByRole('button', { name: '保存授权' });
    await userEvent.click(submit);
    fireEvent.click(submit);
    expect(api.addTerritory).toHaveBeenCalledTimes(1);
    expect(api.addTerritory).toHaveBeenCalledWith(41, { province: '江苏省', city: '苏州市', exclusive: true });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByRole('textbox', { name: '授权省份' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '关闭' })).toBeDisabled();
    await act(async () => pending.resolve(structuredClone(profile)));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增授权' })).not.toBeInTheDocument());
  });

  it('keeps failed authorization input and clears the old error after a successful retry', async () => {
    vi.mocked(api.addTerritory).mockRejectedValueOnce(new ApiError(409, '当前城市已有独家授权'));
    mount();
    const dialog = await openAuthorization();
    await userEvent.type(within(dialog).getByRole('textbox', { name: '授权省份' }), '江苏省');
    await userEvent.type(within(dialog).getByRole('textbox', { name: '授权城市' }), '苏州市');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存授权' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('当前城市已有独家授权');
    expect(within(dialog).getByRole('textbox', { name: '授权城市' })).toHaveValue('苏州市');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存授权' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增授权' })).not.toBeInTheDocument());
    expect(screen.queryByText('当前城市已有独家授权')).not.toBeInTheDocument();
    expect(await screen.findByText('授权已保存')).toBeInTheDocument();
    expect(api.addTerritory).toHaveBeenCalledTimes(2);
  });

  it('reports failed visit and application requests and allows retry without losing the detail', async () => {
    vi.mocked(api.completeSupport).mockRejectedValueOnce(new ApiError(503, '回访保存失败，请重试'));
    vi.mocked(api.updateDelivery).mockRejectedValueOnce(new ApiError(503, '应用确认失败，请重试'));
    mount();
    const { detail } = await openProfile();
    await userEvent.click(within(detail).getByRole('button', { name: '完成回访' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('回访保存失败，请重试');
    expect(within(detail).getByRole('button', { name: '完成回访' })).toBeEnabled();
    await userEvent.click(within(detail).getByRole('button', { name: '确认应用' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('应用确认失败，请重试'));
    expect(screen.queryByText('回访保存失败，请重试')).not.toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: '确认应用' })).toBeEnabled();
    vi.mocked(api.completeSupport).mockResolvedValue({ ...structuredClone(profile), support: profile.support.map(item => ({ ...item, completed_on: item.completed_on || '2026-12-01' })) });
    await userEvent.click(within(detail).getByRole('button', { name: '完成回访' }));
    await waitFor(() => expect(within(detail).queryByRole('button', { name: '完成回访' })).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders delivery and support states as readable Chinese instead of backend codes', async () => {
    mount();
    const { detail } = await openProfile();
    expect(within(detail).getByRole('heading', { name: '交付事项' })).toBeInTheDocument();
    expect(within(detail).getByRole('heading', { name: '回访记录' })).toBeInTheDocument();
    expect(within(detail).getByText('资料准备')).toBeInTheDocument();
    expect(within(detail).getByText(/30.*回访/)).toBeInTheDocument();
    expect(within(detail).getByText(/60.*回访/)).toBeInTheDocument();
    expect(within(detail).getByText(/90.*回访/)).toBeInTheDocument();
    expect(within(detail).getByText(/月度回访/)).toBeInTheDocument();
    expect(detail.textContent).not.toMatch(/\b(planned|unknown|applied|d30|d60|d90|monthly)\b/);
  });

  it('allows continued editing or explicit discard when closing an unsaved authorization', async () => {
    mount();
    const dialog = await openAuthorization();
    await userEvent.type(within(dialog).getByRole('textbox', { name: '授权省份' }), '江苏省');
    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    await userEvent.click(await screen.findByRole('button', { name: '继续编辑' }));
    expect(within(dialog).getByRole('textbox', { name: '授权省份' })).toHaveValue('江苏省');
    await userEvent.click(within(dialog).getByRole('button', { name: '关闭' }));
    await userEvent.click(await screen.findByRole('button', { name: '放弃修改' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '新增授权' })).not.toBeInTheDocument());
    const detail = screen.getByRole('dialog', { name: profile.shop_name! });
    await userEvent.click(within(detail).getByRole('button', { name: '新增授权' }));
    expect(within(screen.getByRole('dialog', { name: '新增授权' })).getByRole('textbox', { name: '授权省份' })).toHaveValue('');
    expect(api.addTerritory).not.toHaveBeenCalled();
  });

  it('restores a saved draft after the page is remounted without submitting it', async () => {
    const first = mount();
    const dialog = await openAuthorization();
    await userEvent.type(within(dialog).getByRole('textbox', { name: '授权省份' }), '江苏省');
    await userEvent.type(within(dialog).getByRole('textbox', { name: '授权城市' }), '无锡市');
    first.unmount();
    mount();
    const restored = await openAuthorization();
    await userEvent.click(within(restored).getByRole('button', { name: '恢复暂存' }));
    expect(within(restored).getByRole('textbox', { name: '授权省份' })).toHaveValue('江苏省');
    expect(within(restored).getByRole('textbox', { name: '授权城市' })).toHaveValue('无锡市');
    expect(api.addTerritory).not.toHaveBeenCalled();
  });

  it('returns keyboard focus to the original record after closing its detail', async () => {
    mount();
    const { trigger, detail } = await openProfile();
    await userEvent.click(within(detail).getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('cancels a close confirmation when browser navigation selects a different franchise', async () => {
    const other = mockTwoProfiles();
    const rendered = mount(profile.id);
    const detail = await screen.findByRole('dialog', { name: profile.shop_name! });
    await userEvent.click(within(detail).getByRole('button', { name: '关闭加盟商' }));
    const confirmation = await screen.findByRole('dialog', { name: '关闭加盟商' });
    await userEvent.type(within(confirmation).getByRole('textbox', { name: '操作原因' }), '南京门店经营调整');
    rendered.rerender(view(other.id));
    const otherDetail = await screen.findByRole('dialog', { name: other.shop_name! });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '关闭加盟商' })).not.toBeInTheDocument());
    expect(api.closeFranchise).not.toHaveBeenCalled();
    await userEvent.click(within(otherDetail).getByRole('button', { name: '关闭加盟商' }));
    const nextConfirmation = await screen.findByRole('dialog', { name: '关闭加盟商' });
    expect(nextConfirmation).toHaveTextContent(other.shop_name!);
    expect(nextConfirmation).not.toHaveTextContent(profile.shop_name!);
    expect(within(nextConfirmation).getByRole('textbox', { name: '操作原因' })).toHaveValue('');
  });

  it('does not show an earlier franchise request failure on a newly selected franchise', async () => {
    const other = mockTwoProfiles();
    const pending = deferred<FranchiseProfile>();
    vi.mocked(api.completeSupport).mockReturnValueOnce(pending.promise);
    const rendered = mount(profile.id);
    const detail = await screen.findByRole('dialog', { name: profile.shop_name! });
    await userEvent.click(within(detail).getByRole('button', { name: '完成回访' }));
    expect(api.completeSupport).toHaveBeenCalledWith(24, '回访完成');
    rendered.rerender(view(other.id));
    const otherDetail = await screen.findByRole('dialog', { name: other.shop_name! });
    await act(async () => pending.reject(new ApiError(503, '南京门店回访保存失败')));
    expect(screen.queryByText('南京门店回访保存失败')).not.toBeInTheDocument();
    expect(within(otherDetail).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(otherDetail).getByRole('button', { name: '完成回访' })).toBeEnabled();
  });

  it('focuses the search field when completing the last weekly visit removes the original record', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const weekly: FranchiseProfile = { ...structuredClone(profile), support: [{ ...profile.support[3], due_on: today }] };
    vi.mocked(api.franchises).mockResolvedValue([weekly]);
    vi.mocked(api.franchise).mockResolvedValue(weekly);
    vi.mocked(api.completeSupport).mockResolvedValue({ ...weekly, support: [{ ...weekly.support[0], completed_on: today }] });
    mount();
    await screen.findByRole('button', { name: '打开档案' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '回访时间' }), 'week');
    const { detail, trigger } = await openProfile();
    await userEvent.click(within(detail).getByRole('button', { name: '完成回访' }));
    await waitFor(() => expect(trigger).not.toBeInTheDocument());
    await userEvent.click(within(detail).getByRole('button', { name: '返回列表' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('textbox', { name: '搜索加盟商档案' })).toHaveFocus());
  });

  it('clears an already displayed operation error when browser navigation changes the record', async () => {
    const other = mockTwoProfiles();
    vi.mocked(api.completeSupport).mockRejectedValueOnce(new ApiError(503, '南京门店回访保存失败'));
    const rendered = mount(profile.id);
    const detail = await screen.findByRole('dialog', { name: profile.shop_name! });
    await userEvent.click(within(detail).getByRole('button', { name: '完成回访' }));
    expect(await within(detail).findByRole('alert')).toHaveTextContent('南京门店回访保存失败');
    rendered.rerender(view(other.id));
    const otherDetail = await screen.findByRole('dialog', { name: other.shop_name! });
    expect(within(otherDetail).queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('南京门店回访保存失败')).not.toBeInTheDocument();
  });
});

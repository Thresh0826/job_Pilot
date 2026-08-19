import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  createEmptyCandidateProfile,
  type CandidateProfile,
  type CandidateSnapshot,
  type EducationItem,
  type ProjectItem,
  type WorkItem,
} from '../../core/candidate';
import { useAppStore } from '../stores/useAppStore';
import { Badge, Button, Field, Input, TagInput, Textarea, useToast } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function emptyValue(v: string): string {
  return v.trim() ? v : '—';
}

/* ------------------------------------------------------------------ */
/* 通用可编辑列表（教育 / 工作 / 项目）                                */
/* ------------------------------------------------------------------ */
interface ListFieldDef {
  key: string;
  label: string;
  flex?: number;
  textarea?: boolean;
}

function ItemListEditor({
  label,
  items,
  fields,
  onChange,
  addLabel,
}: {
  label: string;
  items: Record<string, string>[];
  fields: ListFieldDef[];
  onChange: (next: Record<string, string>[]) => void;
  addLabel: string;
}) {
  const update = (idx: number, key: string, value: string) => {
    const next = items.map((it, i) => (i === idx ? { ...it, [key]: value } : it));
    onChange(next);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => {
    const empty: Record<string, string> = {};
    for (const f of fields) empty[f.key] = '';
    onChange([...items, empty]);
  };

  return (
    <div className="profile-list">
      <div className="profile-list__head">
        <span className="profile-list__label">{label}</span>
        <Button variant="secondary" size="sm" onClick={add} type="button">
          <Plus size={14} /> 添加{addLabel}
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="small muted">暂无{label}，点击「添加{addLabel}」补充。</div>
      ) : (
        items.map((item, idx) => (
          <div className="profile-list__item" key={idx}>
            <div className="profile-list__grid">
              {fields.map((f) =>
                f.textarea ? (
                  <Textarea
                    key={f.key}
                    placeholder={f.label}
                    value={item[f.key] ?? ''}
                    onChange={(e) => update(idx, f.key, e.target.value)}
                    style={{ gridColumn: '1 / -1' }}
                  />
                ) : (
                  <Input
                    key={f.key}
                    placeholder={f.label}
                    value={item[f.key] ?? ''}
                    onChange={(e) => update(idx, f.key, e.target.value)}
                    style={f.flex ? { flex: f.flex } : undefined}
                  />
                ),
              )}
            </div>
            <button
              type="button"
              className="profile-list__remove"
              onClick={() => remove(idx)}
              aria-label={`删除${label}条目`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

const EDUCATION_FIELDS: ListFieldDef[] = [
  { key: 'startDate', label: '开始时间', flex: 1 },
  { key: 'endDate', label: '结束时间', flex: 1 },
  { key: 'school', label: '学校', flex: 2 },
  { key: 'major', label: '专业', flex: 2 },
  { key: 'degree', label: '学历', flex: 1 },
];

const WORK_FIELDS: ListFieldDef[] = [
  { key: 'startDate', label: '开始时间', flex: 1 },
  { key: 'endDate', label: '结束时间', flex: 1 },
  { key: 'company', label: '公司', flex: 2 },
  { key: 'title', label: '职位', flex: 2 },
  { key: 'description', label: '工作内容', textarea: true },
];

const PROJECT_FIELDS: ListFieldDef[] = [
  { key: 'startDate', label: '开始时间', flex: 1 },
  { key: 'endDate', label: '结束时间', flex: 1 },
  { key: 'name', label: '项目名称', flex: 2 },
  { key: 'role', label: '担任角色', flex: 2 },
  { key: 'description', label: '项目内容', textarea: true },
];

/* ------------------------------------------------------------------ */
/* 我的资料页面                                                        */
/* ------------------------------------------------------------------ */
export default function Profile() {
  const toast = useToast();
  const loadSettings = useAppStore((s) => s.loadSettings);

  const [snapshot, setSnapshot] = useState<CandidateSnapshot | null>(null);
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CandidateProfile | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resume = snapshot?.resume ?? null;
  const profile = snapshot?.profile ?? null;
  const profileForCurrentResume =
    !!resume && !!profile && snapshot?.profileResumeId === resume.id;
  const needsParse = !!resume && (!profile || !profileForCurrentResume);

  const load = async () => {
    let snap = await window.api.getCandidateProfile();
    // 有简历但没有资料：自动解析（首次进入 / V0.3 旧简历迁移）。
    if (snap.resume && !snap.profile) {
      setParsing(true);
      try {
        snap = await window.api.parseResume();
        toast('已从简历中整理出候选人资料');
      } catch (err) {
        toast(err instanceof Error ? err.message : '简历解析失败', 'error');
      } finally {
        setParsing(false);
      }
    }
    setSnapshot(snap);
  };

  useEffect(() => {
    void load();
  }, []);

  const pickFile = () => fileInputRef.current?.click();

  const onFileChosen = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await importAndParse(file);
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await importAndParse(file);
  };

  /** 用户确认后的导入 + 解析（首次上传 / 更换简历共用）。 */
  const importAndParse = async (file: File) => {
    setBusy(true);
    try {
      const snap = await window.api.importResumeAndParse(window.api.getPathForFile(file));
      setSnapshot(snap);
      setEditing(false);
      setConfirmingReplace(false);
      setConfirmingRemove(false);
      toast('新简历已保存并完成解析');
      void loadSettings();
    } catch (err) {
      toast(err instanceof Error ? err.message : '简历导入失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeResume = async () => {
    setBusy(true);
    try {
      await window.api.removeResume();
      setSnapshot({ resume: null, profile: null, profileResumeId: null, confirmed: false, warnings: [] });
      setEditing(false);
      setConfirmingRemove(false);
      toast('已移除简历');
      void loadSettings();
    } catch (err) {
      toast(err instanceof Error ? err.message : '移除失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reparse = async () => {
    setBusy(true);
    try {
      const snap = await window.api.parseResume();
      setSnapshot(snap);
      setEditing(false);
      toast('已按当前简历重新生成候选人资料');
    } catch (err) {
      toast(err instanceof Error ? err.message : '解析失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = () => {
    setDraft(profile ? structuredClone(profile) : createEmptyCandidateProfile());
    setEditing(true);
  };

  const saveDraft = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const snap = await window.api.saveCandidateProfile(draft);
      setSnapshot(snap);
      setEditing(false);
      toast('候选人资料已保存');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const patchDraft = (patch: Partial<CandidateProfile>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const uploadHint = (
    <div className="small muted" style={{ marginTop: 12 }}>
      支持 PDF / DOCX，文件只保存在本机。上传后 JobPilot 会从中整理出候选人资料。
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <PageHeader
        title="我的资料"
        desc="JobPilot 从你的简历中整理出候选人资料。请检查并修正，后续岗位匹配会使用你确认后的资料。"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        style={{ display: 'none' }}
        onChange={(e) => void onFileChosen(e)}
      />

      {/* ---------- 1. 当前简历 ---------- */}
      <div className="card mb-24">
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          当前简历
        </h2>

        {!resume ? (
          <div>
            <div
              className={`dropzone ${dragOver ? 'dropzone--over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => void onDrop(e)}
            >
              <div className="dropzone__icon">
                <Upload size={26} strokeWidth={1.5} />
              </div>
              <div style={{ fontWeight: 600 }}>拖入你的简历</div>
              <div className="small muted mt-8">PDF / DOCX</div>
              <Button className="mt-16" variant="ghost" disabled={busy} onClick={pickFile}>
                选择文件
              </Button>
            </div>
            {uploadHint}
          </div>
        ) : (
          <div>
            <div className="resume-card">
              <div className="resume-card__icon">
                {resume.originalName.split('.').pop()?.toUpperCase() ?? 'FILE'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {resume.originalName}
                  <Badge variant="agent">当前使用</Badge>
                </div>
                <div className="small muted" style={{ marginTop: 2 }}>
                  {formatSize(resume.fileSize)} · {resume.createdAt.slice(0, 16).replace('T', ' ')} 上传 ·
                  已复制到 JobPilot 数据目录
                </div>
              </div>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmingReplace((v) => !v)}>
                更换简历
              </Button>
              <Button variant="danger" size="sm" disabled={busy} onClick={() => setConfirmingRemove((v) => !v)}>
                移除
              </Button>
            </div>

            {confirmingReplace ? (
              <div className="profile-warn">
                <div className="profile-warn__title">更换简历会重新生成候选人资料</div>
                <div className="small secondary">
                  选择新简历后，JobPilot 将基于新简历重新解析并生成候选人资料，替换当前展示的资料。
                  你对当前资料的修改不会被静默保留，请确认后再继续。
                </div>
                <div className="profile-warn__actions">
                  <Button size="sm" disabled={busy} onClick={pickFile}>
                    选择新简历并解析
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingReplace(false)}>
                    取消
                  </Button>
                </div>
              </div>
            ) : null}

            {confirmingRemove ? (
              <div className="profile-warn profile-warn--danger">
                <div className="profile-warn__title">确认移除这份简历？</div>
                <div className="small secondary">
                  移除后，由这份简历整理的候选人资料也会一并删除。此操作无法撤销。
                </div>
                <div className="profile-warn__actions">
                  <Button variant="danger" size="sm" disabled={busy} onClick={() => void removeResume()}>
                    确认移除
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmingRemove(false)}>
                    取消
                  </Button>
                </div>
              </div>
            ) : null}

            {needsParse && !confirmingReplace ? (
              <div className="profile-warn">
                <div className="profile-warn__title">
                  {profile ? '当前简历与候选人资料不一致' : '这份简历还没有解析'}
                </div>
                <div className="small secondary">
                  {profile
                    ? '你更换过简历。重新解析会基于当前简历生成新的候选人资料，覆盖当前展示的内容。'
                    : '点击「解析当前简历」，JobPilot 会从这份简历中整理出候选人资料。'}
                </div>
                <div className="profile-warn__actions">
                  <Button size="sm" disabled={busy || parsing} onClick={() => void reparse()}>
                    解析当前简历
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ---------- 2. 候选人资料 ---------- */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div>
            <h2 className="section-title">候选人资料</h2>
            {profile ? (
              <div className="small muted" style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
                <Badge variant="agent">已解析</Badge>
                {snapshot?.profileResumeId === resume?.id ? (
                  snapshot?.confirmed ? (
                    <Badge variant="neutral">已确认</Badge>
                  ) : (
                    <Badge variant="attention">待确认</Badge>
                  )
                ) : (
                  <Badge variant="attention">资料来自旧简历</Badge>
                )}
                <span>
                  {snapshot?.profileResumeId === resume?.id
                    ? '内容来自你的简历，识别结果可能需要修正。'
                    : '当前展示的资料来自之前的简历，解析当前简历后会更新。'}
                </span>
              </div>
            ) : null}
          </div>
          {profile && !editing && profileForCurrentResume ? (
            <Button variant="secondary" size="sm" onClick={startEdit}>
              <Pencil size={14} /> 编辑资料
            </Button>
          ) : null}
        </div>

        {parsing ? (
          <div className="empty">正在从简历中整理候选人资料…</div>
        ) : !resume ? (
          <EmptyState
            icon={<FileText size={30} strokeWidth={1.5} />}
            title="还没有候选人资料"
            desc="上传简历后，JobPilot 会在这里整理出你的教育、经历、技能等信息。"
          />
        ) : !profile ? (
          <EmptyState
            icon={<FileText size={30} strokeWidth={1.5} />}
            title="这份简历还没有解析"
            desc="点击上方的「解析当前简历」，JobPilot 会尝试从中整理出候选人资料。"
          />
        ) : snapshot?.warnings && snapshot.warnings.length > 0 && !snapshot.confirmed && profileForCurrentResume ? (
          <div className="profile-warn mb-16">
            <div className="profile-warn__title">当前解析已完成，部分内容解析不完整</div>
            <div className="small secondary">
              请对照原简历手动填写：{snapshot.warnings.join('、')}
            </div>
          </div>
        ) : editing && draft ? (
          <ProfileEditor
            draft={draft}
            onPatch={patchDraft}
            onSave={() => void saveDraft()}
            onCancel={() => setEditing(false)}
            busy={busy}
          />
        ) : (
          <ProfileReadView profile={profile} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 资料只读视图                                                        */
/* ------------------------------------------------------------------ */
function ProfileReadView({ profile }: { profile: CandidateProfile }) {
  return (
    <div className="profile-view">
      <div className="profile-grid">
        <Field label="姓名">
          <div className="profile-value">{emptyValue(profile.name)}</div>
        </Field>
        <Field label="手机号">
          <div className="profile-value">{emptyValue(profile.phone)}</div>
        </Field>
        <Field label="邮箱">
          <div className="profile-value">{emptyValue(profile.email)}</div>
        </Field>
        <Field label="工作年限">
          <div className="profile-value">{emptyValue(profile.workYears)}</div>
        </Field>
      </div>

      <ProfileSection title="教育背景">
        {profile.education.length === 0 ? (
          <ProfileEmpty />
        ) : (
          profile.education.map((it, i) => (
            <div className="profile-line" key={i}>
              <div className="profile-line__title">
                {it.school || '未识别学校'}
                {it.degree ? <span className="profile-line__tag">{it.degree}</span> : null}
              </div>
              <div className="profile-line__sub">
                {[it.startDate && `${it.startDate} - ${it.endDate || '至今'}`, it.major]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ))
        )}
      </ProfileSection>

      <ProfileSection title="工作 / 实习经历">
        {profile.workExperience.length === 0 ? (
          <ProfileEmpty />
        ) : (
          profile.workExperience.map((it, i) => (
            <div className="profile-line" key={i}>
              <div className="profile-line__title">
                {[it.company, it.title].filter(Boolean).join(' · ') || '未识别'}
              </div>
              {it.startDate || it.endDate ? (
                <div className="profile-line__sub">
                  {it.startDate} - {it.endDate || '至今'}
                </div>
              ) : null}
              {it.description ? <div className="profile-line__desc">{it.description}</div> : null}
            </div>
          ))
        )}
      </ProfileSection>

      <ProfileSection title="项目经历">
        {profile.projectExperience.length === 0 ? (
          <ProfileEmpty />
        ) : (
          profile.projectExperience.map((it, i) => (
            <div className="profile-line" key={i}>
              <div className="profile-line__title">
                {it.name || '未识别项目'}
                {it.role ? <span className="profile-line__tag">{it.role}</span> : null}
              </div>
              {it.startDate || it.endDate ? (
                <div className="profile-line__sub">
                  {it.startDate} - {it.endDate || '至今'}
                </div>
              ) : null}
              {it.description ? <div className="profile-line__desc">{it.description}</div> : null}
            </div>
          ))
        )}
      </ProfileSection>

      <ProfileTags label="技能" tags={profile.skills} />
      <ProfileTags label="证书" tags={profile.certificates} />
      <ProfileTags label="语言能力" tags={profile.languages} />

      <ProfileSection title="自我评价">
        {profile.summary ? (
          <div className="profile-line__desc" style={{ whiteSpace: 'pre-wrap' }}>
            {profile.summary}
          </div>
        ) : (
          <ProfileEmpty />
        )}
      </ProfileSection>
    </div>
  );
}

function ProfileSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="profile-section">
      <div className="profile-section__title">{title}</div>
      {children}
    </div>
  );
}

function ProfileEmpty() {
  return <div className="small muted">简历中未识别到相关内容。</div>;
}

function ProfileTags({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="profile-section">
      <div className="profile-section__title">{label}</div>
      {tags.length === 0 ? (
        <ProfileEmpty />
      ) : (
        <div className="jd-tags">
          {tags.map((t) => (
            <span className="tag" key={t}>
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 资料编辑视图                                                        */
/* ------------------------------------------------------------------ */
function ProfileEditor({
  draft,
  onPatch,
  onSave,
  onCancel,
  busy,
}: {
  draft: CandidateProfile;
  onPatch: (patch: Partial<CandidateProfile>) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <div className="profile-view">
      <div className="profile-grid">
        <Field label="姓名">
          <Input value={draft.name} onChange={(e) => onPatch({ name: e.target.value })} placeholder="简历中识别到的姓名" />
        </Field>
        <Field label="手机号">
          <Input value={draft.phone} onChange={(e) => onPatch({ phone: e.target.value })} />
        </Field>
        <Field label="邮箱">
          <Input value={draft.email} onChange={(e) => onPatch({ email: e.target.value })} />
        </Field>
        <Field label="工作年限">
          <Input value={draft.workYears} onChange={(e) => onPatch({ workYears: e.target.value })} placeholder="如：5年" />
        </Field>
      </div>

      <ItemListEditor
        label="教育背景"
        items={draft.education as unknown as Record<string, string>[]}
        fields={EDUCATION_FIELDS}
        onChange={(education) => onPatch({ education: education as unknown as EducationItem[] })}
        addLabel="教育经历"
      />
      <ItemListEditor
        label="工作 / 实习经历"
        items={draft.workExperience as unknown as Record<string, string>[]}
        fields={WORK_FIELDS}
        onChange={(workExperience) => onPatch({ workExperience: workExperience as unknown as WorkItem[] })}
        addLabel="工作经历"
      />
      <ItemListEditor
        label="项目经历"
        items={draft.projectExperience as unknown as Record<string, string>[]}
        fields={PROJECT_FIELDS}
        onChange={(projectExperience) => onPatch({ projectExperience: projectExperience as unknown as ProjectItem[] })}
        addLabel="项目经历"
      />

      <div className="profile-section">
        <div className="profile-section__title">技能</div>
        <TagInput value={draft.skills} onChange={(skills) => onPatch({ skills })} placeholder="输入技能后回车添加" addLabel="添加" />
      </div>
      <div className="profile-section">
        <div className="profile-section__title">证书</div>
        <TagInput value={draft.certificates} onChange={(certificates) => onPatch({ certificates })} placeholder="输入证书后回车添加" addLabel="添加" />
      </div>
      <div className="profile-section">
        <div className="profile-section__title">语言能力</div>
        <TagInput value={draft.languages} onChange={(languages) => onPatch({ languages })} placeholder="如：英语 CET-6" addLabel="添加" />
      </div>

      <div className="profile-section">
        <div className="profile-section__title">自我评价</div>
        <Textarea
          value={draft.summary}
          onChange={(e) => onPatch({ summary: e.target.value })}
          placeholder="简历中的自我评价 / 个人总结"
        />
      </div>

      <div className="settings__save">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          取消
        </Button>
        <Button onClick={onSave} disabled={busy}>
          {busy ? '保存中…' : '保存资料'}
        </Button>
      </div>
    </div>
  );
}

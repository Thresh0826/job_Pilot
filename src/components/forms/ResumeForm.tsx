import { useState, type DragEvent } from 'react';
import type { ResumeRecord } from '../../../core/resume';
import { Button, useToast } from '../ui';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResumeForm({
  value,
  onChange,
}: {
  value: ResumeRecord | null;
  onChange: (next: ResumeRecord | null) => void;
}) {
  const toast = useToast();
  const [dragOver, setDragOver] = useState(false);

  const pick = async () => {
    try {
      const record = await window.api.pickResume();
      if (record) {
        onChange(record);
        toast('简历已保存');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '选择文件失败', 'error');
    }
  };

  const onDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const record = await window.api.importResume(window.api.getPathForFile(file));
      onChange(record);
      toast('简历已保存');
    } catch (err) {
      toast(err instanceof Error ? err.message : '简历导入失败', 'error');
    }
  };

  const remove = async () => {
    await window.api.removeResume();
    onChange(null);
    toast('已移除简历');
  };

  if (value) {
    const ext = value.originalName.split('.').pop()?.toUpperCase() ?? 'FILE';
    return (
      <div className="resume-card">
        <div className="resume-card__icon">{ext}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 650 }}>{value.originalName}</div>
          <div className="small muted">
            {formatSize(value.fileSize)} · 已复制到 JobPilot 数据目录
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void pick()}>
          更换
        </Button>
        <Button variant="danger" size="sm" onClick={() => void remove()}>
          移除
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`dropzone ${dragOver ? 'dropzone--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="dropzone__icon">📄</div>
      <div style={{ fontWeight: 650 }}>拖入你的简历</div>
      <div className="small muted mt-8">PDF / DOCX</div>
      <Button className="mt-16" variant="ghost" onClick={() => void pick()}>
        选择文件
      </Button>
    </div>
  );
}

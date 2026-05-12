import { useRef } from 'react';
import { MousePointer2, Hand, Type, MessageSquare, Upload, Download, ChevronLeft, Frame } from 'lucide-react';
import type { Tool } from '@/types';
import { uploadApi } from '@/lib/api';

interface Props {
  activeTool: Tool;
  onToolChange: (t: Tool) => void;
  onAddText: () => void;
  onMediaAdded: (url: string, mimeType: string) => void;
  onExport: () => void;
  role: string;
  boardName: string;
  onBack: () => void;
}

const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
  { id: 'select',  icon: <MousePointer2 size={15} />, label: 'Select (V)' },
  { id: 'hand',    icon: <Hand size={15} />,          label: 'Pan (H)' },
  { id: 'frame',   icon: <Frame size={15} />,          label: 'Frame (F)' },
  { id: 'text',    icon: <Type size={15} />,          label: 'Text (T)' },
  { id: 'comment', icon: <MessageSquare size={15} />, label: 'Comment (C)' },
];

const ROLE_COLOR: Record<string, string> = {
  owner:     'rgba(123,104,238,0.25)',
  editor:    'rgba(16,185,129,0.2)',
  commenter: 'rgba(245,158,11,0.2)',
  viewer:    'rgba(255,255,255,0.08)',
};
const ROLE_TEXT: Record<string, string> = {
  owner: '#a89cf7', editor: '#34d399', commenter: '#fbbf24', viewer: '#888',
};

export default function Toolbar({
  activeTool, onToolChange, onAddText, onMediaAdded, onExport, role, boardName, onBack,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

  const canEdit    = role === 'owner' || role === 'editor';
  const canComment = canEdit || role === 'commenter';

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      const result = await uploadApi.upload(file);
      onMediaAdded(result.url, result.mimetype);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      uploadingRef.current = false;
      e.target.value = '';
    }
  };

  return (
    <div
      className="flex items-center h-11 px-2 gap-1 flex-shrink-0 select-none"
      style={{ background: 'var(--bg-toolbar)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Back / board name */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md transition-colors text-sm font-semibold mr-1"
        style={{ color: 'var(--text-primary)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <ChevronLeft size={14} style={{ color: 'var(--text-muted)' }} />
        <span className="max-w-[140px] truncate">{boardName}</span>
      </button>

      <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />

      {/* Tool group */}
      <div className="flex items-center gap-0.5">
        {TOOLS.map((tool) => {
          if (tool.id === 'comment' && !canComment) return null;
          if (!canEdit && tool.id !== 'comment' && tool.id !== 'hand' && tool.id !== 'select') return null;
          return (
            <button
              key={tool.id}
              title={tool.label}
              onClick={() => {
                onToolChange(tool.id);
                if (tool.id === 'text') onAddText();
              }}
              className={`toolbar-btn ${activeTool === tool.id ? 'active' : ''}`}
            >
              {tool.icon}
            </button>
          );
        })}
      </div>

      <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />

      {/* Upload */}
      {canEdit && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/gif,image/png,image/jpeg,image/webp,image/svg+xml,video/mp4,video/webm"
            className="hidden"
            onChange={handleFile}
          />
          <button
            title="Upload media (or drag & drop / paste)"
            onClick={() => fileInputRef.current?.click()}
            className="toolbar-btn"
          >
            <Upload size={15} />
          </button>
        </>
      )}

      <div className="flex-1" />

      {/* Role badge */}
      <span
        className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
        style={{ background: ROLE_COLOR[role] ?? 'var(--bg-hover)', color: ROLE_TEXT[role] ?? '#888' }}
      >
        {role}
      </span>

      <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />

      {/* Export */}
      <button
        title="Export frame as PNG"
        onClick={onExport}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md transition-colors"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        <Download size={13} />
        Export
      </button>
    </div>
  );
}

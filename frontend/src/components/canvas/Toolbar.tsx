import { useRef } from 'react';
import { MousePointer2, Hand, Type, MessageSquare, Upload, Download, ChevronLeft, Frame, Users, Layers, Layout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Tool } from '@/types';
import { uploadApi } from '@/lib/api';

interface Props {
  activeTool: Tool;
  onToolChange: (t: Tool) => void;
  onAddText: () => void;
  onMediaAdded: (url: string, mimeType: string, file?: File) => void;
  onExport: () => void;
  role: string;
  boardName: string;
  onBack: () => void;
  // New: surface save status + layers toggle + share in toolbar
  saveStatus?: 'saved' | 'saving' | 'unsaved';
  showLayers?: boolean;
  onToggleLayers?: () => void;
  onShare?: () => void;
}

const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
  { id: 'select',  icon: <MousePointer2 size={15} />, label: 'Select (V)' },
  { id: 'hand',    icon: <Hand size={15} />,          label: 'Pan (H)' },
  { id: 'frame',   icon: <Frame size={15} />,          label: 'Frame (F)' },
  { id: 'text',    icon: <Type size={15} />,          label: 'Text (T)' },
  { id: 'comment', icon: <MessageSquare size={15} />, label: 'Comment (C)' },
];

const ROLE_COLOR: Record<string, string> = {
  owner:     'rgba(27,175,216,0.25)',
  editor:    'rgba(16,185,129,0.2)',
  commenter: 'rgba(245,158,11,0.2)',
  viewer:    'rgba(255,255,255,0.08)',
};
const ROLE_TEXT: Record<string, string> = {
  owner: '#7DD9ED', editor: '#34d399', commenter: '#fbbf24', viewer: '#888',
};

export default function Toolbar({
  activeTool, onToolChange, onAddText, onMediaAdded, onExport, role, boardName, onBack,
  saveStatus, showLayers, onToggleLayers, onShare,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const uploadingRef = useRef(false);

  const canEdit    = role === 'owner' || role === 'editor';
  const canComment = canEdit || role === 'commenter';

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || uploadingRef.current) return;
    uploadingRef.current = true;
    const reset = () => { uploadingRef.current = false; e.target.value = ''; };

    // GIF: pass File directly → CanvasEditor uses local blob URL (instant, no server wait)
    if (file.type === 'image/gif') {
      onMediaAdded('', 'image/gif', file);
      reset();
      return;
    }

    // Static image: FileReader data URL → instant display + persists in canvas JSON
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => { onMediaAdded(reader.result as string, file.type); reset(); };
      reader.onerror = () => reset();
      reader.readAsDataURL(file);
      return;
    }

    // Video: must upload to server
    try {
      const result = await uploadApi.upload(file);
      onMediaAdded(result.url, result.mimetype);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally {
      reset();
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
        <span className="toolbar-board-name max-w-[140px] truncate hidden sm:inline">{boardName}</span>
      </button>

      {/* Layers toggle */}
      {onToggleLayers && (
        <button
          title="Toggle layers"
          onClick={onToggleLayers}
          className="toolbar-btn"
          style={{ color: showLayers ? 'var(--accent)' : undefined,
                   background: showLayers ? 'rgba(27,175,216,0.15)' : undefined }}
        >
          <Layers size={15} />
        </button>
      )}

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

      {/* Save status */}
      {saveStatus && (
        <span className="text-xs font-medium mr-1 flex-shrink-0 hidden sm:inline" style={{
          color: saveStatus === 'saved' ? '#34d399' : saveStatus === 'saving' ? '#fbbf24' : '#f05252'
        }}>
          {saveStatus === 'saved'   && '✓ Saved'}
          {saveStatus === 'saving'  && '● Saving…'}
          {saveStatus === 'unsaved' && '✕ Failed'}
        </span>
      )}

      {/* Role badge — hidden on mobile */}
      <span
        className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize flex-shrink-0 hidden sm:inline"
        style={{ background: ROLE_COLOR[role] ?? 'var(--bg-hover)', color: ROLE_TEXT[role] ?? '#888' }}
      >
        {role}
      </span>

      <div className="w-px h-5 mx-1 flex-shrink-0 hidden sm:block" style={{ background: 'var(--border)' }} />

      {/* Mockups */}
      <button
        title="Preview in Mockup"
        onClick={() => navigate('/mockups')}
        className="flex items-center gap-1.5 text-xs px-2 sm:px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        <Layout size={13} />
        <span className="hidden sm:inline toolbar-label">Mockups</span>
      </button>

      <div className="w-px h-5 mx-1 flex-shrink-0 hidden sm:block" style={{ background: 'var(--border)' }} />

      {/* Export — icon only on mobile */}
      <button
        title="Export frame as PNG"
        onClick={onExport}
        className="flex items-center gap-1.5 text-xs px-2 sm:px-2.5 py-1.5 rounded-md transition-colors flex-shrink-0"
        style={{ color: 'var(--text-secondary)' }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
      >
        <Download size={13} />
        <span className="hidden sm:inline">Export</span>
      </button>

      {/* Share — icon only on mobile */}
      {onShare && role === 'owner' && (
        <>
          <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />
          <button
            onClick={onShare}
            className="flex items-center gap-1.5 text-xs px-2 sm:px-2.5 py-1.5 rounded-md font-semibold text-white transition-colors flex-shrink-0"
            style={{ background: 'var(--accent)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--accent)')}
          >
            <Users size={13} />
            <span className="hidden sm:inline">Share</span>
          </button>
        </>
      )}
    </div>
  );
}

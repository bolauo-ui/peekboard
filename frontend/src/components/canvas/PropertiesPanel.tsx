import { useEffect, useState } from 'react';
import { fabric } from 'fabric';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import FontPicker from '@/components/canvas/FontPicker';

interface Props {
  selectedObject: fabric.Object | null;
  canvas: fabric.Canvas | null;
  role: string;
  onBackgroundChange: (color: string) => void;
  backgroundColor: string;
}

const FONTS = ['Inter','Arial','Georgia','Times New Roman','Courier New','Verdana','Impact','Trebuchet MS'];


export default function PropertiesPanel({ selectedObject, canvas, role, onBackgroundChange, backgroundColor }: Props) {
  const canEdit = role === 'owner' || role === 'editor';
  const isText  = selectedObject instanceof fabric.IText || selectedObject instanceof fabric.Text;
  const isFrame = (selectedObject as any)?.data?.objectType === 'frame';

  const [fontFamily, setFontFamily] = useState('Inter');
  const [fontSize,   setFontSize]   = useState(32);
  const [fill,       setFill]       = useState('#ffffff');
  const [fontWeight, setFontWeight] = useState('normal');
  const [fontStyle,  setFontStyle]  = useState('normal');
  const [underline,  setUnderline]  = useState(false);
  const [textAlign,  setTextAlign]  = useState<'left'|'center'|'right'>('left');
  const [opacity,    setOpacity]    = useState(100);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [objW, setObjW] = useState(0);
  const [objH, setObjH] = useState(0);
  const [frameName, setFrameName]     = useState('Frame 1');
  const [frameFill, setFrameFill]     = useState('#ffffff');
  const [cornerRadius, setCornerRadius] = useState(0);

  useEffect(() => {
    if (!selectedObject) return;
    const o = selectedObject as any;
    setOpacity(Math.round((o.opacity ?? 1) * 100));
    setPosX(Math.round(o.left ?? 0));
    setPosY(Math.round(o.top  ?? 0));
    setObjW(Math.round(o.getScaledWidth?.()  ?? 0));
    setObjH(Math.round(o.getScaledHeight?.() ?? 0));
    if (isText) {
      setFontFamily(o.fontFamily ?? 'Inter');
      setFontSize(o.fontSize    ?? 32);
      setFill(o.fill            ?? '#ffffff');
      setFontWeight(o.fontWeight ?? 'normal');
      setFontStyle(o.fontStyle  ?? 'normal');
      setUnderline(o.underline  ?? false);
      setTextAlign(o.textAlign  ?? 'left');
    }
    if (isFrame) {
      setFrameName(o.data?.frameName ?? 'Frame');
      setFrameFill(o.fill && o.fill !== 'rgba(255,255,255,0)' ? o.fill : '#ffffff');
      setCornerRadius(o.rx ?? 0);
    }
  }, [selectedObject, isText, isFrame]);

  const apply = (props: Record<string, unknown>) => {
    if (!selectedObject || !canvas || !canEdit) return;
    selectedObject.set(props as any);
    canvas.renderAll();
  };

  const deleteObj  = () => { if (!selectedObject || !canvas || !canEdit) return; canvas.remove(selectedObject); canvas.renderAll(); };
  const fwd        = () => { canvas?.bringForward(selectedObject!); canvas?.renderAll(); };
  const bwd        = () => { canvas?.sendBackwards(selectedObject!); canvas?.renderAll(); };

  return (
    <aside
      className="w-60 flex flex-col overflow-y-auto flex-shrink-0"
      style={{ background: 'var(--bg-panel)', borderLeft: '1px solid var(--border)' }}
    >
      {/* ── No selection → Canvas properties ── */}
      {!selectedObject && (
        <div className="p-3 space-y-1">
          <SectionHeader>Canvas</SectionHeader>

          <div className="panel-section">
            <span className="panel-label">Background colour</span>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={backgroundColor}
                onChange={e => onBackgroundChange(e.target.value)}
                className="color-swatch"
                style={{ width: 36, height: 28, flexShrink: 0 }}
                disabled={!canEdit}
              />
              <input
                type="text"
                value={backgroundColor.toUpperCase()}
                onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) onBackgroundChange(e.target.value); }}
                className="panel-input font-mono"
                maxLength={7}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="panel-section">
            <span className="panel-label">Hint</span>
            <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Select any element to edit its properties.
            </p>
          </div>
        </div>
      )}

      {/* ── Object selected ── */}
      {selectedObject && (
        <div className="p-3 space-y-0">
          {/* Typography */}
          {isText && (
            <div className="panel-section">
              <SectionHeader>Typography</SectionHeader>

              <div className="mb-2">
                <FontPicker
                  value={fontFamily}
                  disabled={!canEdit}
                  onChange={(v) => { setFontFamily(v); apply({ fontFamily: v }); }}
                />
              </div>

              <div className="flex gap-1.5 mb-2">
                <div className="flex-1">
                  <span className="panel-label">Size</span>
                  <input type="number" value={fontSize} min={6} max={400}
                    onChange={e => { const v = parseInt(e.target.value)||12; setFontSize(v); apply({ fontSize: v }); }}
                    disabled={!canEdit} className="panel-input" />
                </div>
                <div style={{ width: 36 }}>
                  <span className="panel-label">Colour</span>
                  <input type="color" value={fill}
                    onChange={e => { setFill(e.target.value); apply({ fill: e.target.value }); }}
                    disabled={!canEdit}
                    className="color-swatch"
                    style={{ height: 28 }}
                  />
                </div>
              </div>

              {/* B / I / U */}
              <div className="flex gap-1 mb-2">
                <StyleBtn active={fontWeight === 'bold'} disabled={!canEdit}
                  onClick={() => { const v = fontWeight==='bold'?'normal':'bold'; setFontWeight(v); apply({ fontWeight: v }); }}>
                  <Bold size={12} />
                </StyleBtn>
                <StyleBtn active={fontStyle === 'italic'} disabled={!canEdit}
                  onClick={() => { const v = fontStyle==='italic'?'normal':'italic'; setFontStyle(v); apply({ fontStyle: v }); }}>
                  <Italic size={12} />
                </StyleBtn>
                <StyleBtn active={underline} disabled={!canEdit}
                  onClick={() => { setUnderline(!underline); apply({ underline: !underline }); }}>
                  <Underline size={12} />
                </StyleBtn>
              </div>

              {/* Alignment */}
              <div>
                <span className="panel-label">Align</span>
                <div className="flex gap-1">
                  {(['left','center','right'] as const).map(a => (
                    <StyleBtn key={a} active={textAlign===a} disabled={!canEdit}
                      onClick={() => { setTextAlign(a); apply({ textAlign: a }); }}>
                      {a==='left' && <AlignLeft size={12} />}
                      {a==='center' && <AlignCenter size={12} />}
                      {a==='right' && <AlignRight size={12} />}
                    </StyleBtn>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Frame properties */}
          {isFrame && (
            <div className="panel-section">
              <SectionHeader>Frame</SectionHeader>

              <span className="panel-label">Name</span>
              <input
                type="text"
                value={frameName}
                onChange={e => {
                  setFrameName(e.target.value);
                  if (selectedObject && canvas && canEdit) {
                    (selectedObject as any).data = {
                      ...(selectedObject as any).data,
                      frameName: e.target.value,
                    };
                    canvas.renderAll();
                  }
                }}
                disabled={!canEdit}
                className="panel-input mb-2"
                placeholder="Frame name"
              />

              <div className="flex gap-1.5">
                <div className="flex-1">
                  <span className="panel-label">Radius</span>
                  <input
                    type="number" min={0} max={500}
                    value={cornerRadius}
                    onChange={e => {
                      const v = Math.max(0, parseInt(e.target.value) || 0);
                      setCornerRadius(v);
                      apply({ rx: v, ry: v });
                    }}
                    disabled={!canEdit}
                    className="panel-input"
                  />
                </div>
                <div style={{ width: 36 }}>
                  <span className="panel-label">Fill</span>
                  <input
                    type="color"
                    value={frameFill}
                    onChange={e => {
                      setFrameFill(e.target.value);
                      apply({ fill: e.target.value });
                    }}
                    disabled={!canEdit}
                    className="color-swatch"
                    style={{ height: 28 }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Transform */}
          <div className="panel-section">
            <SectionHeader>Transform</SectionHeader>
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              {[{ label:'X', val:posX, setter:setPosX, key:'left' },
                { label:'Y', val:posY, setter:setPosY, key:'top' }].map(({ label, val, setter, key }) => (
                <div key={label}>
                  <span className="panel-label">{label}</span>
                  <input type="number" value={val}
                    onChange={e => { const v=parseInt(e.target.value)||0; setter(v); apply({ [key]: v }); }}
                    disabled={!canEdit} className="panel-input" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[{ label:'W', val:objW },{ label:'H', val:objH }].map(({ label, val }) => (
                <div key={label}>
                  <span className="panel-label">{label}</span>
                  <p className="text-xs px-2 py-1.5" style={{ color: 'var(--text-secondary)' }}>{val}px</p>
                </div>
              ))}
            </div>
          </div>

          {/* Opacity */}
          <div className="panel-section">
            <span className="panel-label">Opacity — {opacity}%</span>
            <input type="range" min={0} max={100} value={opacity}
              onChange={e => { const v=parseInt(e.target.value); setOpacity(v); apply({ opacity: v/100 }); }}
              disabled={!canEdit} className="w-full" />
          </div>

          {/* Layer */}
          {canEdit && (
            <div className="panel-section">
              <span className="panel-label">Layer</span>
              <div className="flex gap-1.5">
                <LayerBtn onClick={fwd}><ChevronUp size={11} /> Forward</LayerBtn>
                <LayerBtn onClick={bwd}><ChevronDown size={11} /> Back</LayerBtn>
              </div>
            </div>
          )}

          {/* Delete */}
          {canEdit && (
            <button onClick={deleteObj}
              className="w-full flex items-center justify-center gap-1.5 text-xs py-2 rounded-md transition-colors mt-1"
              style={{ color: 'var(--danger)', border: '1px solid rgba(240,82,82,0.25)', background: 'rgba(240,82,82,0.06)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(240,82,82,0.14)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(240,82,82,0.06)')}
            >
              <Trash2 size={12} /> Delete
            </button>
          )}
        </div>
      )}
    </aside>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>{children}</p>
  );
}

function StyleBtn({ children, active, onClick, disabled }: {
  children: React.ReactNode; active: boolean; onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`style-btn ${active ? 'active' : ''}`}>
      {children}
    </button>
  );
}

function LayerBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded transition-colors"
      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'var(--bg-input)'; }}
    >
      {children}
    </button>
  );
}

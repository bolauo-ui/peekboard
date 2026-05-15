import { useEffect, useMemo, useState } from 'react';
import { fabric } from 'fabric';
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Trash2, ChevronUp, ChevronDown, LayoutGrid, ArrowRight, ArrowDown, AlignStartVertical, AlignCenterVertical, AlignEndVertical } from 'lucide-react';
import FontPicker from '@/components/canvas/FontPicker';
import {
  applyAutoLayout, unlockChildren, getAutoLayout, setAutoLayout,
  DEFAULT_AUTO_LAYOUT, type AutoLayout,
} from '@/components/canvas/autoLayout';

interface Props {
  selectedObject: fabric.Object | null;
  canvas: fabric.Canvas | null;
  role: string;
  onBackgroundChange: (color: string) => void;
  backgroundColor: string;
  onStartEyePlacement?: () => void;
  eyeTick?: number;  // increment to force re-read of eye state
}

const FONTS = ['Inter','Arial','Georgia','Times New Roman','Courier New','Verdana','Impact','Trebuchet MS'];


export default function PropertiesPanel({ selectedObject, canvas, role, onBackgroundChange, backgroundColor, onStartEyePlacement, eyeTick }: Props) {
  const canEdit = role === 'owner' || role === 'editor';
  const isText  = selectedObject instanceof fabric.IText || selectedObject instanceof fabric.Text;
  const isFrame = (selectedObject as any)?.data?.objectType === 'frame'
                || (selectedObject as any)?.data?.type === 'frame';
  const isSvg   = (selectedObject as any)?.data?.objectType === 'svg';
  // Any image/media object (not text, not frame, not svg group) can have eyes
  const canHaveEyes = selectedObject && !isText && !isFrame && !isSvg;

  const [fontFamily,    setFontFamily]    = useState('Inter');
  const [fontSize,      setFontSize]      = useState(20);
  const [fill,          setFill]          = useState('#1a1a1a');
  const [fontWeight,    setFontWeight]    = useState('400');
  const [fontStyle,     setFontStyle]     = useState('normal');
  const [underline,     setUnderline]     = useState(false);
  const [textAlign,     setTextAlign]     = useState<'left'|'center'|'right'>('left');
  const [lineHeight,    setLineHeight]    = useState(1.2);
  const [charSpacing,   setCharSpacing]   = useState(0);  // Fabric unit = 1/1000 em
  const [opacity,    setOpacity]    = useState(100);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [objW, setObjW] = useState(0);
  const [objH, setObjH] = useState(0);
  const [frameName, setFrameName]     = useState('Frame 1');
  const [frameFill, setFrameFill]     = useState('#ffffff');
  const [cornerRadius, setCornerRadius] = useState(0);
  // Auto-layout config mirror so the UI is controlled.
  const [auto, setAuto] = useState<AutoLayout | null>(null);
  // Tick to force re-read of SVG child fills/strokes after each edit.
  const [svgTick, setSvgTick] = useState(0);
  // Eye follower state — re-read whenever eyeTick changes (placement added an eye).
  const [eyeFollower, setEyeFollower] = useState<{ enabled: boolean; eyes: any[] } | null>(null);

  useEffect(() => {
    if (!selectedObject) return;
    const o = selectedObject as any;
    setOpacity(Math.round((o.opacity ?? 1) * 100));
    setPosX(Math.round(o.left ?? 0));
    setPosY(Math.round(o.top  ?? 0));
    setObjW(Math.round(o.getScaledWidth?.()  ?? 0));
    setObjH(Math.round(o.getScaledHeight?.() ?? 0));
    if (isText) {
      setFontFamily(o.fontFamily  ?? 'Inter');
      setFontSize(o.fontSize      ?? 20);
      setFill(o.fill              ?? '#1a1a1a');
      setFontWeight(String(o.fontWeight ?? '400'));
      setFontStyle(o.fontStyle    ?? 'normal');
      setUnderline(o.underline    ?? false);
      setTextAlign(o.textAlign    ?? 'left');
      setLineHeight(o.lineHeight  ?? 1.2);
      setCharSpacing(o.charSpacing ?? 0);
    }
    if (isFrame) {
      setFrameName(o.data?.frameName ?? 'Frame');
      setFrameFill(o.fill && o.fill !== 'rgba(255,255,255,0)' ? o.fill : '#ffffff');
      setCornerRadius(o.rx ?? 0);
      setAuto((o.data?.autoLayout as AutoLayout) ?? null);
    } else {
      setAuto(null);
    }
    setSvgTick(t => t + 1);
    setEyeFollower((selectedObject as any)?.data?.eyeFollower ?? null);
  }, [selectedObject, isText, isFrame]);

  // Re-sync eye state when an eye is placed externally (eyeTick increments)
  useEffect(() => {
    setEyeFollower((selectedObject as any)?.data?.eyeFollower ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eyeTick]);

  const apply = (props: Record<string, unknown>) => {
    if (!selectedObject || !canvas || !canEdit) return;
    selectedObject.set(props as any);
    canvas.renderAll();
  };

  // ── Auto-layout helpers (only used when a frame is selected) ──────────────
  const writeAutoLayout = (next: AutoLayout | null) => {
    if (!selectedObject || !canvas || !canEdit) return;
    setAutoLayout(selectedObject, next);
    if (!next) unlockChildren(canvas, selectedObject);
    else       applyAutoLayout(canvas, selectedObject);
    canvas.fire('object:modified', { target: selectedObject });
    canvas.requestRenderAll();
    setAuto(next);
  };
  const patchAutoLayout = (patch: Partial<AutoLayout>) => {
    const next: AutoLayout = { ...(auto ?? DEFAULT_AUTO_LAYOUT), ...patch, enabled: true };
    writeAutoLayout(next);
  };

  // ── SVG child path helpers ─────────────────────────────────────────────────
  // Treat the selected SVG group as a flat list of child shapes. Editing
  // fill / stroke mutates the child directly; the group caches the children
  // so we mark the group dirty and re-render to flush the change.
  const svgChildren: fabric.Object[] = useMemo(() => {
    if (!isSvg || !selectedObject) return [];
    const g = selectedObject as fabric.Group;
    if (typeof (g as any).getObjects !== 'function') return [];
    return (g.getObjects() ?? []) as fabric.Object[];
  // svgTick forces a refresh when child colours change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSvg, selectedObject, svgTick]);

  const setSvgChildFill = (idx: number, hex: string) => {
    if (!canvas || !canEdit) return;
    const c = svgChildren[idx]; if (!c) return;
    c.set({ fill: hex });
    (selectedObject as any).dirty = true;
    canvas.requestRenderAll();
    canvas.fire('object:modified', { target: selectedObject! });
    setSvgTick(t => t + 1);
  };
  const setSvgChildStroke = (idx: number, hex: string) => {
    if (!canvas || !canEdit) return;
    const c = svgChildren[idx]; if (!c) return;
    c.set({ stroke: hex });
    (selectedObject as any).dirty = true;
    canvas.requestRenderAll();
    canvas.fire('object:modified', { target: selectedObject! });
    setSvgTick(t => t + 1);
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

              {/* Font family */}
              <div className="mb-1.5">
                <FontPicker value={fontFamily} disabled={!canEdit}
                  onChange={v => { setFontFamily(v); apply({ fontFamily: v }); }} />
              </div>

              {/* Weight + Style row */}
              <div className="flex gap-1.5 mb-1.5">
                <div className="flex-1">
                  <select
                    value={fontWeight}
                    disabled={!canEdit}
                    onChange={e => {
                      const v = e.target.value;
                      setFontWeight(v);
                      // Map numeric weight to bold/normal for Fabric
                      apply({ fontWeight: v });
                    }}
                    className="panel-input text-xs"
                    style={{ width: '100%' }}
                  >
                    {[['100','Thin'],['200','ExtraLight'],['300','Light'],
                      ['400','Regular'],['500','Medium'],['600','SemiBold'],
                      ['700','Bold'],['800','ExtraBold'],['900','Black']
                    ].map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                {/* Size */}
                <div style={{ width: 60 }}>
                  <input type="number" value={fontSize} min={6} max={800}
                    onChange={e => { const v = parseInt(e.target.value)||12; setFontSize(v); apply({ fontSize: v }); }}
                    disabled={!canEdit} className="panel-input text-xs text-center" />
                </div>
              </div>

              {/* Line height + Letter spacing */}
              <div className="flex gap-1.5 mb-1.5">
                <div className="flex-1">
                  <span className="panel-label">Line height</span>
                  <div className="flex items-center gap-1">
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>↕</span>
                    <input type="number" value={lineHeight} min={0.5} max={5} step={0.1}
                      onChange={e => { const v = parseFloat(e.target.value)||1.2; setLineHeight(v); apply({ lineHeight: v }); }}
                      disabled={!canEdit} className="panel-input text-xs flex-1" />
                  </div>
                </div>
                <div className="flex-1">
                  <span className="panel-label">Letter spacing</span>
                  <div className="flex items-center gap-1">
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>↔</span>
                    <input type="number" value={Math.round(charSpacing / 10)} min={-200} max={800} step={1}
                      onChange={e => {
                        const pct = parseInt(e.target.value)||0;
                        const cs  = pct * 10;   // Fabric charSpacing = 1/1000 em; 10 = 1%
                        setCharSpacing(cs); apply({ charSpacing: cs });
                      }}
                      disabled={!canEdit} className="panel-input text-xs flex-1" />
                  </div>
                </div>
              </div>

              {/* Colour + B / I / U */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <input type="color" value={fill}
                  onChange={e => { setFill(e.target.value); apply({ fill: e.target.value }); }}
                  disabled={!canEdit} className="color-swatch flex-shrink-0" style={{ height: 28, width: 36 }} />
                <div className="flex gap-1 flex-1">
                  <StyleBtn active={['700','800','900','bold'].includes(fontWeight)} disabled={!canEdit}
                    onClick={() => {
                      const isBold = ['700','800','900','bold'].includes(fontWeight);
                      const v = isBold ? '400' : '700';
                      setFontWeight(v); apply({ fontWeight: v });
                    }}>
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
              </div>

              {/* Alignment */}
              <div className="flex gap-1">
                {(['left','center','right'] as const).map(a => (
                  <StyleBtn key={a} active={textAlign===a} disabled={!canEdit}
                    onClick={() => { setTextAlign(a); apply({ textAlign: a }); }}>
                    {a==='left'   && <AlignLeft   size={12} />}
                    {a==='center' && <AlignCenter size={12} />}
                    {a==='right'  && <AlignRight  size={12} />}
                  </StyleBtn>
                ))}
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

          {/* Auto-layout (frames only) */}
          {isFrame && (
            <div className="panel-section">
              <div className="flex items-center justify-between mb-1.5">
                <SectionHeader>Auto Layout</SectionHeader>
                <button
                  onClick={() => writeAutoLayout(auto?.enabled ? null : DEFAULT_AUTO_LAYOUT)}
                  disabled={!canEdit}
                  className="text-xs px-1.5 py-0.5 rounded font-medium transition-colors"
                  style={{
                    background: auto?.enabled ? 'var(--accent-dim)' : 'var(--bg-section)',
                    color:      auto?.enabled ? 'var(--accent)'    : 'var(--text-secondary)',
                  }}
                  title="Toggle auto layout (Shift+A)"
                >
                  <LayoutGrid size={11} className="inline mr-1" />
                  {auto?.enabled ? 'On' : 'Off'}
                </button>
              </div>

              {auto?.enabled && (
                <>
                  {/* Direction */}
                  <div className="flex gap-1 mb-2">
                    <StyleBtn active={auto.direction === 'vertical'} disabled={!canEdit}
                      onClick={() => patchAutoLayout({ direction: 'vertical' })}>
                      <ArrowDown size={12} />
                    </StyleBtn>
                    <StyleBtn active={auto.direction === 'horizontal'} disabled={!canEdit}
                      onClick={() => patchAutoLayout({ direction: 'horizontal' })}>
                      <ArrowRight size={12} />
                    </StyleBtn>
                  </div>

                  {/* Gap + Padding */}
                  <div className="grid grid-cols-2 gap-1.5 mb-2">
                    <div>
                      <span className="panel-label">Gap</span>
                      <input
                        type="number" min={0} max={400}
                        value={auto.gap}
                        onChange={e => patchAutoLayout({ gap: Math.max(0, parseInt(e.target.value) || 0) })}
                        disabled={!canEdit}
                        className="panel-input"
                      />
                    </div>
                    <div>
                      <span className="panel-label">Padding</span>
                      <input
                        type="number" min={0} max={400}
                        value={auto.padding}
                        onChange={e => patchAutoLayout({ padding: Math.max(0, parseInt(e.target.value) || 0) })}
                        disabled={!canEdit}
                        className="panel-input"
                      />
                    </div>
                  </div>

                  {/* Cross-axis alignment */}
                  <div className="mb-2">
                    <span className="panel-label">Align cross</span>
                    <div className="flex gap-1">
                      {(['start','center','end'] as const).map(a => (
                        <StyleBtn key={a} active={auto.alignCross === a} disabled={!canEdit}
                          onClick={() => patchAutoLayout({ alignCross: a })}>
                          {a === 'start'  ? <AlignLeft  size={12} /> :
                           a === 'center' ? <AlignCenter size={12} /> :
                                            <AlignRight size={12} />}
                        </StyleBtn>
                      ))}
                    </div>
                  </div>

                  {/* Hug toggle */}
                  <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                    <input
                      type="checkbox"
                      checked={auto.hug}
                      disabled={!canEdit}
                      onChange={e => patchAutoLayout({ hug: e.target.checked })}
                    />
                    Hug contents (frame shrinks to fit)
                  </label>
                </>
              )}
            </div>
          )}

          {/* SVG paths (recolour individual children) */}
          {isSvg && svgChildren.length > 0 && (
            <div className="panel-section">
              <SectionHeader>SVG paths</SectionHeader>
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
                Click a swatch to recolour each path's fill or stroke.
              </p>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {svgChildren.map((c, i) => {
                  const name = (c as any).id || (c as any).data?.name || `Path ${i + 1}`;
                  const fillVal   = (c.fill   as string) || '#000000';
                  const strokeVal = (c.stroke as string) || '#000000';
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs px-1.5 py-1 rounded"
                      style={{ background: 'var(--bg-section)' }}
                    >
                      <span className="flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                        {name}
                      </span>
                      <label title="Fill" className="flex items-center gap-1">
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>F</span>
                        <input
                          type="color" value={fillVal}
                          onChange={(e) => setSvgChildFill(i, e.target.value)}
                          disabled={!canEdit}
                          className="color-swatch"
                          style={{ width: 22, height: 18 }}
                        />
                      </label>
                      <label title="Stroke" className="flex items-center gap-1">
                        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>S</span>
                        <input
                          type="color" value={strokeVal}
                          onChange={(e) => setSvgChildStroke(i, e.target.value)}
                          disabled={!canEdit}
                          className="color-swatch"
                          style={{ width: 22, height: 18 }}
                        />
                      </label>
                    </div>
                  );
                })}
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

          {/* Interactive — eyes follow cursor */}
          {canHaveEyes && canEdit && (
            <div className="panel-section">
              <div className="flex items-center justify-between mb-2">
                <SectionHeader>Interactive</SectionHeader>
                <button
                  onClick={() => {
                    const obj = selectedObject as any;
                    const next = !eyeFollower?.enabled;
                    const updated = { enabled: next, eyes: eyeFollower?.eyes ?? [] };
                    obj.data = { ...obj.data, eyeFollower: updated };
                    setEyeFollower(updated);
                    canvas?.renderAll();
                    if (next && onStartEyePlacement) onStartEyePlacement();
                  }}
                  className="text-xs px-1.5 py-0.5 rounded font-medium transition-colors"
                  style={{
                    background: eyeFollower?.enabled ? 'var(--accent-dim)' : 'var(--bg-section)',
                    color:      eyeFollower?.enabled ? 'var(--accent)'     : 'var(--text-secondary)',
                  }}
                >
                  {eyeFollower?.enabled ? 'On' : 'Off'}
                </button>
              </div>

              {eyeFollower?.enabled && (
                <>
                  <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {!eyeFollower.eyes?.length
                      ? '👆 Click on the image to mark eye positions (up to 2)'
                      : eyeFollower.eyes.length === 1
                      ? '1 eye placed — click again for a second eye'
                      : `✓ ${eyeFollower.eyes.length} eyes placed — cursor will follow`}
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      onClick={onStartEyePlacement}
                      className="flex-1 text-xs py-1.5 rounded transition-colors"
                      style={{ background: 'var(--bg-section)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    >
                      {eyeFollower.eyes?.length ? 'Reposition' : 'Place eyes'}
                    </button>
                    <button
                      onClick={() => {
                        const obj = selectedObject as any;
                        const updated = { enabled: false, eyes: [] };
                        obj.data = { ...obj.data, eyeFollower: updated };
                        setEyeFollower(updated);
                        canvas?.renderAll();
                      }}
                      className="text-xs py-1.5 px-2.5 rounded"
                      style={{ background: 'rgba(240,82,82,0.07)', color: 'var(--danger)', border: '1px solid rgba(240,82,82,0.2)' }}
                    >
                      Clear
                    </button>
                  </div>
                </>
              )}
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

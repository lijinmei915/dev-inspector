import { useState, useEffect, useRef, useCallback } from 'react';
import { CircleHelp } from 'lucide-react';
import './dev-inspector.css';
import { useDevInspectorConfig } from './DevInspectorProvider';
import type { DevInspectorTokenConfig } from './config';
import type { PaletteColor, PaletteGroup } from './config';

function calcDropPos(rect: DOMRect, dropHeight = 280): { top: number; left: number } {
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= dropHeight + 8 ? rect.bottom + 4 : rect.top - dropHeight - 4;
  return { top: Math.max(8, top), left: rect.left };
}

// ─── 常量（Inspector 专属）───────────────────────────────────────
const COLOR_PROPS = [
  { label: '背景色', prop: 'background-color' },
];

// hex/rgba → 短标签（通过色板反查）
function getColorLabel(val: string, colorPalette: DevInspectorTokenConfig['colorPalette']): string | null {
  for (const g of colorPalette) {
    const found = g.colors.find((c: PaletteColor) => c.val === val);
    if (found) return `${g.group}·${found.label}`;
  }
  return null;
}

function getTypographyToken(
  fontSize: string,
  fontWeight: string,
  color: string,
  typographyTokens: DevInspectorTokenConfig['typographyTokens'],
) {
  const normalizedColor = normalizeColor(color);
  return typographyTokens.find(token =>
    token.fontSize === fontSize.trim()
    && token.fontWeight === fontWeight.trim()
    && normalizeColor(token.color) === normalizedColor,
  ) ?? null;
}

const BORDER_STYLE_OPTIONS = [
  { label: '─', value: 'solid',  title: '实线' },
  { label: '┄', value: 'dashed', title: '虚线' },
  { label: '⋯', value: 'dotted', title: '点线' },
  { label: '✕', value: 'none',   title: '无' },
];

type SizeAxis = 'width' | 'height';
type SizeMode = 'fill' | 'hug' | 'fixed';
type ScopeMode = 'current' | 'component';
type StyleIntentChange = { prop: string; val: string; from?: string };
type StyleIntentEntryGroup = { selector: string; changes: StyleIntentChange[] };
type StyleIntentQueueEntry = {
  id: string;
  createdAt: string;
  targetLabel?: string;
  selector?: string;
  note?: string;
  entries: StyleIntentEntryGroup[];
};
type StyleIntentSummary = {
  pendingCount: number;
  latestPending: StyleIntentQueueEntry | null;
  pendingEntries: StyleIntentQueueEntry[];
};

const SIZE_OPTIONS: { label: string; mode: SizeMode; value?: string }[] = [
  { label: 'Fill', mode: 'fill', value: '100%' },
  { label: 'Hug', mode: 'hug', value: 'fit-content' },
  { label: 'Fixed', mode: 'fixed' },
];

// ─── 工具函数 ────────────────────────────────────────────────────
function rgbToHex(rgb: string): string {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function normalizeColor(val: string): string {
  const m = val.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (m) return '#' + [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
  return val.trim();
}

function formatColorDisplay(val: string): string {
  // rgba(r,g,b,a) → #hex / a%
  const m = val.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (m) {
    const hex = '#' + [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
    const alpha = Math.round(parseFloat(m[4]) * 100);
    return alpha < 100 ? `${hex} / ${alpha}%` : hex;
  }
  return val;
}

const shadowValueCache = new Map<string, string>();

// 跨面板共享的复制样式缓存
let _copiedStyles: { prop: string; val: string }[] = [];

function canonicalizeShadowValue(val: string): string {
  const raw = (val || 'none').trim() || 'none';
  if (shadowValueCache.has(raw)) return shadowValueCache.get(raw)!;
  if (typeof document === 'undefined' || !document.body) return raw;
  const probe = document.createElement('div');
  probe.style.boxShadow = raw;
  probe.style.position = 'fixed';
  probe.style.opacity = '0';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const normalized = getComputedStyle(probe).boxShadow.trim() || raw;
  probe.remove();
  shadowValueCache.set(raw, normalized);
  return normalized;
}

function formatShadowDisplay(val: string): string {
  if (!val || val === 'none') return 'none';
  return val.replace(/\s+/g, ' ');
}

function getShadowDisplay(
  val: string,
  authoredVal: string,
  shadowTokens: DevInspectorTokenConfig['shadowTokens'],
): { label: string; sub: string; isHardcoded: boolean } {
  const authoredVar = authoredVal.match(/var\((--[^),\s]+)/)?.[1];
  const normalized = canonicalizeShadowValue(val);
  const matched = shadowTokens.find(token => token.cssVar === authoredVar)
    ?? shadowTokens.find(token => canonicalizeShadowValue(token.value) === normalized);

  if (matched) {
    return {
      label: matched.label,
      sub: matched.cssVar,
      isHardcoded: false,
    };
  }

  return {
    label: val === 'none' ? '无' : '自定义',
    sub: formatShadowDisplay(val),
    isHardcoded: val !== 'none',
  };
}

function getClasses(el: Element): string[] {
  return Array.from(el.classList).filter(c => !c.startsWith('di-'));
}

const STATE_CLASS_NAMES = new Set([
  'active', 'selected', 'current', 'open', 'expanded', 'collapsed',
  'disabled', 'enabled', 'checked', 'focus', 'focused', 'hover', 'pressed',
  'loading', 'error', 'success', 'warning',
]);

function isStateClass(className: string): boolean {
  return STATE_CLASS_NAMES.has(className)
    || className.startsWith('is-')
    || className.startsWith('has-')
    || className.startsWith('state-')
    || className.endsWith('--active')
    || className.endsWith('--selected')
    || className.endsWith('--current')
    || className.endsWith('--open')
    || className.endsWith('--disabled');
}

function getComponentClasses(el: Element): string[] {
  const componentClasses = getClasses(el).filter(c =>
    !isStateClass(c)
    && !/^lucide(-|$)/.test(c)
  );
  return componentClasses.length ? componentClasses : getClasses(el);
}

function getStateClasses(el: Element): string[] {
  return getClasses(el).filter(c => !/^lucide(-|$)/.test(c));
}

const UNSAFE_GLOBAL_TAGS = new Set([
  'a', 'aside', 'button', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'img', 'input', 'label', 'li', 'main', 'ol', 'p', 'path', 'section',
  'span', 'strong', 'svg', 'textarea', 'ul',
]);

function classSelector(classes: string[]): string {
  const escapeClass = (value: string) => {
    try { return CSS.escape(value); } catch { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
  };
  return classes.length ? '.' + classes.map(escapeClass).join('.') : '';
}

function queryByClasses(el: Element, classes: string[]): Element[] {
  if (!classes.length) return [el];
  const includePanels = !!el.closest('.di-panel');
  try {
    return Array.from(document.querySelectorAll(classSelector(classes)))
      .filter(e => includePanels || !e.closest('.di-panel'));
  } catch { return [el]; }
}

function getSameComponentEls(el: Element): Element[] {
  return queryByClasses(el, getComponentClasses(el));
}

function getSameStateEls(el: Element): Element[] {
  return queryByClasses(el, getStateClasses(el));
}

function getScopeTargets(el: Element, scope: ScopeMode): Element[] {
  if (scope === 'component') return getSameComponentEls(el);
  return [el];
}

function getClassSelectorForScope(el: Element, scope: ScopeMode): string {
  const classes = scope === 'component' ? getComponentClasses(el) : getStateClasses(el);
  return classSelector(classes) || el.tagName.toLowerCase();
}

function getStructuralStep(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const sameTagSiblings = Array.from(parent.children).filter(child => child.tagName === el.tagName);
  if (sameTagSiblings.length <= 1) return tag;
  return `${tag}:nth-of-type(${sameTagSiblings.indexOf(el) + 1})`;
}

function getContextualSelectorForScope(el: Element, scope: ScopeMode): string {
  let anchor = el.parentElement;
  while (anchor && !getClasses(anchor).length) anchor = anchor.parentElement;
  if (!anchor) return '';

  const anchorSelector = getClassSelectorForScope(anchor, scope);
  const path: string[] = [];
  let cursor: Element | null = el;

  while (cursor && cursor !== anchor) {
    path.unshift(getStructuralStep(cursor));
    cursor = cursor.parentElement;
  }

  return path.length ? `${anchorSelector} > ${path.join(' > ')}` : anchorSelector;
}

function getSelectorForScope(el: Element, scope: ScopeMode): string {
  const classes = scope === 'component' ? getComponentClasses(el) : getStateClasses(el);
  if (classes.length) return classSelector(classes);
  const tag = el.tagName.toLowerCase();
  if (!UNSAFE_GLOBAL_TAGS.has(tag)) return tag;
  const contextualSelector = getContextualSelectorForScope(el, scope);
  return contextualSelector || tag;
}

function canPersistSelector(el: Element, scope: ScopeMode): boolean {
  const classes = scope === 'component' ? getComponentClasses(el) : getStateClasses(el);
  if (classes.length) return true;
  if (el.classList.contains('lucide') || Array.from(el.classList).some(c => /^lucide-/.test(c))) {
    return getContextualSelectorForScope(el, scope).length > 0;
  }
  const tag = el.tagName.toLowerCase();
  if (!UNSAFE_GLOBAL_TAGS.has(tag)) return true;
  return getContextualSelectorForScope(el, scope).length > 0;
}

function isInsidePanel(el: Element): boolean {
  return el.closest('.di-panel') !== null || el.closest('.di-trigger') !== null || el.closest('.di-label') !== null;
}

function pickPanelElement(x: number, y: number, panel: HTMLElement, excluded?: Element): Element | null {
  const stack = document.elementsFromPoint(x, y);
  return stack.find(el =>
    el !== excluded &&
    el !== panel &&
    panel.contains(el)
  ) ?? null;
}

// 扫描 :root CSS 变量，建立 值→token 映射
function scanTokenMap(): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (!prop.startsWith('--')) continue;
              const raw = rule.style.getPropertyValue(prop).trim();
              const hex = raw.startsWith('rgb') ? rgbToHex(raw) : raw;
              map[raw] = prop;
              if (hex !== raw) map[hex] = prop;
            }
          }
        }
      } catch { /* cross-origin */ }
    }
  } catch {}
  return map;
}

function getComputedColor(el: Element, prop: string): string {
  return normalizeColor(getComputedStyle(el).getPropertyValue(prop).trim());
}

function getComputedRadius(el: Element): string {
  return getComputedStyle(el).getPropertyValue('border-radius').trim();
}

function getComputedPadding(el: Element): string {
  const cs = getComputedStyle(el);
  const t = cs.paddingTop, r = cs.paddingRight, b = cs.paddingBottom, l = cs.paddingLeft;
  if (t === r && r === b && b === l) return t;
  return `${t} ${r} ${b} ${l}`;
}

function parseTranslate(val: string): { x: number; y: number } {
  const raw = (val || 'none').trim();
  if (!raw || raw === 'none') return { x: 0, y: 0 };
  const parts = raw.split(/\s+/);
  const toNum = (v?: string) => v ? Number.parseFloat(v) || 0 : 0;
  return { x: toNum(parts[0]), y: toNum(parts[1]) };
}

function formatTranslate(pos: { x: number; y: number }): string {
  return `${Math.round(pos.x)}px ${Math.round(pos.y)}px`;
}

function normalizeCssSize(v: string): string {
  const raw = v.trim();
  if (!raw) return 'auto';
  if (/^-?\d+(\.\d+)?$/.test(raw)) return `${raw}px`;
  const appendedPxNumber = raw.match(/px(-?\d+(?:\.\d+)?)$/i);
  if (appendedPxNumber) return `${appendedPxNumber[1]}px`;
  return raw;
}

function getAuthoredStyleValue(el: Element, prop: string): string {
  const inline = (el as HTMLElement).style.getPropertyValue(prop).trim();
  if (inline) return inline;
  let found = '';
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          if (!(rule instanceof CSSStyleRule)) continue;
          if (!rule.style.getPropertyValue(prop)) continue;
          if (el.matches(rule.selectorText)) found = rule.style.getPropertyValue(prop).trim();
        }
      } catch { /* ignore */ }
    }
  } catch {}
  return found;
}

function inferSizeMode(el: Element, axis: SizeAxis, computedSize: string): SizeMode {
  const cs = getComputedStyle(el);
  const authored = getAuthoredStyleValue(el, axis).toLowerCase();
  const display = cs.display.trim();
  const flexGrow = Number.parseFloat(cs.flexGrow) || 0;

  if (authored) {
    if (authored === 'auto') return axis === 'height' ? 'hug' : 'fill';
    if (authored.includes('fit-content') || authored.includes('max-content') || authored.includes('min-content')) return 'hug';
    if (authored.includes('%') || authored.includes('vw') || authored.includes('vh') || flexGrow > 0) return 'fill';
    return 'fixed';
  }

  if (axis === 'width') {
    if (flexGrow > 0) return 'fill';
    if (display === 'block' && el.parentElement) {
      const parentWidth = el.parentElement.getBoundingClientRect().width;
      const selfWidth = el.getBoundingClientRect().width;
      if (parentWidth > 0 && selfWidth / parentWidth > 0.88) return 'fill';
    }
    if (display.startsWith('inline')) return 'hug';
  }

  if (axis === 'height' && !getAuthoredStyleValue(el, 'min-height') && computedSize !== '0px') {
    return 'hug';
  }

  return 'fixed';
}

function sizeValueForMode(mode: SizeMode, current: string): string {
  if (mode === 'fill') return '100%';
  if (mode === 'hug') return 'fit-content';
  return current || '0px';
}

function displaySizeValue(cssValue: string, current: string): string {
  if (!cssValue || cssValue === '100%' || cssValue === 'fit-content') return current || '0px';
  return cssValue;
}

function getOneLineHugHeight(el: Element | null): number {
  if (!(el instanceof HTMLElement)) return 0;
  const hasText = (el.textContent ?? '').trim().length > 0;
  const isTextControl = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement;
  if (!hasText && !isTextControl) return 0;

  const cs = getComputedStyle(el);
  const fontSize = Number.parseFloat(cs.fontSize) || 0;
  const lineHeight = cs.lineHeight === 'normal'
    ? fontSize * 1.2
    : Number.parseFloat(cs.lineHeight) || fontSize * 1.2;
  const paddingY = (Number.parseFloat(cs.paddingTop) || 0) + (Number.parseFloat(cs.paddingBottom) || 0);
  const borderY = (Number.parseFloat(cs.borderTopWidth) || 0) + (Number.parseFloat(cs.borderBottomWidth) || 0);
  return Math.ceil(lineHeight + paddingY + borderY);
}

function clampHeightToOneLine(cssValue: string, el: Element | null): string {
  const px = cssValue.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (!px) return cssValue;
  const minH = getOneLineHugHeight(el);
  if (!minH) return cssValue;
  return `${Math.max(Number.parseFloat(px[1]), minH)}px`;
}

function calcPanelPos(rect: DOMRect): { top: number; left: number } {
  const W = 380;
  const maxH = window.innerHeight * 0.9; // 和 CSS max-height: 90vh 保持一致
  let left = rect.right + 16;
  let top = rect.top;
  if (left + W > window.innerWidth - 8) left = Math.max(8, rect.left - W - 16);
  // 确保面板不超出底部：top + 90vh <= 100vh
  top = Math.min(top, window.innerHeight - maxH - 8);
  top = Math.max(8, top);
  return { top, left };
}

function matchPreset<T extends { value: string }>(presets: T[], val: string): T | null {
  const px = val.replace(/\s/g, '');
  return presets.find(p => p.value === px || p.value === val) ?? null;
}

function resizeTextareaToContent(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}

// ── SideInput：单格输入，支持 token 下拉 ──────────────────────
function SideInput({
  value,
  onChange,
  spaceSteps,
  wide,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  spaceSteps: DevInspectorTokenConfig['spaceSteps'];
  wide?: boolean;
  compact?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const step = spaceSteps.find(s => s.val === value);
  const displayLabel = step && step.label !== '无' ? step.label : value === '0px' ? '0' : value;
  const displaySub = step && step.label !== '无' ? value : null;

  return (
    <div className={`di-side-combo${wide ? ' di-side-combo--wide' : ''}${compact ? ' di-side-combo--compact' : ''}`}>
      <div className="di-side-display" ref={triggerRef} onClick={() => {
        if (triggerRef.current) {
          const r = triggerRef.current.getBoundingClientRect();
          // wide 时左对齐，普通时居中
          setPopupPos({ top: r.bottom + 4, left: wide ? r.left : r.left + r.width / 2 });
        }
        setFocused(true); setDraft(value);
      }}>
        <span className="di-side-display-label">{displayLabel}</span>
        {displaySub && <span className="di-side-display-sub">{displaySub}</span>}
      </div>
      {focused && (
        <>
          <div className="di-side-overlay" onClick={() => setFocused(false)} />
          <div className="di-side-popup" style={{ top: popupPos.top, left: popupPos.left, transform: wide ? 'none' : 'translateX(-50%)' }}>
            <input
              className="di-side-input-edit"
              value={draft}
              autoFocus
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const s = spaceSteps.find(s => s.label.toLowerCase() === draft.toLowerCase());
                  onChange(s ? s.val : draft || '0px');
                  setFocused(false);
                }
                if (e.key === 'Escape') setFocused(false);
              }}
              placeholder="输入数值…"
            />
            <div className="di-side-steps">
              {spaceSteps.map(s => (
                <button key={s.val}
                  className={`di-side-step-item${value === s.val ? ' di-side-step-item--on' : ''}`}
                  onMouseDown={e => { e.preventDefault(); onChange(s.val); setFocused(false); }}>
                  <span>{s.label}</span>
                  {s.val !== '0px' && <span className="di-side-step-sub">{s.val}</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

type FourSides = { top: string; right: string; bottom: string; left: string };
function parseFourSides(val: string): FourSides {
  const p = (val || '0px').trim().split(/\s+/);
  if (p.length === 1) return { top: p[0], right: p[0], bottom: p[0], left: p[0] };
  if (p.length === 2) return { top: p[0], right: p[1], bottom: p[0], left: p[1] };
  if (p.length === 3) return { top: p[0], right: p[1], bottom: p[2], left: p[1] };
  return { top: p[0], right: p[1], bottom: p[2], left: p[3] };
}
function joinFourSides(s: FourSides): string {
  if (s.top === s.right && s.right === s.bottom && s.bottom === s.left) return s.top;
  if (s.top === s.bottom && s.left === s.right) return `${s.top} ${s.right}`;
  return `${s.top} ${s.right} ${s.bottom} ${s.left}`;
}

// SpaceCard 子组件
function SpaceCard({ title, variant, value, onChange, spaceSteps }: {
  title: string;
  variant: 'padding' | 'margin' | 'gap';
  value: string;
  onChange: (v: string) => void;
  spaceSteps: DevInspectorTokenConfig['spaceSteps'];
}) {
  // gap：宽版 SideInput，图示放 input 左右两侧
  if (variant === 'gap') {
    return (
      <div className="di-space-card">
        <div className="di-space-head">
          <span className="di-space-title">{title}</span>
        </div>
        <div className="di-gap-input-row">
          <div className="di-gap-block" />
          <SideInput value={value} onChange={onChange} spaceSteps={spaceSteps} wide />
          <div className="di-gap-block" />
        </div>
      </div>
    );
  }

  // padding / margin：4方向 SideInput
  const sides = parseFourSides(value);
  function updateSide(side: keyof FourSides, v: string) {
    const next = { ...sides, [side]: v };
    onChange(joinFourSides(next));
  }

  return (
    <div className="di-space-card">
      <div className="di-space-head">
        <span className="di-space-title">{title}</span>
      </div>
      <div className={`di-boxing di-boxing--${variant}`}>
        <div className="di-box-top">   <SideInput value={sides.top}    onChange={v => updateSide('top', v)} spaceSteps={spaceSteps} compact /></div>
        <div className="di-box-left">  <SideInput value={sides.left}   onChange={v => updateSide('left', v)} spaceSteps={spaceSteps} compact /></div>
        <div className="di-box-center"><div className="di-boxing-block" /></div>
        <div className="di-box-right"> <SideInput value={sides.right}  onChange={v => updateSide('right', v)} spaceSteps={spaceSteps} compact /></div>
        <div className="di-box-bottom"><SideInput value={sides.bottom} onChange={v => updateSide('bottom', v)} spaceSteps={spaceSteps} compact /></div>
      </div>
    </div>
  );
}

// 判断是否为文字元素（直接包含文本内容）
function getTextContent(el: Element): string | null {
  const text = Array.from(el.childNodes)
    .filter(n => n.nodeType === Node.TEXT_NODE)
    .map(n => n.textContent ?? '')
    .join('')
    .trim();
  // 只有纯文本（或极少子元素）才视为文字层
  return text.length > 0 ? el.textContent?.trim() ?? null : null;
}

const TOKEN_TYPES = [
  { key: 'bg',     label: '背景色', code: 'bg' },
  { key: 'text',   label: '文字色', code: 'text' },
  { key: 'accent', label: '强调色', code: 'accent' },
  { key: 'border', label: '边框色', code: 'border' },
];
const TOKEN_COMPONENTS = [
  { key: 'global',  label: '全局',   code: 'global' },
  { key: 'sidebar', label: '侧边栏', code: 'sidebar' },
  { key: 'button',  label: '按钮',   code: 'button' },
  { key: 'card',    label: '卡片',   code: 'card' },
  { key: 'tag',     label: '标签',   code: 'tag' },
  { key: 'input',   label: '输入框', code: 'input' },
];
const TOKEN_STATES = [
  { key: 'default',  label: '默认态', code: 'default' },
  { key: 'hover',    label: '悬浮态', code: 'hover' },
  { key: 'active',   label: '激活态', code: 'active' },
  { key: 'disabled', label: '禁用态', code: 'disabled' },
  { key: 'success',  label: '成功态', code: 'success' },
  { key: 'warning',  label: '警告态', code: 'warning' },
];

// ─── ColorDropdown：色板分组下拉 ──────────────────────────────────
function ColorDropdown({ value, onChange, onClose, onAddToken, pos, colorPalette }: {
  value: string;
  onChange: (v: string, token: string) => void;
  onClose: () => void;
  onAddToken?: (val: string) => void;  // 只传颜色值，Modal 里选 token 名
  pos?: { top: number; left: number };
  colorPalette: DevInspectorTokenConfig['colorPalette'];
}) {
  const initHex = value.startsWith('#') ? value : '#6b7280';
  const [hexInput, setHexInput] = useState(initHex);
  const [alpha, setAlpha]       = useState(100);

  function buildColor(hex: string, a: number): string {
    const m = hex.match(/^#([0-9a-f]{6})$/i);
    if (!m || a >= 100) return hex;
    const r=parseInt(m[1].slice(0,2),16), g=parseInt(m[1].slice(2,4),16), b=parseInt(m[1].slice(4,6),16);
    return `rgba(${r},${g},${b},${(a/100).toFixed(2)})`;
  }

  function applyColor(hex: string, a: number) {
    onChange(buildColor(hex, a), '');
  }

  const style = pos ? { position: 'fixed' as const, top: pos.top, left: pos.left, zIndex: 99998 } : {};
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 99997 }} onClick={onClose} />
      <div className="di-palette-dropdown" style={style}>
        {/* 无背景色 */}
        <div className="di-palette-group">
          <div className="di-palette-group-label">无</div>
          <div className="di-palette-swatches">
            <button className="di-palette-none" title="无背景色 / transparent"
              onClick={() => { onChange('transparent', ''); onClose(); }} />
          </div>
        </div>

        {/* 色板 + 每组末尾「+」格子 */}
        {colorPalette.map(g => (
          <div key={g.group} className="di-palette-group">
            <div className="di-palette-group-label">{g.group}</div>
            <div className="di-palette-swatches">
              {g.colors.map(c => (
                <button key={c.token}
                  className={`di-palette-swatch${value === c.val ? ' di-palette-swatch--on' : ''}`}
                  style={{ background: c.val }}
                  title={`${g.group}·${c.label}  ${c.val}`}
                  onClick={() => { onChange(c.val, c.token); onClose(); }}
                />
              ))}
              {onAddToken && (
                <button className="di-palette-add-btn" title={`添加为${g.group}色 token`}
                  onClick={() => { onAddToken(buildColor(hexInput, alpha)); onClose(); }}>
                  +
                </button>
              )}
            </div>
          </div>
        ))}

        {/* 自定义底部：色块 + [#][hex] + [alpha][%] */}
        <div className="di-custom-bottom">
          <button className="di-custom-color-trigger" style={{ background: buildColor(hexInput, alpha), flexShrink: 0 }}
            onClick={() => {}} />
          {/* hex 输入，# 是灰色前缀 */}
          <div className="di-field-wrap">
            <span className="di-field-prefix">#</span>
            <input className="di-field-input" value={hexInput.replace(/^#/, '')} placeholder="ffffff"
              onChange={e => { const h='#'+e.target.value; setHexInput(h); applyColor(h, alpha); }}
              onBlur={e => { if (!/^[0-9a-f]{6}$/i.test(e.target.value)) setHexInput(initHex); }}
            />
          </div>
          {/* 透明度，% 是灰色后缀 */}
          <div className="di-field-wrap di-field-wrap--fixed">
            <input className="di-field-input di-field-input--num" type="number" min="0" max="100" value={alpha}
              onChange={e => { const a=Math.min(100,Math.max(0,+e.target.value||0)); setAlpha(a); applyColor(hexInput, a); }}
            />
            <span className="di-field-suffix">%</span>
          </div>
        </div>
      </div>
    </>
  );
}

// 从 CSS 属性名推断颜色类型
function inferType(cssProp?: string): string {
  if (!cssProp) return 'bg';
  if (cssProp === 'color') return 'text';
  if (cssProp.includes('border')) return 'border';
  if (cssProp.includes('background')) return 'bg';
  return 'accent';
}

// 从 class 列表推断组件
function inferComponent(classes: string[]): string {
  const joined = classes.join(' ').toLowerCase();
  if (/sidebar|nav-item|nav/.test(joined)) return 'sidebar';
  if (/button|btn|start/.test(joined)) return 'button';
  if (/card/.test(joined)) return 'card';
  if (/tag|badge|chip/.test(joined)) return 'tag';
  if (/input|field|form/.test(joined)) return 'input';
  return 'global';
}

// 从 class 列表推断状态
function inferState(classes: string[]): string {
  const joined = classes.join(' ').toLowerCase();
  if (/is-active|active|is-current|current/.test(joined)) return 'active';
  if (/disabled/.test(joined)) return 'disabled';
  if (/hover/.test(joined)) return 'hover';
  if (/success/.test(joined)) return 'success';
  if (/warning/.test(joined)) return 'warning';
  return 'default';
}

// ─── AddTokenModal：添加 token 弹出框 ─────────────────────────────
function AddTokenModal({ value, cssProp, elementClasses, onClose, onConfirm, colorPalette }: {
  value: string;
  cssProp?: string;
  elementClasses?: string[];
  onClose: () => void;
  onConfirm: (cssVar: string, val: string, usage: string) => void;
  colorPalette: DevInspectorTokenConfig['colorPalette'];
}) {
  const [mode, setMode]         = useState<'new' | 'replace'>('new');
  const [type, setType]         = useState(() => inferType(cssProp));
  const [component, setComponent] = useState(() => inferComponent(elementClasses ?? []));
  const [state, setState]       = useState(() => inferState(elementClasses ?? []));
  const [replaceTarget, setReplaceTarget] = useState('');

  const allTokens = colorPalette.flatMap(g => g.colors);
  const typeObj      = TOKEN_TYPES.find(t => t.key === type)!;
  const componentObj = TOKEN_COMPONENTS.find(c => c.key === component)!;
  const stateObj     = TOKEN_STATES.find(s => s.key === state)!;

  const generatedVar = mode === 'new'
    ? `--color-${typeObj.code}-${componentObj.code}-${stateObj.code}`
    : replaceTarget;

  const BtnGroup = ({ items, active, onSelect }: { items: {key:string;label:string}[]; active: string; onSelect:(k:string)=>void }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map(i => (
        <button key={i.key}
          className={`di-modal-opt-btn${active === i.key ? ' --on' : ''}`}
          onClick={() => onSelect(i.key)}>
          {i.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="di-modal-overlay" onClick={onClose}>
      <div className="di-modal" onClick={e => e.stopPropagation()}>
        {/* 顶部颜色信息 */}
        <div className="di-modal-header">
          <span className="di-modal-swatch" style={{ background: value }} />
          <span className="di-modal-hex">{value}</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: '#6b7280' }}>添加为 token</span>
        </div>

        <div className="di-modal-body">
          {/* 模式切换 */}
          <div className="di-modal-tabs">
            {[{k:'new',l:'新建 token'},{k:'replace',l:'替换已有 token'}].map(m => (
              <button key={m.k} className={`di-modal-tab${mode===m.k?' --on':''}`}
                onClick={() => setMode(m.k as 'new'|'replace')}>{m.l}</button>
            ))}
          </div>

          {mode === 'new' ? (
            <>
              <div className="di-modal-field">
                <div className="di-modal-field-label">颜色类型 <span className="di-modal-auto-tag">自动识别</span></div>
                <BtnGroup items={TOKEN_TYPES} active={type} onSelect={setType} />
              </div>
              <div className="di-modal-field">
                <div className="di-modal-field-label">组件 <span className="di-modal-auto-tag">自动识别</span></div>
                <BtnGroup items={TOKEN_COMPONENTS} active={component} onSelect={setComponent} />
              </div>
              <div className="di-modal-field">
                <div className="di-modal-field-label">用途 / 状态 <span className="di-modal-auto-tag">自动推断，可改</span></div>
                <BtnGroup items={TOKEN_STATES} active={state} onSelect={setState} />
              </div>
            </>
          ) : (
            <div className="di-modal-field">
              <div className="di-modal-field-label">选择要替换的 token</div>
              <select className="di-modal-select"
                value={replaceTarget} onChange={e => setReplaceTarget(e.target.value)}>
                <option value="">请选择…</option>
                {allTokens.map(c => (
                  <option key={c.token} value={c.token}>{c.token}（{c.val}）</option>
                ))}
              </select>
            </div>
          )}

          {/* 生成结果预览 */}
          {generatedVar && (
            <div className="di-modal-result">
              <div className="di-modal-result-label">系统生成 token 名称</div>
              <div className="di-modal-result-var">{generatedVar}</div>
              {mode === 'new' && (
                <div className="di-modal-result-trail">
                  {typeObj.label} → <code>{typeObj.code}</code>
                  &ensp;{componentObj.label} → <code>{componentObj.code}</code>
                  &ensp;{stateObj.label} → <code>{stateObj.code}</code>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="di-modal-foot">
          <button className="di-modal-cancel" onClick={onClose}>取消</button>
          <button className="di-modal-ok" disabled={!generatedVar}
            onClick={() => { if (generatedVar) { onConfirm(generatedVar, value, type); onClose(); } }}>
            确认创建
          </button>
        </div>
      </div>
    </div>
  );
}

// 获取颜色的显示标签（优先用色板短标签，其次 tokenMap，最后 hex）
function getDisplayLabel(
  val: string,
  tokenMap: Record<string, string>,
  colorPalette: DevInspectorTokenConfig['colorPalette'],
  tokenLabels: DevInspectorTokenConfig['tokenLabels'],
): { label: string; sub: string; isHardcoded: boolean } {
  const displayVal = formatColorDisplay(val);
  const paletteLabel = getColorLabel(val, colorPalette);
  if (paletteLabel) return { label: paletteLabel, sub: displayVal, isHardcoded: false };
  const token = tokenMap[val];
  if (token) return { label: tokenLabels[token] ?? token.replace('--', ''), sub: displayVal, isHardcoded: false };
  return { label: displayVal, sub: '', isHardcoded: true };
}

// ─── InspectorPanel：可复用的面板组件 ────────────────────────────
export function InspectorPanel({
  targetEl,
  tokenMap,
  onTokenMapUpdate,
  onClose,
}: {
  targetEl: Element;
  tokenMap: Record<string, string>;
  onTokenMapUpdate: (updates: Record<string, string>) => void;
  onClose: () => void;
}) {
  const isSecondary = false;
  const { endpoints, tokens } = useDevInspectorConfig();
  const {
    colorPalette,
    tokenLabels,
    radiusPresets,
    spaceSteps,
    borderWidthSteps,
    fontSizeOptions,
    fontWeightOptions,
    shadowTokens,
    typographyTokens,
  } = tokens;
  const shadowOptions = [
    { cssVar: '', value: 'none', label: '无', usage: '不使用阴影' },
    ...shadowTokens,
  ];
  const [isEditing, setIsEditing]   = useState(false);
  const panelElRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected]     = useState<Element>(targetEl);
  const [panelPos, setPanelPos]     = useState(() => calcPanelPos(targetEl.getBoundingClientRect()));
  const dragRef = useRef<{ sx: number; sy: number; sl: number; st: number } | null>(null);
  const modalOpenRef = useRef(false);
  const [colors, setColors]         = useState<Record<string, string>>({});
  const [radiusVal, setRadiusVal]   = useState('');
  const [paddingVal, setPaddingVal] = useState('0px');
  const [marginVal, setMarginVal]   = useState('0px');
  const [gapVal, setGapVal]         = useState('0px');
  const [translateVal, setTranslateVal] = useState({ x: 0, y: 0 });
  const [widthVal, setWidthVal]     = useState('');
  const [heightVal, setHeightVal]   = useState('');
  const [widthMode, setWidthMode]   = useState<SizeMode>('fixed');
  const [heightMode, setHeightMode] = useState<SizeMode>('hug');
  const [customRadius, setCustomRadius] = useState('');
  const [scope, setScope]           = useState<ScopeMode>('current');
  const [note, setNote]             = useState('');
  const [textContent, setTextContent] = useState<string | null>(null);
  const [pendingColors, setPendingColors] = useState<Record<string, string>>({});
  const [pendingRadius, setPendingRadius] = useState('');
  const [shadowVal, setShadowVal] = useState('none');
  const [shadowAuthoredVal, setShadowAuthoredVal] = useState('');
  const [pendingShadow, setPendingShadow] = useState('');
  const [borderColorVal, setBorderColorVal] = useState('');
  const [borderWidthVal, setBorderWidthVal] = useState('0px');
  const [borderStyleVal, setBorderStyleVal] = useState('none');
  const [pendingBorderColor, setPendingBorderColor] = useState('');
  const [pendingBorderWidth, setPendingBorderWidth] = useState('');
  const [pendingBorderStyle, setPendingBorderStyle] = useState('');
  const [expandedBorderColor, setExpandedBorderColor] = useState(false);
  const [showShadowDrop, setShowShadowDrop] = useState(false);
  const [showStyleDrop, setShowStyleDrop] = useState(false);
  const [showWeightDrop, setShowWeightDrop] = useState(false);
  const [showFontSizeDrop, setShowFontSizeDrop] = useState(false);
  const [showScopeHelp, setShowScopeHelp] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
  const [fontSizeVal, setFontSizeVal]   = useState('');
  const [fontWeightVal, setFontWeightVal] = useState('');
  const [textColorVal, setTextColorVal] = useState('');
  const [fontSizeCustomDraft, setFontSizeCustomDraft] = useState('');
  const [expandedTextColor, setExpandedTextColor] = useState(false);
  const [pendingFontSize, setPendingFontSize]   = useState('');
  const [pendingFontWeight, setPendingFontWeight] = useState('');
  const [pendingTextColor, setPendingTextColor] = useState('');
  const [pendingPadding, setPendingPadding] = useState('');
  const [pendingMargin, setPendingMargin]   = useState('');
  const [pendingGap, setPendingGap]         = useState('');
  const [pendingTranslate, setPendingTranslate] = useState<{ x: number; y: number } | null>(null);
  const [pendingWidth, setPendingWidth] = useState('');
  const [pendingHeight, setPendingHeight] = useState('');
  const [pendingWidthMode, setPendingWidthMode] = useState<SizeMode | null>(null);
  const [pendingHeightMode, setPendingHeightMode] = useState<SizeMode | null>(null);
  const [sizeDraft, setSizeDraft] = useState<Partial<Record<SizeAxis, string>>>({});
  const [newTokenProp, setNewTokenProp]   = useState<string | null>(null);
  const [newTokenName, setNewTokenName]   = useState('');
  const [saveMsg, setSaveMsg]             = useState('');
  const [copyMsg, setCopyMsg]             = useState('');
  const [submitMsg, setSubmitMsg]         = useState('');
  const [styleIntentSummary, setStyleIntentSummary] = useState<StyleIntentSummary>({ pendingCount: 0, latestPending: null, pendingEntries: [] });
  const [hasCopied, setHasCopied]         = useState(() => _copiedStyles.length > 0);
  const [expandedColor, setExpandedColor] = useState<string | null>(null);
  const [pendingNewToken, setPendingNewToken] = useState<{ cssVar: string; value: string; usage: string } | null>(null);
  const [addTokenModal, setAddTokenModal] = useState<{ value: string; cssProp?: string } | null>(null);
  const [customColorVals, setCustomColorVals] = useState<Record<string, string>>({});
  const selectedRef = useRef<Element>(targetEl);
  const gapTargetRef = useRef<HTMLElement | null>(null); // gap 实际作用的元素（可能是父容器）

  useEffect(() => { modalOpenRef.current = addTokenModal !== null; }, [addTokenModal]);

  const formatStyleIntentSummary = useCallback((r: any): StyleIntentSummary => ({
    pendingCount: r.pendingCount ?? 0,
    latestPending: r.latestPending
      ? {
          id: r.latestPending.id,
          targetLabel: r.latestPending.targetLabel,
          selector: r.latestPending.selector,
          createdAt: r.latestPending.createdAt,
          note: r.latestPending.note,
          entries: r.latestPending.entries ?? [],
        }
      : null,
    pendingEntries: Array.isArray(r.pendingEntries)
      ? r.pendingEntries.map((entry: any) => ({
          id: entry.id,
          targetLabel: entry.targetLabel,
          selector: entry.selector,
          createdAt: entry.createdAt,
          note: entry.note,
          entries: entry.entries ?? [],
        }))
      : [],
  }), []);

  const refreshStyleIntentSummary = useCallback(() => {
    fetch(endpoints.styleIntents)
      .then(r => r.json())
      .then(r => {
        if (r.ok) {
          setStyleIntentSummary(formatStyleIntentSummary(r));
        }
      })
      .catch(() => {});
  }, [endpoints.styleIntents, formatStyleIntentSummary]);

  useEffect(() => {
    refreshStyleIntentSummary();
  }, [refreshStyleIntentSummary]);

  // 选中逻辑
  const selectEl = useCallback((el: Element) => {
    selectedRef.current = el;
    const rect = el.getBoundingClientRect();
    setPanelPos(calcPanelPos(rect));

    // 读颜色
    const elCs = getComputedStyle(el);
    const c: Record<string, string> = {};
    for (const { prop } of COLOR_PROPS) {
      const val = getComputedColor(el, prop);
      if (!val || val === 'rgba(0, 0, 0, 0)' || val === 'transparent') continue;
      // 边框色：只在有真实边框时才显示
      if (prop === 'border-color' && elCs.borderWidth.trim() === '0px') continue;
      c[prop] = val;
    }
    setColors(c);
    setPendingColors({});

    // 字体
    setFontSizeVal(elCs.fontSize.trim());
    setFontWeightVal(elCs.fontWeight.trim());
    setTextColorVal(normalizeColor(elCs.color.trim()));
    setFontSizeCustomDraft(elCs.fontSize.trim());
    setPendingFontSize(''); setPendingFontWeight(''); setPendingTextColor('');
    setExpandedTextColor(false);

    // 边框
    const bw = elCs.borderTopWidth.trim();
    const bs = elCs.borderTopStyle.trim();
    const bc = normalizeColor(elCs.borderTopColor.trim());
    setBorderWidthVal(bw);
    setBorderStyleVal(bs);
    setBorderColorVal(bw !== '0px' ? bc : '');
    setPendingBorderColor(''); setPendingBorderWidth(''); setPendingBorderStyle('');
    setExpandedBorderColor(false);

    // 圆角
    const r = getComputedRadius(el);
    setRadiusVal(r);
    setPendingRadius('');

    // 阴影
    const shadowComputed = elCs.boxShadow.trim() || 'none';
    setShadowVal(shadowComputed === 'rgba(0, 0, 0, 0) 0px 0px 0px 0px' ? 'none' : shadowComputed);
    setShadowAuthoredVal(getAuthoredStyleValue(el, 'box-shadow'));
    setPendingShadow('');
    setShowShadowDrop(false);

    // 间距
    const cs = getComputedStyle(el);
    const normPad = (v: string) => {
      const parts = v.trim().split(' ');
      return parts.every(p => p === parts[0]) ? parts[0] : v.trim();
    };
    setPaddingVal(normPad(`${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`));
    setMarginVal(normPad(`${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`));
    const isFlexGrid = (d: string) => d.includes('flex') || d.includes('grid');
    if (isFlexGrid(cs.display)) {
      const g = cs.gap.trim();
      setGapVal(g === 'normal' ? '0px' : g);
      gapTargetRef.current = el as HTMLElement;
    } else if (el.parentElement) {
      const pcs = getComputedStyle(el.parentElement);
      if (isFlexGrid(pcs.display)) {
        const g = pcs.gap.trim();
        setGapVal(g === 'normal' ? '0px' : g);
        gapTargetRef.current = el.parentElement as HTMLElement;
      } else {
        setGapVal('0px');
        gapTargetRef.current = el as HTMLElement;
      }
    }
    setPendingPadding(''); setPendingMargin(''); setPendingGap('');

    setTranslateVal(parseTranslate(cs.translate));
    setWidthVal(cs.width.trim());
    setHeightVal(cs.height.trim());
    setWidthMode(inferSizeMode(el, 'width', cs.width.trim()));
    setHeightMode(inferSizeMode(el, 'height', cs.height.trim()));
    setPendingTranslate(null); setPendingWidth(''); setPendingHeight('');
    setPendingWidthMode(null); setPendingHeightMode(null);
    setSizeDraft({});

    setNote('');
    setTextContent(getTextContent(el));
    setNewTokenProp(null);
    setExpandedColor(null);
    setShowScopeHelp(false);
    setIsEditing(false); // 选中新元素时重置为查看模式
    setSelected(el);
  }, []);

  // targetEl 变化时读取样式（包含初始化）
  useEffect(() => { selectEl(targetEl); }, [targetEl]); // eslint-disable-line

  // 高亮选中
  useEffect(() => {
    document.querySelectorAll('.di-selected').forEach(e => e.classList.remove('di-selected'));
    if (scope !== 'current') {
      getScopeTargets(selected, scope).forEach(e => e.classList.add('di-selected'));
    } else {
      selected.classList.add('di-selected');
    }
    return () => {
      document.querySelectorAll('.di-selected').forEach(e => e.classList.remove('di-selected'));
    };
  }, [selected, scope]);

  // ─── 应用改动到 DOM ───────────────────────────────────────────
  function applyToDOM(changes: { prop: string; val: string }[]) {
    const el = selectedRef.current;
    if (!el) return;
    const targets = getScopeTargets(el, scope);
    changes.forEach(({ prop, val }) => {
      targets.forEach(t => (t as HTMLElement).style.setProperty(prop, val));
    });
  }

  function onDragStart(e: React.MouseEvent) {
    if ((e.target as Element).closest('button, input, textarea')) return;
    e.preventDefault();
    dragRef.current = { sx: e.clientX, sy: e.clientY, sl: panelPos.left, st: panelPos.top };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const left = Math.max(0, Math.min(window.innerWidth - 380, dragRef.current.sl + ev.clientX - dragRef.current.sx));
      const top  = Math.max(0, Math.min(window.innerHeight - 60,  dragRef.current.st + ev.clientY - dragRef.current.sy));
      setPanelPos({ left, top });
    };
    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleAddToken(val: string, cssProp?: string) {
    setAddTokenModal({ value: val, cssProp });
  }

  function handleTokenConfirm(cssVar: string, val: string, usage: string) {
    setPendingNewToken({ cssVar, value: val, usage });
    onTokenMapUpdate({ [val]: cssVar });
    (tokenLabels as Record<string, string>)[cssVar] = cssVar.replace('--color-', '').replace(/-/g, '·');
  }

  function liveApply(prop: string, val: string) {
    if (prop === 'gap' && gapTargetRef.current) {
      gapTargetRef.current.style.setProperty('gap', val);
    } else {
      applyToDOM([{ prop, val }]);
    }
  }

  function liveApplyMany(changes: { prop: string; val: string }[]) {
    applyToDOM(changes);
  }

  function getPendingEntries() {
    const el = selectedRef.current;
    if (!el) return null;
    const fixedMinHeight = pendingHeight && pendingHeightMode === 'fixed'
      ? `${getOneLineHugHeight(el) || Number.parseFloat(pendingHeight) || 0}px`
      : '';

    const pending: [string, string][] = [
      ...Object.entries(pendingColors),
      ...(pendingTextColor ? [['color', pendingTextColor] as [string, string]] : []),
      ...(pendingRadius ? [['border-radius', pendingRadius] as [string, string]] : []),
      ...(pendingShadow ? [['box-shadow', pendingShadow] as [string, string]] : []),
      ...(pendingBorderColor ? [['border-color', pendingBorderColor] as [string, string]] : []),
      ...(pendingBorderWidth ? [['border-width', pendingBorderWidth] as [string, string]] : []),
      ...(pendingBorderStyle ? [['border-style', pendingBorderStyle] as [string, string]] : []),
      ...(pendingFontSize ? [['font-size', pendingFontSize] as [string, string]] : []),
      ...(pendingFontWeight ? [['font-weight', pendingFontWeight] as [string, string]] : []),
      ...(pendingPadding ? [['padding', pendingPadding] as [string, string]] : []),
      ...(pendingMargin ? [['margin', pendingMargin] as [string, string]] : []),
      ...(pendingGap ? [['gap', pendingGap] as [string, string]] : []),
      ...(pendingTranslate ? [['translate', formatTranslate(pendingTranslate)] as [string, string]] : []),
      ...(pendingWidth ? [['width', pendingWidth] as [string, string]] : []),
      ...(pendingHeight ? [['height', pendingHeight] as [string, string]] : []),
      ...(fixedMinHeight ? [['min-height', fixedMinHeight] as [string, string]] : []),
      ...(pendingHeight && pendingHeightMode === 'fixed' ? [['max-height', pendingHeight] as [string, string]] : []),
    ];

    const gapEntry = pending.find(([p]) => p === 'gap');
    const nonGapPending = pending.filter(([p]) => p !== 'gap');
    const selector = getSelectorForScope(el, scope);
    const entries: { selector: string; changes: { prop: string; val: string; from?: string }[]; note?: string }[] = [];

    if (gapEntry && gapTargetRef.current && gapTargetRef.current !== el) {
      entries.push({
        selector: getSelectorForScope(gapTargetRef.current, 'current'),
        changes: [{ prop: 'gap', from: gapVal, val: gapEntry[1] }],
      });
    }

    entries.push({
      selector,
      changes: (gapEntry && gapTargetRef.current !== el ? nonGapPending : pending)
        .map(([prop, val]) => ({ prop, from: getOriginalValueForProp(prop), val })),
      note: note || undefined,
    });

    return {
      el,
      selector,
      pending,
      entries,
    };
  }

  function nudgeSelected(dx: number, dy: number) {
    const base = pendingTranslate ?? translateVal;
    const next = { x: base.x + dx, y: base.y + dy };
    setPendingTranslate(next);
    liveApply('translate', formatTranslate(next));
  }

  function setSize(prop: SizeAxis, val: string, mode: SizeMode = 'fixed') {
    const current = prop === 'width' ? widthVal : heightVal;
    const next = normalizeCssSize(val);
    const selectedEl = selectedRef.current;
    const cssValue = prop === 'height' && mode === 'fixed'
      ? clampHeightToOneLine(next, selectedEl)
      : mode === 'fixed' ? next : sizeValueForMode(mode, current);
    if (prop === 'width') {
      setPendingWidth(cssValue);
      setPendingWidthMode(mode);
    } else {
      setPendingHeight(cssValue);
      setPendingHeightMode(mode);
    }
    if (prop === 'height' && mode === 'fixed') {
      const minHeight = `${getOneLineHugHeight(selectedEl) || Number.parseFloat(cssValue) || 0}px`;
      liveApplyMany([
        { prop: 'height', val: cssValue },
        { prop: 'min-height', val: minHeight },
        { prop: 'max-height', val: cssValue },
      ]);
      return;
    }
    if (prop === 'height') {
      const el = selectedRef.current as HTMLElement | null;
      if (el) {
        const targets = getScopeTargets(el, scope);
        targets.forEach(t => (t as HTMLElement).style.removeProperty('min-height'));
        targets.forEach(t => (t as HTMLElement).style.removeProperty('max-height'));
      }
    }
    liveApply(prop, cssValue);
  }

  // ─── 保存并修改 ───────────────────────────────────────────────
  function handleSave() {
    const payload = getPendingEntries();
    if (!payload) return;
    const { el, pending, entries } = payload;

    if (pending.length === 0 && !note && !newTokenName) {
      setSaveMsg('无改动');
      setTimeout(() => setSaveMsg(''), 1500);
      return;
    }

    applyToDOM(pending.map(([prop, val]) => ({ prop, val })));

    if (!canPersistSelector(el, scope)) {
      setSaveMsg('需选中具体类名');
      setTimeout(() => setSaveMsg(''), 2000);
      return;
    }

    fetch(endpoints.applyCss, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
      .then(r => r.json())
      .then(r => {
        setSaveMsg(r.ok ? '已保存 ✓' : '保存失败');
        setTimeout(() => setSaveMsg(''), 2000);
      })
      .catch(() => { setSaveMsg('保存失败'); setTimeout(() => setSaveMsg(''), 2000); });
  }

  async function copyTextToClipboard(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // 异步请求返回后常常丢失用户激活态，继续尝试 execCommand 兜底
      }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);
    return copied;
  }

  function buildAiTaskPrompt(params: {
    entryId?: string;
    targetLabel: string;
    selector: string;
    scopeLabel: string;
    changes: { prop: string; from: string; val: string }[];
  }) {
    const inboxJson = '/Users/heqiao/Desktop/Claude练习/项目3-快消AI中台/docs/style-inbox.json';
    const inboxMd = '/Users/heqiao/Desktop/Claude练习/项目3-快消AI中台/docs/STYLE_INBOX.md';
    const changes = params.changes
      .map((change, index) => `${index + 1}. ${getChangeLabel(change.prop)}：${change.from} → ${change.val}`)
      .join('\n');
    const latestHint = params.entryId
      ? `优先处理 id = ${params.entryId} 这条记录。`
      : '这条任务文本来自当前选中元素的本轮修改。';
    return [
      '请处理这条 DevInspector 样式任务：',
      '',
      latestHint,
      `如需查看累计记录，读取：${inboxJson}`,
      `必要时对照：${inboxMd}`,
      '',
      `对象：${params.targetLabel}`,
      `作用范围：${params.scopeLabel}`,
      `选择器：${params.selector}`,
      '改动：',
      changes,
      '',
      '请先判断是否适合固化进正式组件样式，再修改代码，并在处理后把这条任务标记为已处理。',
    ].join('\n');
  }

  function handleSubmitToAi() {
    const payload = getPendingEntries();
    if (!payload) return;
    const { el, pending, selector } = payload;
    const changes = getPendingChangeRecords();
    if (pending.length === 0 && !note) {
      setSubmitMsg('先改点样式或写备注');
      setTimeout(() => setSubmitMsg(''), 1800);
      return;
    }

    const scopeLabel = scope === 'current' ? '当前元素' : '同组件';
    const targetClasses = getClasses(el);
    const targetLabel = targetClasses.length
      ? `${el.tagName.toLowerCase()}.${targetClasses.join('.')}`
      : el.tagName.toLowerCase();

    const prompt = buildAiTaskPrompt({
      targetLabel,
      selector,
      scopeLabel,
      changes,
    });
    copyTextToClipboard(prompt)
      .then((copied) => {
        setSubmitMsg(copied ? '任务文本已复制 ✓' : '复制失败');
        setTimeout(() => setSubmitMsg(''), copied ? 2200 : 1800);
      })
      .catch(() => {
        setSubmitMsg('复制失败');
        setTimeout(() => setSubmitMsg(''), 1800);
      });
  }

  function handleDeleteStyleIntent(intentId: string, selector?: string, prop?: string) {
    fetch(endpoints.deleteStyleIntent, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: intentId, selector, prop }),
    })
      .then(async response => {
        let body: any = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }
        return {
          httpOk: response.ok,
          ...(body ?? {}),
        };
      })
      .then(r => {
        if (r.ok) {
          setStyleIntentSummary(formatStyleIntentSummary(r));
          setSubmitMsg(prop ? '已删除属性' : '已删除对象');
        } else {
          const errorMsg = !r.httpOk
            ? '删除失败：本地服务异常'
            : `删除失败${r.error ? `：${String(r.error)}` : ''}`;
          setSubmitMsg(errorMsg);
        }
        setTimeout(() => setSubmitMsg(''), 1800);
      })
      .catch(() => {
        setSubmitMsg('删除失败：请刷新页面或重启本地 dev');
        setTimeout(() => setSubmitMsg(''), 1800);
      });
  }

  function getOriginalValueForProp(prop: string) {
    if (prop === 'font-size') return fontSizeVal;
    if (prop === 'font-weight') return fontWeightVal;
    if (prop === 'color') return getDisplayLabel(textColorVal, tokenMap, colorPalette, tokenLabels).label;
    if (prop === 'background-color') return getDisplayLabel(colors[prop] ?? '', tokenMap, colorPalette, tokenLabels).label;
    if (prop === 'border-color') return getDisplayLabel(borderColorVal, tokenMap, colorPalette, tokenLabels).label;
    if (prop === 'border-width') return borderWidthVal;
    if (prop === 'border-style') return borderStyleVal;
    if (prop === 'border-radius') return radiusVal;
    if (prop === 'box-shadow') return getShadowDisplay(shadowVal, shadowAuthoredVal, shadowTokens).label;
    if (prop === 'padding') return paddingVal;
    if (prop === 'margin') return marginVal;
    if (prop === 'gap') return gapVal;
    if (prop === 'translate') return formatTranslate(translateVal);
    if (prop === 'width') return widthVal;
    if (prop === 'height') return heightVal;
    if (prop === 'min-height') return `${getOneLineHugHeight(selectedRef.current) || Number.parseFloat(heightVal) || 0}px`;
    if (prop === 'max-height') return heightVal;
    return '';
  }

  function getPendingChangeRecords() {
    const records: { prop: string; from: string; val: string }[] = [];
    const add = (prop: string, from: string, val: string) => records.push({ prop, from, val });
    if (pendingFontSize)   add('font-size', fontSizeVal, pendingFontSize);
    if (pendingFontWeight) add('font-weight', fontWeightVal, pendingFontWeight);
    if (pendingTextColor)  add('color', getDisplayLabel(textColorVal, tokenMap, colorPalette, tokenLabels).label, getDisplayLabel(pendingTextColor, tokenMap, colorPalette, tokenLabels).label);
    for (const [prop, val] of Object.entries(pendingColors)) {
      add(prop, getDisplayLabel(colors[prop] ?? '', tokenMap, colorPalette, tokenLabels).label, getDisplayLabel(val, tokenMap, colorPalette, tokenLabels).label);
    }
    if (pendingBorderColor) add('border-color', getDisplayLabel(borderColorVal, tokenMap, colorPalette, tokenLabels).label, getDisplayLabel(pendingBorderColor, tokenMap, colorPalette, tokenLabels).label);
    if (pendingBorderWidth) add('border-width', borderWidthVal, pendingBorderWidth);
    if (pendingBorderStyle) add('border-style', borderStyleVal, pendingBorderStyle);
    if (pendingRadius)      add('border-radius', radiusVal, pendingRadius);
    if (pendingShadow)      add('box-shadow', getShadowDisplay(shadowVal, shadowAuthoredVal, shadowTokens).label, getShadowDisplay(pendingShadow, pendingShadow, shadowTokens).label);
    if (pendingPadding)     add('padding', paddingVal, pendingPadding);
    if (pendingMargin)      add('margin', marginVal, pendingMargin);
    if (pendingGap)         add('gap', gapVal, pendingGap);
    if (pendingTranslate)   add('translate', formatTranslate(translateVal), formatTranslate(pendingTranslate));
    if (pendingWidth)       add('width', widthVal, pendingWidth);
    if (pendingHeight)      add('height', heightVal, pendingHeight);
    if (pendingNewToken)    add('token', '新增', `${pendingNewToken.cssVar}: ${pendingNewToken.value}`);
    return records;
  }

  function getChangeLabel(prop: string) {
    const map: Record<string, string> = {
      'font-size': '字号',
      'font-weight': '字重',
      'color': '文字色',
      'background-color': '背景色',
      'border-color': '边框色',
      'border-width': '边框粗细',
      'border-style': '边框样式',
      'border-radius': '圆角',
      'box-shadow': '阴影',
      'padding': '内边距',
      'margin': '外边距',
      'gap': '元素间距',
      'translate': '位置',
      'width': '宽度',
      'height': '高度',
      'min-height': '最小高度',
      'max-height': '最大高度',
    };
    return map[prop] || prop;
  }

  // ─── 取消 ────────────────────────────────────────────────────
  function handleReset() {
    const el = selectedRef.current;
    if (!el) return;
    // 还原所有 inline style 改动
    const targets = getScopeTargets(el, scope);
    targets.forEach(t => {
      const hEl = t as HTMLElement;
      [...Object.keys(pendingColors)].forEach(p => hEl.style.removeProperty(p));
      if (pendingRadius)      hEl.style.removeProperty('border-radius');
      if (pendingShadow)      hEl.style.removeProperty('box-shadow');
      if (pendingBorderColor) hEl.style.removeProperty('border-color');
      if (pendingBorderWidth) hEl.style.removeProperty('border-width');
      if (pendingBorderStyle) hEl.style.removeProperty('border-style');
      if (pendingPadding) hEl.style.removeProperty('padding');
      if (pendingMargin)  hEl.style.removeProperty('margin');
      if (pendingGap)     hEl.style.removeProperty('gap');
      if (pendingTranslate) hEl.style.removeProperty('translate');
      if (pendingWidth) hEl.style.removeProperty('width');
      if (pendingHeight) hEl.style.removeProperty('height');
      if (pendingHeight) hEl.style.removeProperty('min-height');
      if (pendingHeight) hEl.style.removeProperty('max-height');
    });
    setPendingColors({});
    setPendingRadius('');
    setPendingShadow('');
    setPendingFontSize(''); setPendingFontWeight(''); setPendingTextColor('');
    setPendingBorderColor(''); setPendingBorderWidth(''); setPendingBorderStyle('');
    setPendingPadding(''); setPendingMargin(''); setPendingGap('');
    setPendingTranslate(null); setPendingWidth(''); setPendingHeight('');
    setPendingWidthMode(null); setPendingHeightMode(null);
    setSizeDraft({});
    setCustomColorVals({});
    // 重新读取当前计算值
    setColors(Object.fromEntries(
      COLOR_PROPS.map(({ prop }) => [prop, getComputedColor(el, prop)])
        .filter(([, v]) => v && v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent')
    ));
    const cs = getComputedStyle(el);
    setRadiusVal(getComputedRadius(el));
    setShadowVal(cs.boxShadow.trim() === 'rgba(0, 0, 0, 0) 0px 0px 0px 0px' ? 'none' : cs.boxShadow.trim());
    setShadowAuthoredVal(getAuthoredStyleValue(el, 'box-shadow'));
    const normSpace = (v: string) => {
      const parts = v.trim().split(' ');
      return parts.every(p => p === parts[0]) ? parts[0] : v.trim();
    };
    setPaddingVal(normSpace(`${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`));
    setMarginVal(normSpace(`${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`));
    const g = cs.gap.trim();
    setGapVal(g === 'normal' ? '0px' : g);
    setTranslateVal(parseTranslate(cs.translate));
    setWidthVal(cs.width.trim());
    setHeightVal(cs.height.trim());
    setWidthMode(inferSizeMode(el, 'width', cs.width.trim()));
    setHeightMode(inferSizeMode(el, 'height', cs.height.trim()));
  }

  function handleClose() {
    onClose();
  }

  // ─── Render ──────────────────────────────────────────────────
  return (
    <>
      {/* 添加 token 弹出框 */}
      {addTokenModal && (
        <AddTokenModal
          value={addTokenModal.value}
          cssProp={addTokenModal.cssProp}
          elementClasses={getClasses(selected)}
          colorPalette={colorPalette}
          onClose={() => setAddTokenModal(null)}
          onConfirm={handleTokenConfirm}
        />
      )}

      {(
        <div
          ref={panelElRef}
          className="di-panel"
          data-di-panel-role="primary"
          style={{ top: panelPos.top, left: panelPos.left }}
        >

          {/* 顶部 */}
          <div className="di-head" onMouseDown={onDragStart}>
            <div className="di-head-left">
              <span className="di-title">页面样式</span>
              <span className="di-badge-dev">Dev Only</span>
              <button
                className="di-layer-btn"
                title="选中父层"
                disabled={!selected.parentElement || selected.parentElement === document.body}
                onClick={() => { if (selected.parentElement && selected.parentElement !== document.body) selectEl(selected.parentElement); }}
              >↑</button>
              <button
                className="di-layer-btn"
                title="选中第一个子层"
                disabled={!selected.firstElementChild}
                onClick={() => { if (selected.firstElementChild) selectEl(selected.firstElementChild); }}
              >↓</button>
            </div>
            <div className="di-head-right">
              <button className="di-close" onClick={handleClose}>×</button>
            </div>
          </div>

          <div className="di-body">

            {/* 作用范围 */}
            <div className="di-section">
              <div className="di-section-title-row">
                <div className="di-section-title">作用范围</div>
                <button
                  type="button"
                  className={`di-help-icon${showScopeHelp ? ' di-help-icon--on' : ''}`}
                  aria-label="查看作用范围说明"
                  aria-expanded={showScopeHelp}
                  onClick={() => setShowScopeHelp(v => !v)}
                >
                  <CircleHelp size={14} strokeWidth={1.8} />
                </button>
              </div>
              {showScopeHelp && (
                <div className="di-help-popover">
                  同组件 = 忽略激活 / 当前 / 展开等状态类后，共享同一业务类名的元素。
                </div>
              )}
              <div className="di-scope-row">
                <button className={`di-scope-btn${scope === 'current' ? ' di-scope-btn--on' : ''}`} onClick={() => setScope('current')}>当前元素</button>
                <button className={`di-scope-btn${scope === 'component' ? ' di-scope-btn--on' : ''}`} onClick={() => setScope('component')}>
                  同组件 {selected && <span className="di-scope-count">{getSameComponentEls(selected).length}</span>}
                </button>
              </div>
            </div>

            {/* 文字区（内容+字号+字重+颜色） */}
            <div className="di-section">
              <div className="di-section-title">文字</div>
              {/* 文字内容 */}
              {textContent !== null && (
                <textarea className="di-note di-note--sm" defaultValue={textContent}
                  ref={(el) => { if (el) resizeTextareaToContent(el); }}
                  placeholder="修改文字内容..."
                  onChange={e => {
                    resizeTextareaToContent(e.currentTarget);
                    const el = selectedRef.current;
                    if (!el) return;
                    const ts = getScopeTargets(el, scope);
                    ts.forEach(t => { t.textContent = e.currentTarget.value; });
                  }}
                />
              )}
              {/* 字号 + 字重 + 颜色 三列卡片 */}
              <div className="di-border-row">
                {/* 字号 */}
                <div className="di-border-card">
                  <div className="di-border-card-title">字号</div>
                  {(() => {
                    const curSize = pendingFontSize || fontSizeVal || '—';
                    const curWeight = pendingFontWeight || fontWeightVal;
                    const curColor = pendingTextColor || textColorVal;
                    const matchedToken = getTypographyToken(curSize, curWeight, curColor, typographyTokens);
                    const curOpt = matchedToken
                      ? fontSizeOptions.find(opt => opt.key === matchedToken.key)
                      : null;
                    return (
                      <>
                        <div
                          className="di-border-style-single di-font-token-trigger"
                          role="button"
                          tabIndex={0}
                          onClick={e => { const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setDropPos(calcDropPos(r)); setShowWeightDrop(false); setShowStyleDrop(false); setExpandedTextColor(false); setExpandedBorderColor(false); setShowShadowDrop(false); setCustomRadius(''); setSizeDraft({}); setFontSizeCustomDraft(curSize); setShowFontSizeDrop(v=>!v); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                              setDropPos(calcDropPos(r));
                              setFontSizeCustomDraft(curSize);
                              setShowFontSizeDrop(v=>!v);
                            }
                          }}
                        >
                          {curOpt && <span className="di-border-style-label">{curOpt.label}</span>}
                          <span className={`di-border-style-name${curOpt ? '' : ' di-border-style-name--custom'}`}>{curSize}</span>
                          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{marginLeft:'auto',flexShrink:0}}><path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </div>
                        {showFontSizeDrop && (
                          <>
                            <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={()=>setShowFontSizeDrop(false)} />
                            <div className="di-border-style-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                              {fontSizeOptions.map(opt => (
                                <button key={opt.key}
                                  className={`di-border-style-drop-item${curOpt?.key===opt.key?' di-border-style-drop-item--on':''}`}
                                  onClick={() => {
                                    setPendingFontSize(opt.value);
                                    setPendingFontWeight(opt.fontWeight);
                                    setPendingTextColor(opt.color);
                                    liveApplyMany([
                                      { prop: 'font-size', val: opt.value },
                                      { prop: 'font-weight', val: opt.fontWeight },
                                      { prop: 'color', val: opt.color },
                                    ]);
                                    setShowFontSizeDrop(false);
                                  }}>
                                  <span className="di-border-style-label">{opt.label}</span>
                                  <span className="di-border-style-name">{`${opt.value} / ${opt.fontWeight}`}</span>
                                </button>
                              ))}
                              <div className="di-dropdown-custom">
                                <span className="di-dropdown-custom-label">自定义</span>
                                <input
                                  className="di-dropdown-custom-input"
                                  value={fontSizeCustomDraft}
                                  placeholder="13px"
                                  onChange={(e) => setFontSizeCustomDraft(e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                  type="button"
                                  className="di-dropdown-custom-apply"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!fontSizeCustomDraft.trim()) return;
                                    setPendingFontSize(fontSizeCustomDraft.trim());
                                    liveApply('font-size', fontSizeCustomDraft.trim());
                                    setShowFontSizeDrop(false);
                                  }}
                                >
                                  应用
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* 字重：单值 + 下拉 */}
                <div className="di-border-card" style={{ position: 'relative' }}>
                  <div className="di-border-card-title">字重</div>
                  {(() => {
                    const cur = pendingFontWeight || fontWeightVal;
                    const curOpt = fontWeightOptions.find(o => o.value === cur) ?? fontWeightOptions[1];
                    return (
                      <>
                        <button className="di-border-style-single" style={{ marginTop: 4 }}
                          onClick={e => { const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setDropPos(calcDropPos(r)); setShowWeightDrop(v=>!v); }}>
                          <span className="di-border-style-label" style={curOpt.value === 'none' ? { color: '#9ca3af' } : undefined}>{curOpt.label}</span>
                          <span className="di-border-style-name">{cur}</span>
                          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{marginLeft:'auto',flexShrink:0}}><path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                        {showWeightDrop && (
                          <>
                            <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={()=>setShowWeightDrop(false)} />
                            <div className="di-border-style-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                              {fontWeightOptions.map(opt => (
                                <button key={opt.value}
                                  className={`di-border-style-drop-item${cur===opt.value?' di-border-style-drop-item--on':''}`}
                                  onClick={() => { setPendingFontWeight(opt.value); liveApply('font-weight',opt.value); setShowWeightDrop(false); }}>
                                  <span className="di-border-style-label" style={opt.value === 'none' ? { color: '#9ca3af' } : undefined}>{opt.label}</span>
                                  <span className="di-border-style-name">{opt.value}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* 颜色：卡片式 */}
                {(() => {
                  const tcVal = pendingTextColor || textColorVal;
                  const { label: tcLabel, sub: tcSub, isHardcoded: tcHard } = getDisplayLabel(tcVal, tokenMap, colorPalette, tokenLabels);
                  const tcDark = (() => { const m=tcVal.match(/^#([0-9a-f]{6})$/i); if(!m) return true; const r=parseInt(m[1].slice(0,2),16),g=parseInt(m[1].slice(2,4),16),b=parseInt(m[1].slice(4,6),16); return (r*299+g*587+b*114)/1000<128; })();
                  return (
                    <div className="di-border-card" style={{ position: 'relative' }}>
                      <div className="di-border-card-title">颜色</div>
                      <div className="di-border-color-body" style={{ marginTop: 4 }}>
                        <button className={`di-swatch-btn${tcDark?' di-swatch-btn--dark':''}`}
                          style={{ background: tcVal||'#1d293d' }}
                          onClick={e => { const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setDropPos(calcDropPos(r)); setExpandedTextColor(v=>!v); }}>
                          <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke={tcDark?'#fff':'#374151'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <div className="di-border-color-info">
                          <span className={tcHard?'di-token-name--plain':'di-token-name'}>{tcLabel}</span>
                          {tcSub && <span className="di-hex">{tcSub}</span>}
                        </div>
                      </div>
                      {expandedTextColor && (
                        <ColorDropdown value={tcVal} pos={dropPos} colorPalette={colorPalette}
                          onChange={c=>{ setPendingTextColor(c); liveApply('color',c); }}
                          onClose={()=>setExpandedTextColor(false)}
                          onAddToken={v=>handleAddToken(v,'color')}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* 颜色区 */}
            {Object.keys(colors).length > 0 && (
              <div className="di-section">
                <div className="di-section-title">颜色</div>
                {COLOR_PROPS.filter(({ prop }) => colors[prop]).map(({ label, prop }) => {
                  const val = pendingColors[prop] ?? colors[prop];
                  const token = tokenMap[val];
                  const isDark = (() => {
                    const m = val.match(/^#([0-9a-f]{6})$/i);
                    if (!m) return false;
                    const r = parseInt(m[1].slice(0,2),16), g = parseInt(m[1].slice(2,4),16), b = parseInt(m[1].slice(4,6),16);
                    return (r*299 + g*587 + b*114) / 1000 < 128;
                  })();
                  const isExpanded = expandedColor === prop;
                  // 所有颜色 token 列表（从 tokenMap 反转）
                  const tokenList = Object.entries(tokenMap)
                    .filter(([v]) => v.startsWith('#') && v !== val)
                    .map(([v, t]) => ({ val: v, token: t }));
                  const { label: dispLabel, sub: dispSub, isHardcoded: dispHard } = getDisplayLabel(val, tokenMap, colorPalette, tokenLabels);
                  return (
                    <div key={prop} className="di-color-row">
                      <span className="di-attr-label">{label}</span>
                      <button
                        className={`di-swatch-btn${isDark ? ' di-swatch-btn--dark' : ''}`}
                        style={{ background: val }}
                        onClick={e => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setDropPos(calcDropPos(r)); setExpandedColor(isExpanded ? null : prop); }}
                      >
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                          <path d="M1 1l4 4 4-4" stroke={isDark ? '#fff' : '#374151'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <div className="di-color-info">
                        <span className={dispHard ? 'di-token-name--plain' : 'di-token-name'}>{dispLabel}</span>
                        {dispSub && <span className="di-hex">{dispSub}</span>}
                      </div>
                      {isExpanded && (
                        <ColorDropdown value={val} pos={dropPos} colorPalette={colorPalette}
                          onChange={(c, _tk) => { setPendingColors(prev => ({ ...prev, [prop]: c })); liveApply(prop, c); }}
                          onClose={() => setExpandedColor(null)}
                          onAddToken={v=>handleAddToken(v, prop)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 布局区 */}
            <div className="di-section">
              <div className="di-section-title">布局</div>
              <div className="di-layout-grid">
                <div className="di-layout-card">
                  <div className="di-layout-card-title">位置</div>
                  <div className="di-nudge-pad" aria-label="移动元素">
                    <button className="di-nudge-btn di-nudge-btn--up" onClick={() => nudgeSelected(0, -1)} title="上移 1px">↑</button>
                    <button className="di-nudge-btn di-nudge-btn--left" onClick={() => nudgeSelected(-1, 0)} title="左移 1px">←</button>
                    <div className="di-nudge-readout">
                      <span>X {Math.round((pendingTranslate ?? translateVal).x)}</span>
                      <span>Y {Math.round((pendingTranslate ?? translateVal).y)}</span>
                    </div>
                    <button className="di-nudge-btn di-nudge-btn--right" onClick={() => nudgeSelected(1, 0)} title="右移 1px">→</button>
                    <button className="di-nudge-btn di-nudge-btn--down" onClick={() => nudgeSelected(0, 1)} title="下移 1px">↓</button>
                  </div>
                </div>

                <div className="di-layout-card di-layout-card--size">
                  <div className="di-layout-card-title">尺寸</div>
                  {([
                    { key: 'width', label: 'W', current: widthVal, pending: pendingWidth, mode: widthMode, pendingMode: pendingWidthMode },
                    { key: 'height', label: 'H', current: heightVal, pending: pendingHeight, mode: heightMode, pendingMode: pendingHeightMode },
                  ] as const).map(item => {
                    const cur = displaySizeValue(item.pending, item.current);
                    const inputVal = sizeDraft[item.key] ?? cur;
                    const activeMode = item.pendingMode ?? item.mode;
                    return (
                      <div className="di-size-row" key={item.key}>
                        <span className="di-size-axis">{item.label}</span>
                        <input
                          className="di-size-value"
                          value={inputVal}
                          aria-label={`${item.label} 自定义尺寸`}
                          onChange={e => {
                            setSizeDraft(prev => ({ ...prev, [item.key]: e.target.value }));
                            setSize(item.key, e.target.value, 'fixed');
                          }}
                          onFocus={e => {
                            setSizeDraft(prev => ({ ...prev, [item.key]: cur }));
                            e.currentTarget.select();
                          }}
                          onClick={e => e.currentTarget.select()}
                          onMouseUp={e => e.preventDefault()}
                          onBlur={() => setSizeDraft(prev => {
                            const next = { ...prev };
                            delete next[item.key];
                            return next;
                          })}
                          onKeyDown={e => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                        <select
                          className="di-size-mode-select"
                          value={activeMode}
                          onChange={e => {
                            const mode = e.target.value as SizeMode;
                            setSize(item.key, item.current, mode);
                          }}
                        >
                          {SIZE_OPTIONS.map(opt => (
                            <option key={opt.mode} value={opt.mode}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 阴影区 */}
            <div className="di-section">
              <div className="di-section-title">阴影</div>
              <div className="di-shadow-grid">
                {(() => {
                  const activeShadow = pendingShadow || shadowVal;
                  const shadowDisplay = getShadowDisplay(activeShadow, shadowAuthoredVal, shadowTokens);
                  const matchedOption = shadowOptions.find(option => canonicalizeShadowValue(option.value) === canonicalizeShadowValue(activeShadow)) ?? null;
                  const activeOption = matchedOption ?? shadowOptions[0];
                  return (
                    <>
                      <div className="di-shadow-card" style={{ position: 'relative' }}>
                        <div className="di-shadow-card-title">Token</div>
                        <button
                          className="di-border-style-single"
                          onClick={e => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setDropPos(calcDropPos(r));
                            setShowShadowDrop(v => !v);
                          }}
                        >
                          <span className="di-border-style-label" style={activeOption.cssVar ? undefined : { color: '#9ca3af' }}>{activeOption.label}</span>
                          <span className="di-border-style-name">{activeOption.cssVar || 'none'}</span>
                          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{marginLeft:'auto',flexShrink:0}}><path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                        {showShadowDrop && (
                          <>
                            <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={() => setShowShadowDrop(false)} />
                            <div className="di-border-style-drop di-shadow-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                              {shadowOptions.map(option => {
                                const isOn = canonicalizeShadowValue(option.value) === canonicalizeShadowValue(activeShadow);
                                return (
                                  <button
                                    key={option.cssVar || option.label}
                                    className={`di-border-style-drop-item${isOn ? ' di-border-style-drop-item--on' : ''}`}
                                    onClick={() => {
                                      setPendingShadow(option.value);
                                      liveApply('box-shadow', option.value);
                                      setShowShadowDrop(false);
                                    }}
                                  >
                                    <span className="di-border-style-label" style={option.cssVar ? undefined : { color: '#9ca3af' }}>{option.label}</span>
                                    <span className="di-shadow-drop-meta">
                                      <span className="di-border-style-name">{option.cssVar || option.usage}</span>
                                      {option.cssVar && <span className="di-shadow-drop-value">{option.value}</span>}
                                    </span>
                                  </button>
                                );
                              })}
                              <button
                                className={`di-border-style-drop-item${matchedOption ? '' : ' di-border-style-drop-item--on'}`}
                                onClick={() => {
                                  const next = prompt('自定义阴影（如 0 12px 30px rgba(15,23,42,0.08)）', activeShadow === 'none' ? '' : activeShadow);
                                  if (next === null) return;
                                  const value = next.trim() || 'none';
                                  setPendingShadow(value);
                                  liveApply('box-shadow', value);
                                  setShowShadowDrop(false);
                                }}
                              >
                                <span className="di-border-style-label">自定义</span>
                                <span className="di-shadow-drop-meta">
                                  <span className="di-border-style-name">{shadowDisplay.label}</span>
                                  <span className="di-shadow-drop-value">{formatShadowDisplay(activeShadow)}</span>
                                </span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="di-shadow-card">
                        <div className="di-shadow-card-title">预览</div>
                        <div className="di-shadow-preview-row">
                          <div className="di-shadow-preview-chip" style={{ boxShadow: activeShadow === 'none' ? 'none' : activeShadow }} />
                          <div className="di-shadow-preview-copy">
                            <span className={shadowDisplay.isHardcoded ? 'di-token-name--plain' : 'di-token-name'}>{shadowDisplay.label}</span>
                            <span className="di-hex di-hex--wrap">{shadowDisplay.sub}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* 边框区 */}
            <div className="di-section">
              <div className="di-section-title">边框</div>
              <div className="di-border-row">

                {/* 边框颜色 */}
                {(() => {
                  const bcVal = pendingBorderColor || borderColorVal;
                  const { label: bcLabel, sub: bcSub, isHardcoded: bcHard } = getDisplayLabel(bcVal || '', tokenMap, colorPalette, tokenLabels);
                  const bcDark = (() => { const m = bcVal?.match(/^#([0-9a-f]{6})$/i); if (!m) return false; const r=parseInt(m[1].slice(0,2),16),g=parseInt(m[1].slice(2,4),16),b=parseInt(m[1].slice(4,6),16); return (r*299+g*587+b*114)/1000 < 128; })();
                  return (
                    <div className="di-border-card">
                      <div className="di-border-card-title">颜色</div>
                      <div className="di-border-color-body">
                        <button
                          className={`di-swatch-btn${bcDark ? ' di-swatch-btn--dark' : ''}${!bcVal ? ' di-swatch-btn--empty' : ''}`}
                          style={{ background: bcVal || undefined }}
                          onClick={e => { const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setDropPos(calcDropPos(r)); setExpandedBorderColor(v=>!v); }}
                        >
                          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
                            <path d="M1 1l4 4 4-4" stroke={!bcVal ? '#9ca3af' : bcDark ? '#fff' : '#374151'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <div className="di-border-color-info">
                          <span className={bcHard ? 'di-token-name--plain' : 'di-token-name'}>{bcVal ? bcLabel : '未设置'}</span>
                          {bcSub && <span className="di-hex">{bcSub}</span>}
                        </div>
                      </div>
                      {expandedBorderColor && (
                        <ColorDropdown value={bcVal || ''} pos={dropPos} colorPalette={colorPalette}
                          onChange={c => {
                            setPendingBorderColor(c); liveApply('border-color', c);
                            if ((pendingBorderWidth || borderWidthVal) === '0px') { liveApply('border-width', '1px'); liveApply('border-style', 'solid'); setPendingBorderWidth('1px'); setPendingBorderStyle('solid'); }
                          }}
                          onClose={() => setExpandedBorderColor(false)}
                          onAddToken={v=>handleAddToken(v,'border-color')}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* 粗细：合并到颜色卡片下方（已在上面的卡片里），单独卡片 */}
                <div className="di-border-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="di-border-card-title">粗细</div>
                  {(() => {
                    const cur = pendingBorderWidth || borderWidthVal || '0px';
                    const idx = borderWidthSteps.indexOf(cur);
                    return (
                      <div className="di-spinner">
                        <span className="di-spinner-val">{cur}</span>
                        <div className="di-spinner-btns">
                          <button className="di-spinner-up" disabled={idx <= 0}
                            onClick={() => { const nv=borderWidthSteps[Math.max(0,idx-1)]; setPendingBorderWidth(nv); liveApply('border-width',nv); }}>
                            <svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
                          </button>
                          <button className="di-spinner-dn" disabled={idx >= borderWidthSteps.length - 1}
                            onClick={() => { const nv=borderWidthSteps[Math.min(borderWidthSteps.length-1,idx<0?1:idx+1)]; setPendingBorderWidth(nv); liveApply('border-width',nv); }}>
                            <svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 样式：单值展示 + 下拉 */}
                <div className="di-border-card" style={{ position: 'relative' }}>
                  <div className="di-border-card-title">样式</div>
                  {(() => {
                    const cur = pendingBorderStyle || borderStyleVal;
                    const curOpt = BORDER_STYLE_OPTIONS.find(o => o.value === cur) ?? BORDER_STYLE_OPTIONS[0];
                    return (
                      <>
                        <button className="di-border-style-single"
                          onClick={e => { const r=(e.currentTarget as HTMLElement).getBoundingClientRect(); setDropPos(calcDropPos(r)); setShowStyleDrop(v=>!v); }}>
                          <span className="di-border-style-label" style={curOpt.value === 'none' ? { color: '#9ca3af' } : undefined}>{curOpt.label}</span>
                          <span className="di-border-style-name">{curOpt.title}</span>
                          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{marginLeft:'auto',flexShrink:0}}><path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                        {showStyleDrop && (
                          <>
                            <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={() => setShowStyleDrop(false)} />
                            <div className="di-border-style-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                              {BORDER_STYLE_OPTIONS.map(opt => (
                                <button key={opt.value}
                                  className={`di-border-style-drop-item${cur===opt.value?' di-border-style-drop-item--on':''}`}
                                  onClick={() => { setPendingBorderStyle(opt.value); liveApply('border-style',opt.value); setShowStyleDrop(false); }}>
                                  <span className="di-border-style-label" style={opt.value === 'none' ? { color: '#9ca3af' } : undefined}>{opt.label}</span>
                                  <span className="di-border-style-name">{opt.title}</span>
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>

              </div>
            </div>

            {/* 圆角区 */}
            <div className="di-section">
              <div className="di-section-title">圆角</div>
              <div className="di-preset-row">
                {radiusPresets.map(opt => {
                  const current = pendingRadius || radiusVal;
                  const isOn = matchPreset(radiusPresets, current)?.value === opt.value;
                  return (
                    <button
                      key={opt.label}
                      className={`di-preset${isOn ? ' di-preset--on' : ''}`}
                      onClick={() => { setPendingRadius(opt.value); setCustomRadius(''); liveApply('border-radius', opt.value); }}
                    >
                      <span className="di-preset-label">{opt.label}</span>
                      {opt.sub && <span className="di-preset-sub">{opt.sub}</span>}
                    </button>
                  );
                })}
                {(() => {
                  const cur = pendingRadius || radiusVal;
                  const isCustom = !!cur && cur !== '0px' && !matchPreset(radiusPresets, cur);
                  return (
                    <button
                      className={`di-preset${isCustom ? ' di-preset--on' : ''}`}
                      onClick={() => { const v = prompt('自定义圆角（如 12px）', cur || ''); if (v) { setPendingRadius(v); setCustomRadius(v); liveApply('border-radius', v); } }}
                    >
                      <span className="di-preset-label">自定义</span>
                      {isCustom && <span className="di-preset-sub">{cur}</span>}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* 间距区 */}
            <div className="di-section">
              <div className="di-section-title">间距</div>
              <div className="di-space-row">
                <SpaceCard
                  title="内边距" variant="padding"
                  value={pendingPadding || paddingVal}
                  spaceSteps={spaceSteps}
                  onChange={v => { setPendingPadding(v); liveApply('padding', v); }}
                />
                <SpaceCard
                  title="外边距" variant="margin"
                  value={pendingMargin || marginVal}
                  spaceSteps={spaceSteps}
                  onChange={v => { setPendingMargin(v); liveApply('margin', v); }}
                />
                <SpaceCard
                  title="元素间距" variant="gap"
                  value={pendingGap || gapVal}
                  spaceSteps={spaceSteps}
                  onChange={v => { setPendingGap(v); liveApply('gap', v); }}
                />
              </div>
            </div>

            <div className="di-section">
              <div className="di-section-title">本次修改内容</div>
              <div className="di-inbox-summary">
                <div className="di-inbox-pill">已记录 {styleIntentSummary.pendingCount}</div>
                {(() => {
                  const currentChanges = getPendingChangeRecords();
                  if (currentChanges.length === 0) return null;
                  const el = selectedRef.current;
                  const targetClasses = el ? getClasses(el) : [];
                  const targetLabel = el
                    ? targetClasses.length
                      ? `${el.tagName.toLowerCase()}.${targetClasses.join('.')}`
                      : el.tagName.toLowerCase()
                    : '当前对象';
                  return (
                    <div className="di-inbox-list">
                      <div className="di-inbox-card di-inbox-card--draft">
                        <div className="di-inbox-card-head">
                          <div className="di-inbox-target">{targetLabel}</div>
                        </div>
                        <ol className="di-inbox-change-list">
                          {currentChanges.map((change, idx) => (
                            <li className="di-inbox-change-item" key={`current-${change.prop}-${idx}`}>
                              <span className="di-inbox-change-text">
                                {idx + 1}. {getChangeLabel(change.prop)}：{change.from} → {change.val}
                              </span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  );
                })()}
                {styleIntentSummary.pendingEntries.length > 0 ? (
                  <div className="di-inbox-list">
                    {styleIntentSummary.pendingEntries.map((entry) => (
                      <div className="di-inbox-card" key={entry.id}>
                        <div className="di-inbox-card-head">
                          <div className="di-inbox-target">{entry.targetLabel || entry.selector || '未命名对象'}</div>
                          <button className="di-inbox-delete" onClick={() => handleDeleteStyleIntent(entry.id)}>删除对象</button>
                        </div>
                        {entry.note ? <div className="di-inbox-note">{entry.note}</div> : null}
                        <ol className="di-inbox-change-list">
                          {entry.entries.flatMap((group) => group.changes.map((change) => ({ selector: group.selector, ...change }))).map((change, idx) => (
                            <li className="di-inbox-change-item" key={`${entry.id}-${change.selector}-${change.prop}-${idx}`}>
                              <span className="di-inbox-change-text">
                                {idx + 1}. {getChangeLabel(change.prop)}：{change.from ? `${change.from} → ` : ''}{change.val}
                              </span>
                              <button
                                className="di-inbox-delete di-inbox-delete--mini"
                                onClick={() => handleDeleteStyleIntent(entry.id, change.selector, change.prop)}
                              >
                                删除
                              </button>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="di-empty">还没有记录的修改</div>
                )}
              </div>
            </div>

          </div>

          {/* 底部操作 */}
          {(() => {
            const hasPending = Object.keys(pendingColors).length > 0 ||
              !!pendingTextColor || !!pendingRadius || !!pendingShadow ||
              !!pendingBorderColor || !!pendingBorderWidth || !!pendingBorderStyle ||
              !!pendingFontSize || !!pendingFontWeight || !!pendingPadding ||
              !!pendingMargin || !!pendingGap || !!pendingTranslate ||
              !!pendingWidth || !!pendingHeight || !!note;
            return (
          <div className="di-foot">
            <button className="di-btn-cancel" onClick={handleReset}>重置</button>
            <button className="di-btn-cancel" onClick={() => {
              const el = selectedRef.current;
              if (!el) return;
              // 合并实际值 + pending 改动，pending 优先
              const effectiveColors = { ...colors, ...pendingColors };
              const pending: [string, string][] = [
                ...Object.entries(effectiveColors).filter(([, v]) => v && v !== 'transparent'),
                [(pendingTextColor || textColorVal) ? 'color' : '', pendingTextColor || textColorVal],
                [(pendingRadius || radiusVal) ? 'border-radius' : '', pendingRadius || radiusVal],
                [(pendingShadow || (shadowVal !== 'none' ? shadowVal : '')) ? 'box-shadow' : '', pendingShadow || (shadowVal !== 'none' ? shadowVal : '')],
                [(pendingBorderColor || borderColorVal) ? 'border-color' : '', pendingBorderColor || borderColorVal],
                [(pendingBorderWidth || (borderWidthVal !== '0px' ? borderWidthVal : '')) ? 'border-width' : '', pendingBorderWidth || borderWidthVal],
                [(pendingBorderStyle || (borderStyleVal !== 'none' ? borderStyleVal : '')) ? 'border-style' : '', pendingBorderStyle || borderStyleVal],
                [(pendingFontSize || fontSizeVal) ? 'font-size' : '', pendingFontSize || fontSizeVal],
                [(pendingFontWeight || fontWeightVal) ? 'font-weight' : '', pendingFontWeight || fontWeightVal],
                [(pendingPadding || (paddingVal !== '0px' ? paddingVal : '')) ? 'padding' : '', pendingPadding || paddingVal],
                [(pendingMargin || (marginVal !== '0px' ? marginVal : '')) ? 'margin' : '', pendingMargin || marginVal],
                [(pendingGap || (gapVal !== '0px' ? gapVal : '')) ? 'gap' : '', pendingGap || gapVal],
                [(pendingWidth || widthVal) ? 'width' : '', pendingWidth || widthVal],
                [(pendingHeight || heightVal) ? 'height' : '', pendingHeight || heightVal],
              ].filter(([k, v]) => k && v) as [string, string][];
              const selector = getSelectorForScope(el, scope);
              const css = pending.length > 0
                ? `${selector} {\n${pending.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`
                : `/* ${selector} — 暂无改动 */`;
              const ta = document.createElement('textarea');
              ta.value = css;
              ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              _copiedStyles = pending.map(([p, v]) => ({ prop: p, val: v }));
              setHasCopied(true);
              setCopyMsg('已复制 ✓');
              setTimeout(() => setCopyMsg(''), 1500);
            }}>{copyMsg || '复制样式'}</button>
            <button
              className="di-btn-save"
              onClick={handleSubmitToAi}
              disabled={!hasPending}
              style={!hasPending ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
              title="复制一段可直接发给 AI 的任务文本"
            >{submitMsg || '发送给AI'}</button>
          </div>
            );
          })()}
          {hasCopied && (
            <div className="di-paste-bar">
              <button className="di-btn-paste" onClick={() => {
                _copiedStyles.forEach(({ prop, val }) => {
                  if (prop === 'background-color' || prop === 'background')
                    setPendingColors(prev => ({ ...prev, [prop]: val }));
                  else if (prop === 'color')         setPendingTextColor(val);
                  else if (prop === 'border-radius') setPendingRadius(val);
                  else if (prop === 'box-shadow')    setPendingShadow(val);
                  else if (prop === 'border-color')  setPendingBorderColor(val);
                  else if (prop === 'border-width')  setPendingBorderWidth(val);
                  else if (prop === 'border-style')  setPendingBorderStyle(val);
                  else if (prop === 'font-size')     setPendingFontSize(val);
                  else if (prop === 'font-weight')   setPendingFontWeight(val);
                  else if (prop === 'padding')       setPendingPadding(val);
                  else if (prop === 'margin')        setPendingMargin(val);
                  else if (prop === 'gap')           setPendingGap(val);
                  else if (prop === 'width')         setPendingWidth(val);
                  else if (prop === 'height')        setPendingHeight(val);
                });
                applyToDOM(_copiedStyles);
              }}>
                粘贴样式（{_copiedStyles.length} 个属性）
              </button>
            </div>
          )}

        </div>
      )}
    </>
  );
}

// ─── 主组件：管理 active + panels 数组 ───────────────────────────
type FileEntry = { name: string; desc: string };

const CODE_FILES: FileEntry[] = [
  { name: 'src/',           desc: 'React 组件、页面、样式源码（不含调试工具）' },
  { name: 'index.html',     desc: '应用入口 HTML' },
  { name: 'package.json',   desc: '依赖包与脚本配置' },
  { name: 'tsconfig.json',  desc: 'TypeScript 编译配置' },
  { name: 'vite.config.ts', desc: '构建工具配置' },
];

const PRODUCT_FILES: FileEntry[] = [
  { name: 'docs/PRODUCT_PLAN.md',     desc: '产品规划与路线图' },
  { name: 'docs/PROJECT.md',          desc: '项目背景与目标概述' },
  { name: 'docs/DECISIONS.md',        desc: '关键产品决策记录' },
  { name: 'docs/CHANGELOG.md',        desc: '功能迭代变更日志' },
  { name: 'docs/CODE_STRUCTURE.md',   desc: '前端目录结构说明' },
  { name: 'docs/DESIGN_STANDARDS.md', desc: '设计规范总览' },
];

const DESIGN_FILES: FileEntry[] = [
  { name: 'docs/design/OVERVIEW.md',            desc: '设计系统总览' },
  { name: 'docs/design/tokens.md',              desc: 'Design Token 使用说明' },
  { name: 'docs/design/layout.md',              desc: '页面布局规范' },
  { name: 'docs/design/component-index.md',     desc: '组件清单索引' },
  { name: 'docs/design/business-components.md', desc: '业务组件说明' },
];

function FileList({ files }: { files: FileEntry[] }) {
  return (
    <ul className="di-dl-file-list">
      {files.map(f => (
        <li key={f.name}>
          <span className="di-dl-file-name">{f.name}</span>
          <span className="di-dl-file-desc">{f.desc}</span>
        </li>
      ))}
    </ul>
  );
}

type DlStatus = 'idle' | 'packing' | 'done' | 'error';

function DownloadButton() {
  const { endpoints } = useDevInspectorConfig();
  const [open, setOpen]       = useState(false);
  const [status, setStatus]   = useState<DlStatus>('idle');
  const [filePath, setFilePath] = useState('');
  const [details, setDetails] = useState({ code: false, product: false, design: false });
  const [opts, setOpts]       = useState({ code: true, product: false, design: false });

  function toggle(k: keyof typeof opts) {
    setOpts(prev => ({ ...prev, [k]: !prev[k] }));
  }
  function toggleDetail(k: keyof typeof details) {
    setDetails(prev => ({ ...prev, [k]: !prev[k] }));
  }
  function handleOpen() {
    setOpen(v => !v);
    if (open) setStatus('idle');
  }

  async function download() {
    if (!opts.code && !opts.product && !opts.design) return;
    setStatus('packing');
    try {
      const params = new URLSearchParams({
        code:    opts.code    ? '1' : '0',
        product: opts.product ? '1' : '0',
        design:  opts.design  ? '1' : '0',
      });
      const res  = await fetch(`${endpoints.handoff}?${params}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setFilePath(json.path);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }

  async function revealInFinder() {
    await fetch(`${endpoints.reveal}?path=${encodeURIComponent(filePath)}`);
  }

  const sections = [
    { key: 'code' as const,    label: '前端代码', files: CODE_FILES },
    { key: 'product' as const, label: '产品文档', files: PRODUCT_FILES },
    { key: 'design' as const,  label: '设计文档', files: DESIGN_FILES },
  ];

  return (
    <>
      <button className="di-dl-btn" onClick={handleOpen}>下载</button>

      {open && (
        <div className="di-dl-modal">
          <div className="di-dl-title">选择下载内容</div>

          {status === 'packing' && (
            <div className="di-dl-status">
              <span className="di-dl-spinner" />
              正在打包，请稍候…
            </div>
          )}

          {status === 'done' && (
            <div className="di-dl-done">
              <div className="di-dl-done-check">✓ 已保存至桌面</div>
              <div className="di-dl-done-path">{filePath.replace(/.*\//, '')}</div>
              <button className="di-dl-reveal-btn" onClick={revealInFinder}>
                在 Finder 中显示
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="di-dl-status di-dl-status--error">打包失败，请查看控制台</div>
          )}

          {(status === 'idle' || status === 'error') && (<>
            {sections.map(({ key, label, files }) => (
              <div key={key}>
                <div className="di-dl-row">
                  <label className="di-dl-check-label">
                    <input type="checkbox" checked={opts[key]} onChange={() => toggle(key)} />
                    {label}
                  </label>
                  <button className="di-dl-detail-btn" onClick={() => toggleDetail(key)}>
                    {details[key] ? '收起' : '详情'}
                  </button>
                </div>
                {details[key] && <FileList files={files} />}
              </div>
            ))}

            <button
              className="di-dl-confirm"
              onClick={download}
              disabled={!opts.code && !opts.product && !opts.design}
            >
              下载
            </button>
          </>)}
        </div>
      )}
    </>
  );
}

export default function DevInspector() {
  const [active, setActive] = useState(false);
  const [tokenMap, setTokenMap] = useState<Record<string, string>>({});
  const [panels, setPanels] = useState<{ id: string; el: Element }[]>([]);
  const modalOpenRef = useRef(false);

  useEffect(() => { setTokenMap(scanTokenMap()); }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'i') setActive(v => !v);
      if (e.key === 'Escape') { setActive(false); setPanels([]); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      if (!active || modalOpenRef.current) return;
      const el = e.target as Element;
      if (!el?.classList) return;
      if (isInsidePanel(el)) { el.classList.remove('di-hover'); return; }
      el.classList.add('di-hover');
    };
    const onOut = (e: MouseEvent) => { (e.target as Element)?.classList?.remove('di-hover'); };
    const onClick = (e: MouseEvent) => {
      if (!active || modalOpenRef.current) return;
      const el = e.target as Element;
      if (isInsidePanel(el)) return;
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('di-hover');
      setPanels(prev =>
        prev.length === 0
          ? [{ id: 'main', el }]
          : prev.map((p, i) => i === 0 ? { ...p, el } : p)
      );
    };
    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      document.querySelectorAll('.di-selected,.di-hover').forEach(e => e.classList.remove('di-selected','di-hover'));
    }
  }, [active]);

  useEffect(() => {
    document.body.style.cursor = active ? 'crosshair' : '';
    return () => { document.body.style.cursor = ''; };
  }, [active]);

  const primaryEl = panels[0]?.el;

  return (
    <>
      <DownloadButton />

      <button
        className={`di-trigger${active ? ' di-trigger--on' : ''}`}
        onClick={() => { setActive(v => !v); if (active) setPanels([]); }}
        title="Dev Inspector (Alt+I)"
      >
        {active ? '退出' : '编辑'}
      </button>

      {/* 已选中标签 */}
      {active && primaryEl && (() => {
        const rect = primaryEl.getBoundingClientRect();
        const classes = getClasses(primaryEl);
        return (
          <div className="di-label" style={{ top: rect.top - 34, left: rect.left + rect.width / 2 }}>
            已选中 {classes[0] ?? primaryEl.tagName.toLowerCase()}
          </div>
        );
      })()}

      {panels.map((p) => (
        <InspectorPanel
          key={p.id}
          targetEl={p.el}
          tokenMap={tokenMap}
          onTokenMapUpdate={updates => setTokenMap(prev => ({ ...prev, ...updates }))}
          onClose={() => setPanels(prev => prev.filter(x => x.id !== p.id))}
        />
      ))}
    </>
  );
}

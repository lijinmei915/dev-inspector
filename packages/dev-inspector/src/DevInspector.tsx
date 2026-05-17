import { useState, useEffect, useRef, useCallback } from 'react';
import { CircleHelp, Minus, Trash2 } from 'lucide-react';
import './dev-inspector.css';
import { useDevInspectorConfig } from './DevInspectorProvider';
import type { DevInspectorTokenConfig } from './config';
import type { ContainerStyleOption, PaletteColor, PaletteGroup, TypographyStyleOption } from './config';

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

function getTypographyStyles(tokens: DevInspectorTokenConfig): TypographyStyleOption[] {
  return tokens.typographyStyles ?? [];
}

function getContainerStyles(tokens: DevInspectorTokenConfig): ContainerStyleOption[] {
  return tokens.containerStyles ?? tokens.borderStyles ?? [];
}

function getTypographyStyle(
  fontSize: string,
  fontWeight: string,
  color: string,
  typographyStyles: TypographyStyleOption[],
  typographyTokens: DevInspectorTokenConfig['typographyTokens'],
): TypographyStyleOption | null {
  const matchedToken = getTypographyToken(fontSize, fontWeight, color, typographyTokens);
  const normalizedColor = normalizeColor(color);

  return (matchedToken
    ? typographyStyles.find(style => style.key === matchedToken.key)
    : null)
    ?? typographyStyles.find(style =>
      style.value === fontSize.trim()
      && style.fontWeight === fontWeight.trim()
      && normalizeColor(style.color) === normalizedColor,
    )
    ?? null;
}

function getContainerStyle(
  backgroundColor: string,
  borderWidth: string,
  borderStyle: string,
  borderColor: string,
  borderRadius: string,
  containerStyles: ContainerStyleOption[],
): ContainerStyleOption | null {
  const normalizedBackground = normalizeColor(backgroundColor || 'transparent');
  const normalizedColor = normalizeColor(borderColor || 'transparent');
  const normalizedWidth = borderWidth.trim();
  const normalizedStyle = borderStyle.trim();
  const normalizedRadius = borderRadius.trim();

  return containerStyles.find(style =>
    normalizeColor(style.backgroundColor) === normalizedBackground
    && style.borderWidth === normalizedWidth
    && style.borderStyle === normalizedStyle
    && normalizeColor(style.borderColor) === normalizedColor
    && style.borderRadius === normalizedRadius,
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
type LocalDraftChange = { prop: string; from: string; val: string };
type LocalDraftEntry = {
  key: string;
  selector: string;
  targetLabel: string;
  scopeLabel: string;
  changes: LocalDraftChange[];
  updatedAt: number;
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
  const raw = val.trim();
  if (raw === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/i.test(raw)) return 'transparent';
  const m = val.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (m) return '#' + [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
  return raw;
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

type ShadowParts = {
  x: string;
  y: string;
  blur: string;
  spread: string;
  color: string;
};

const DEFAULT_SHADOW_PARTS: ShadowParts = {
  x: '0px',
  y: '14px',
  blur: '42px',
  spread: '0px',
  color: 'rgba(15,23,42,0.08)',
};

const EMPTY_CUSTOM_SHADOW_PARTS: ShadowParts = {
  x: '0px',
  y: '0px',
  blur: '0px',
  spread: '0px',
  color: 'rgba(15,23,42,0)',
};

function normalizeShadowLengthInput(input: string): string {
  const raw = input.trim();
  if (!raw) return '0px';
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return `${raw}px`;
  return raw;
}

function parseShadowParts(value: string): ShadowParts {
  const raw = (value || 'none').trim();
  if (!raw || raw === 'none') return { ...DEFAULT_SHADOW_PARTS };
  const colorPattern = /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-f]{3,8}\b|var\([^)]+\)|\b(?:black|white|transparent)\b)/i;
  const colorMatch = raw.match(colorPattern);
  const color = colorMatch?.[0] ?? DEFAULT_SHADOW_PARTS.color;
  const remainder = raw
    .replace(colorPattern, '')
    .replace(/\binset\b/i, '')
    .split(/\s*,\s*/)[0]
    .trim();
  const parts = remainder.match(/-?\d*\.?\d+(?:px|rem|em|%)?/g) ?? [];
  return {
    x: normalizeShadowLengthInput(parts[0] ?? DEFAULT_SHADOW_PARTS.x),
    y: normalizeShadowLengthInput(parts[1] ?? DEFAULT_SHADOW_PARTS.y),
    blur: normalizeShadowLengthInput(parts[2] ?? DEFAULT_SHADOW_PARTS.blur),
    spread: normalizeShadowLengthInput(parts[3] ?? DEFAULT_SHADOW_PARTS.spread),
    color,
  };
}

function buildShadowValue(parts: ShadowParts): string {
  return `${normalizeShadowLengthInput(parts.x)} ${normalizeShadowLengthInput(parts.y)} ${normalizeShadowLengthInput(parts.blur)} ${normalizeShadowLengthInput(parts.spread)} ${parts.color}`;
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

function getShadowChangeDisplay(
  val: string,
  authoredVal: string,
  shadowTokens: DevInspectorTokenConfig['shadowTokens'],
): string {
  const display = getShadowDisplay(val, authoredVal, shadowTokens);
  if (display.label === '无') return display.label;
  if (display.isHardcoded) return `${display.label}（${display.sub}）`;
  return display.label;
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

function getPrimitiveClasses(el: Element): string[] {
  const classes = getClasses(el);
  if (el.tagName.toLowerCase() === 'svg' && classes.includes('lucide')) {
    return ['lucide'];
  }
  return [];
}

function getComponentClasses(el: Element): string[] {
  const primitiveClasses = getPrimitiveClasses(el);
  if (primitiveClasses.length) return primitiveClasses;

  const classes = getClasses(el);
  const cardBaseClass = classes.find(className =>
    /(^|[-_])card([-_]|$)/i.test(className)
    && !className.includes('--'),
  );
  if (cardBaseClass) return [cardBaseClass];

  const badgeBaseClass = classes.find(className =>
    /(^|[-_])(badge|tag|chip)([-_]|$)/i.test(className)
    && !className.includes('--')
    && !/(default|progress|processing|info|done|success|complete|completed|warning|warn|danger|error|destructive)/i.test(className),
  );
  if (badgeBaseClass) return [badgeBaseClass];

  const componentClasses = classes.filter(c =>
    !isStateClass(c)
    && !/^lucide(-|$)/.test(c)
  );
  return componentClasses.length ? componentClasses : classes;
}

function getStateClasses(el: Element): string[] {
  return getClasses(el).filter(c => !/^lucide(-|$)/.test(c));
}

const UNSAFE_GLOBAL_TAGS = new Set([
  'a', 'aside', 'button', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'img', 'input', 'label', 'li', 'main', 'ol', 'p', 'path', 'section',
  'span', 'strong', 'svg', 'textarea', 'ul',
]);

const TEXT_ONLY_TAGS = new Set([
  'a',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'label',
  'p',
  'span',
  'strong',
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

type InspectorComponentMeta = {
  name: string;
  type: string;
  layer: 'Component' | 'Primitive';
  variant: string;
  state: string;
};

function classIncludes(classes: string[], pattern: RegExp): boolean {
  return classes.some(className => pattern.test(className));
}

function inferVariantFromClasses(classes: string[]): string {
  const variantClass = classes.find(className =>
    /(^|[-_])(primary|secondary|ghost|text|link|outline|solid|soft|danger|success|warning)([-_]|$)/i.test(className),
  );
  if (!variantClass) return 'default';
  const match = variantClass.match(/primary|secondary|ghost|text|link|outline|solid|soft|danger|success|warning/i);
  return match?.[0].toLowerCase() ?? 'default';
}

function inferStateFromElement(el: Element, classes: string[]): string {
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return 'disabled';
  const stateClass = classes.find(isStateClass);
  if (!stateClass) return 'default';
  return stateClass.replace(/^(is-|has-|state-)/, '').replace(/^.+--/, '');
}

function getInspectorComponentMeta(el: Element): InspectorComponentMeta | null {
  const tag = el.tagName.toLowerCase();
  const classes = getClasses(el);
  const componentClasses = getComponentClasses(el);

  if (tag === 'svg' && classes.includes('lucide')) {
    const iconClass = classes.find(className => /^lucide-/.test(className));
    return {
      name: iconClass ?? 'lucide',
      type: 'Icon',
      layer: 'Primitive',
      variant: iconClass ? iconClass.replace(/^lucide-/, '') : 'default',
      state: inferStateFromElement(el, classes),
    };
  }

  if (tag === 'button' || classIncludes(classes, /(^|[-_])(btn|button)([-_]|$)/i)) {
    const name = componentClasses.find(className => /(button|btn)/i.test(className)) ?? componentClasses[0] ?? 'button';
    return {
      name,
      type: 'Button',
      layer: 'Component',
      variant: inferVariantFromClasses(classes),
      state: inferStateFromElement(el, classes),
    };
  }

  if (classIncludes(classes, /(^|[-_])card([-_]|$)/i)) {
    return {
      name: componentClasses.find(className => /card/i.test(className)) ?? componentClasses[0] ?? 'card',
      type: 'Card',
      layer: 'Component',
      variant: inferCardVariant(classes),
      state: inferStateFromElement(el, classes),
    };
  }

  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return {
      name: componentClasses[0] ?? tag,
      type: 'Control',
      layer: 'Primitive',
      variant: tag,
      state: inferStateFromElement(el, classes),
    };
  }

  if (classIncludes(classes, /(^|[-_])(badge|tag|chip)([-_]|$)/i)) {
    return {
      name: componentClasses[0] ?? 'badge',
      type: 'Badge',
      layer: 'Component',
      variant: inferBadgeTone(classes),
      state: inferStateFromElement(el, classes),
    };
  }

  return null;
}

const COMPONENT_ATTRIBUTE_ONLY_NAMES_BY_TYPE: Record<string, Set<string>> = {
  button: new Set([
    'primary',
    'secondary',
    'ghost',
    'text',
    'link',
    'outline',
    'solid',
    'soft',
    'danger',
    'success',
    'warning',
  ]),
  badge: new Set([
    'default',
    'progress',
    'processing',
    'info',
    'done',
    'success',
    'complete',
    'completed',
    'warning',
    'warn',
    'danger',
    'error',
    'destructive',
  ]),
};

function getControlDisplayName(meta: InspectorComponentMeta): string {
  const controlType = meta.variant && meta.variant !== 'default' ? meta.variant : meta.type.toLowerCase();
  for (const suffix of ['input', 'textarea', 'select']) {
    const tail = `-${suffix}`;
    if (meta.name.endsWith(tail)) {
      const base = meta.name.slice(0, -tail.length);
      return base ? `${suffix}-${base}` : suffix;
    }
  }
  return meta.name === controlType ? controlType : `${controlType}-${meta.name}`;
}

function getComponentDisplayName(meta: InspectorComponentMeta): string {
  if (meta.type === 'Control') return getControlDisplayName(meta);
  if (meta.layer === 'Primitive') return meta.name;
  const type = meta.type.toLowerCase();
  const suffixes = type === 'button'
    ? ['button', 'btn']
    : type === 'badge'
    ? ['badge', 'tag', 'chip']
    : [type];

  for (const suffix of suffixes) {
    const tail = `-${suffix}`;
    if (meta.name.endsWith(tail)) {
      const base = meta.name.slice(0, -tail.length);
      if (COMPONENT_ATTRIBUTE_ONLY_NAMES_BY_TYPE[type]?.has(base.toLowerCase())) return type;
      return base ? `${type}-${base}` : meta.name;
    }
  }

  return meta.name.startsWith(`${type}-`) ? meta.name : `${type}-${meta.name}`;
}

type ButtonVariantKey = 'primary' | 'secondary' | 'ghost' | 'text';
type ButtonSizeKey = 's' | 'm' | 'l';
type IconColorKey = 'default' | 'muted' | 'brand' | 'success' | 'warning' | 'danger';
type BadgeToneKey = 'default' | 'progress' | 'success' | 'warning' | 'danger';
type CardVariantKey = 'default' | 'compact' | 'floating' | 'emphasis';
type ComponentSizeKind = 'button' | 'icon' | 'badge';

type ComponentTextSlotDefinition = {
  key: string;
  label: string;
  selector: string;
};

type ComponentCapability = {
  type: string;
  editableText?: boolean;
  textSlots?: ComponentTextSlotDefinition[];
  childSlots?: ComponentTextSlotDefinition[];
  variantKind?: 'button' | 'card';
  toneKind?: 'badge';
  colorKind?: 'icon';
  sizeKind?: ComponentSizeKind;
};

const CARD_EDITABLE_TEXT_SLOTS: ComponentTextSlotDefinition[] = [
  {
    key: 'title',
    label: '标题',
    selector: '[data-di-slot="title"], .task-title, .card-title, h1, h2, h3',
  },
  {
    key: 'description',
    label: '说明文',
    selector: '[data-di-slot="description"], .card-desc, .card-description, p',
  },
];

const CARD_CHILD_SLOTS: ComponentTextSlotDefinition[] = [
  {
    key: 'status',
    label: '标签',
    selector: '[data-di-slot="status"], .status-badge, .badge, .tag, .chip',
  },
];

const COMPONENT_CAPABILITIES: Record<string, ComponentCapability> = {
  Button: {
    type: 'Button',
    editableText: true,
    variantKind: 'button',
    sizeKind: 'button',
  },
  Icon: {
    type: 'Icon',
    colorKind: 'icon',
    sizeKind: 'icon',
  },
  Badge: {
    type: 'Badge',
    editableText: true,
    toneKind: 'badge',
    sizeKind: 'badge',
  },
  Card: {
    type: 'Card',
    variantKind: 'card',
    textSlots: CARD_EDITABLE_TEXT_SLOTS,
    childSlots: CARD_CHILD_SLOTS,
  },
};

function getComponentCapability(meta: InspectorComponentMeta | null): ComponentCapability | null {
  return meta ? COMPONENT_CAPABILITIES[meta.type] ?? null : null;
}

function getComponentSlotElement(root: Element, slot: ComponentTextSlotDefinition): Element | null {
  try {
    return root.querySelector(slot.selector);
  } catch {
    return null;
  }
}

function getComponentSlotValues(root: Element, slots: ComponentTextSlotDefinition[] = []): Record<string, string> {
  return Object.fromEntries(slots.map(slot => [
    slot.key,
    (getComponentSlotElement(root, slot)?.textContent ?? '').trim(),
  ]));
}

const BUTTON_VARIANT_OPTIONS: { key: ButtonVariantKey; label: string }[] = [
  { key: 'primary', label: '主按钮' },
  { key: 'secondary', label: '次按钮' },
  { key: 'ghost', label: '幽灵' },
  { key: 'text', label: '文字' },
];

const BUTTON_VARIANT_CLASS_BY_KEY: Record<ButtonVariantKey, string> = {
  primary: 'primary-btn',
  secondary: 'secondary-button',
  ghost: 'ghost-button',
  text: 'text-button',
};

const BUTTON_VARIANT_CLASS_NAMES = new Set([
  ...Object.values(BUTTON_VARIANT_CLASS_BY_KEY),
  'secondary-btn',
  'outline-button',
  'outline-btn',
  'btn-primary',
  'btn-secondary',
  'btn-ghost',
  'btn-text',
]);

const BUTTON_SIZE_OPTIONS: { key: ButtonSizeKey; label: string; minHeight: string; padding: string; fontSize: string }[] = [
  { key: 's', label: 'S', minHeight: '34px', padding: '0 16px', fontSize: '13px' },
  { key: 'm', label: 'M', minHeight: '42px', padding: '0 24px', fontSize: '14px' },
  { key: 'l', label: 'L', minHeight: '48px', padding: '0 28px', fontSize: '15px' },
];

function normalizeButtonVariant(variant: string): ButtonVariantKey {
  return BUTTON_VARIANT_OPTIONS.some(option => option.key === variant)
    ? variant as ButtonVariantKey
    : 'secondary';
}

function getButtonText(el: Element): string {
  return (el.textContent ?? '').trim();
}

function getButtonVariantClass(el: Element): string {
  const classes = getClasses(el);
  return classes.find(className => BUTTON_VARIANT_CLASS_NAMES.has(className))
    ?? classes.find(className => /(button|btn)/i.test(className) && /primary|secondary|ghost|text|outline/i.test(className))
    ?? '';
}

function setButtonVariantOnTargets(targets: Element[], variant: ButtonVariantKey, restoreClass?: string) {
  targets.forEach(target => {
    const el = target as HTMLElement;
    Array.from(el.classList).forEach(className => {
      const isKnownVariant = BUTTON_VARIANT_CLASS_NAMES.has(className);
      const isButtonVariant = /(button|btn)/i.test(className) && /primary|secondary|ghost|text|outline/i.test(className);
      if (isKnownVariant || isButtonVariant) el.classList.remove(className);
    });
    const nextClass = restoreClass === undefined ? BUTTON_VARIANT_CLASS_BY_KEY[variant] : restoreClass;
    if (nextClass) el.classList.add(nextClass);
  });
}

function inferButtonSize(el: Element): ButtonSizeKey {
  const height = Number.parseFloat(getComputedStyle(el).height);
  if (height <= 36) return 's';
  if (height <= 44) return 'm';
  return 'l';
}

function getButtonSizeOption(size: ButtonSizeKey) {
  return BUTTON_SIZE_OPTIONS.find(option => option.key === size) ?? BUTTON_SIZE_OPTIONS[1];
}

function setButtonSizeOnTargets(targets: Element[], size: ButtonSizeKey) {
  const option = getButtonSizeOption(size);
  targets.forEach(target => {
    const el = target as HTMLElement;
    el.style.setProperty('min-height', option.minHeight);
    el.style.setProperty('padding', option.padding);
    el.style.setProperty('font-size', option.fontSize);
  });
}

function clearButtonSizeOnTargets(targets: Element[]) {
  targets.forEach(target => {
    const el = target as HTMLElement;
    el.style.removeProperty('min-height');
    el.style.removeProperty('padding');
    el.style.removeProperty('font-size');
  });
}

const ICON_SIZE_OPTIONS: { key: ButtonSizeKey; label: string; size: string }[] = [
  { key: 's', label: 'S', size: '16px' },
  { key: 'm', label: 'M', size: '20px' },
  { key: 'l', label: 'L', size: '24px' },
];

const ICON_COLOR_OPTIONS: { key: IconColorKey; label: string; value: string }[] = [
  { key: 'default', label: '默认', value: 'var(--color-text-default, #334155)' },
  { key: 'muted', label: '弱化', value: 'var(--color-text-muted, #64748b)' },
  { key: 'brand', label: '品牌', value: 'var(--color-brand-primary, #6d5dfc)' },
  { key: 'success', label: '成功', value: 'var(--color-success, #10a56f)' },
  { key: 'warning', label: '警告', value: 'var(--color-warning, #f59e0b)' },
  { key: 'danger', label: '危险', value: 'var(--color-danger, #ef4444)' },
];

function inferIconSize(el: Element): ButtonSizeKey {
  const cs = getComputedStyle(el);
  const size = Number.parseFloat(cs.width || cs.height);
  if (size <= 17) return 's';
  if (size <= 21) return 'm';
  return 'l';
}

function inferIconColor(el: Element): IconColorKey {
  const color = normalizeColor(getComputedStyle(el).color);
  if (color === '#64748b') return 'muted';
  if (color === '#6d5dfc' || color === '#7c3aed') return 'brand';
  if (color === '#10a56f' || color === '#16a34a') return 'success';
  if (color === '#f59e0b' || color === '#d97706') return 'warning';
  if (color === '#ef4444' || color === '#dc2626') return 'danger';
  return 'default';
}

function setIconSizeOnTargets(targets: Element[], size: ButtonSizeKey) {
  const option = ICON_SIZE_OPTIONS.find(item => item.key === size) ?? ICON_SIZE_OPTIONS[1];
  targets.forEach(target => {
    const el = target as HTMLElement;
    el.style.setProperty('width', option.size);
    el.style.setProperty('height', option.size);
  });
}

function clearIconSizeOnTargets(targets: Element[]) {
  targets.forEach(target => {
    const el = target as HTMLElement;
    el.style.removeProperty('width');
    el.style.removeProperty('height');
  });
}

function setIconColorOnTargets(targets: Element[], color: IconColorKey) {
  const option = ICON_COLOR_OPTIONS.find(item => item.key === color) ?? ICON_COLOR_OPTIONS[0];
  targets.forEach(target => (target as HTMLElement).style.setProperty('color', option.value));
}

function clearIconColorOnTargets(targets: Element[]) {
  targets.forEach(target => (target as HTMLElement).style.removeProperty('color'));
}

const BADGE_TONE_OPTIONS: { key: BadgeToneKey; label: string }[] = [
  { key: 'default', label: '默认' },
  { key: 'progress', label: '进行中' },
  { key: 'success', label: '成功' },
  { key: 'warning', label: '警告' },
  { key: 'danger', label: '危险' },
];

const BADGE_TONE_CLASS_BY_KEY: Record<BadgeToneKey, string> = {
  default: '',
  progress: 'status-badge--progress',
  success: 'status-badge--done',
  warning: 'status-badge--warning',
  danger: 'status-badge--danger',
};

const BADGE_TONE_CLASS_NAMES = new Set([
  ...Object.values(BADGE_TONE_CLASS_BY_KEY).filter(Boolean),
  'badge--default',
  'badge--progress',
  'badge--success',
  'badge--warning',
  'badge--danger',
  'tag--default',
  'tag--progress',
  'tag--success',
  'tag--warning',
  'tag--danger',
  'chip--default',
  'chip--progress',
  'chip--success',
  'chip--warning',
  'chip--danger',
]);

const BADGE_SIZE_OPTIONS: { key: ButtonSizeKey; label: string; minHeight: string; padding: string; fontSize: string }[] = [
  { key: 's', label: 'S', minHeight: '20px', padding: '0 8px', fontSize: '11px' },
  { key: 'm', label: 'M', minHeight: '24px', padding: '0 12px', fontSize: '12px' },
  { key: 'l', label: 'L', minHeight: '28px', padding: '0 14px', fontSize: '13px' },
];

function inferBadgeTone(classes: string[]): BadgeToneKey {
  if (classIncludes(classes, /(^|[-_])(progress|processing|info)([-_]|$)/i)) return 'progress';
  if (classIncludes(classes, /(^|[-_])(done|success|complete|completed)([-_]|$)/i)) return 'success';
  if (classIncludes(classes, /(^|[-_])(warning|warn)([-_]|$)/i)) return 'warning';
  if (classIncludes(classes, /(^|[-_])(danger|error|destructive)([-_]|$)/i)) return 'danger';
  return 'default';
}

function getBadgeToneClass(el: Element): string {
  const classes = getClasses(el);
  return classes.find(className => BADGE_TONE_CLASS_NAMES.has(className)) ?? '';
}

function setBadgeToneOnTargets(targets: Element[], tone: BadgeToneKey, restoreClass?: string) {
  targets.forEach(target => {
    const el = target as HTMLElement;
    Array.from(el.classList).forEach(className => {
      const isKnownTone = BADGE_TONE_CLASS_NAMES.has(className);
      const isBadgeTone = /(badge|tag|chip)/i.test(className) && /(default|progress|processing|info|done|success|complete|completed|warning|warn|danger|error|destructive)/i.test(className);
      if (isKnownTone || isBadgeTone) el.classList.remove(className);
    });
    const nextClass = restoreClass === undefined ? BADGE_TONE_CLASS_BY_KEY[tone] : restoreClass;
    if (nextClass) el.classList.add(nextClass);
  });
}

function inferBadgeSize(el: Element): ButtonSizeKey {
  const height = Number.parseFloat(getComputedStyle(el).height);
  if (height <= 22) return 's';
  if (height <= 26) return 'm';
  return 'l';
}

function setBadgeSizeOnTargets(targets: Element[], size: ButtonSizeKey) {
  const option = BADGE_SIZE_OPTIONS.find(item => item.key === size) ?? BADGE_SIZE_OPTIONS[1];
  targets.forEach(target => {
    const el = target as HTMLElement;
    el.style.setProperty('min-height', option.minHeight);
    el.style.setProperty('padding', option.padding);
    el.style.setProperty('font-size', option.fontSize);
  });
}

function clearBadgeSizeOnTargets(targets: Element[]) {
  targets.forEach(target => {
    const el = target as HTMLElement;
    el.style.removeProperty('min-height');
    el.style.removeProperty('padding');
    el.style.removeProperty('font-size');
  });
}

const CARD_VARIANT_OPTIONS: { key: CardVariantKey; label: string; modifier?: string }[] = [
  { key: 'default', label: '默认' },
  { key: 'compact', label: '紧凑', modifier: 'compact' },
  { key: 'floating', label: '浮起', modifier: 'floating' },
  { key: 'emphasis', label: '强调', modifier: 'emphasis' },
];

function inferCardVariant(classes: string[]): CardVariantKey {
  if (classIncludes(classes, /--compact$/i)) return 'compact';
  if (classIncludes(classes, /--floating$/i)) return 'floating';
  if (classIncludes(classes, /--emphasis$/i)) return 'emphasis';
  return 'default';
}

function getCardVariantClass(el: Element): string {
  return getClasses(el).find(className => (
    /card/i.test(className)
    && /--(compact|floating|emphasis)$/i.test(className)
  )) ?? '';
}

function getCardBaseClass(el: Element): string {
  return getComponentClasses(el).find(className => /card/i.test(className) && !className.includes('--'))
    ?? 'card';
}

function setCardVariantOnTargets(targets: Element[], variant: CardVariantKey, restoreClass?: string) {
  targets.forEach(target => {
    const el = target as HTMLElement;
    Array.from(el.classList).forEach(className => {
      if (/card/i.test(className) && /--(compact|floating|emphasis)$/i.test(className)) {
        el.classList.remove(className);
      }
    });

    const nextClass = restoreClass === undefined
      ? CARD_VARIANT_OPTIONS.find(option => option.key === variant)?.modifier
      : restoreClass;
    if (nextClass && restoreClass === undefined) {
      el.classList.add(`${getCardBaseClass(el)}--${nextClass}`);
    } else if (nextClass) {
      el.classList.add(nextClass);
    }
  });
}

function getComponentSizeControlOptions(capability: ComponentCapability | null): { key: ButtonSizeKey; label: string; title: string }[] {
  if (capability?.sizeKind === 'icon') {
    return ICON_SIZE_OPTIONS.map(option => ({ key: option.key, label: option.label, title: `${option.label} · ${option.size}` }));
  }
  if (capability?.sizeKind === 'badge') {
    return BADGE_SIZE_OPTIONS.map(option => ({ key: option.key, label: option.label, title: `${option.label} · ${option.minHeight}` }));
  }
  return BUTTON_SIZE_OPTIONS.map(option => ({ key: option.key, label: option.label, title: `${option.label} · ${option.minHeight}` }));
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

function getNumericCssValue(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function formatSizeDisplay(value: string): string {
  const raw = value.trim();
  const pxMatch = raw.match(/^(-?\d+(?:\.\d+)?)px$/i);
  if (!pxMatch) return raw;
  const rounded = Math.round(Number.parseFloat(pxMatch[1]) * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}px`;
}

function displaySizeValue(cssValue: string, current: string): string {
  if (!cssValue || cssValue === '100%' || cssValue === 'fit-content') return formatSizeDisplay(current || '0px');
  return formatSizeDisplay(cssValue);
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

function normalizeSpacingInput(
  input: string,
  spaceSteps: DevInspectorTokenConfig['spaceSteps'],
): string {
  const raw = input.trim();
  if (!raw) return '0px';

  const step = spaceSteps.find(s => s.label.toLowerCase() === raw.toLowerCase());
  if (step) return step.val;

  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return `${raw}px`;
  return raw;
}

function normalizeCssLengthInput(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return `${raw}px`;
  return raw;
}

function supportsCssValue(prop: string, value: string): boolean {
  return typeof CSS === 'undefined' || CSS.supports(prop, value);
}

function isNegativeSpacingValue(value: string): boolean {
  return /^-\d/.test(value.trim());
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
                  onChange(normalizeSpacingInput(draft, spaceSteps));
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

type SpaceVariant = 'padding' | 'margin' | 'gap';

function formatSpaceShort(value: string): string {
  const normalized = normalizeSpacingInput(value || '0px', []);
  return normalized.replace(/px$/i, '');
}

function getSpaceStepMatch(
  variant: SpaceVariant,
  value: string,
  spaceSteps: DevInspectorTokenConfig['spaceSteps'],
) {
  if (variant === 'gap') {
    const normalized = normalizeSpacingInput(value, spaceSteps);
    return spaceSteps.find(step => step.val === normalized) ?? null;
  }
  const sides = parseFourSides(value);
  const isUniform = sides.top === sides.right && sides.right === sides.bottom && sides.bottom === sides.left;
  return isUniform ? spaceSteps.find(step => step.val === sides.top) ?? null : null;
}

function getSpaceSummary(variant: SpaceVariant, value: string): string {
  if (variant === 'gap') return `gap ${formatSpaceShort(value)}`;
  const sides = parseFourSides(value);
  return `上${formatSpaceShort(sides.top)} / 右${formatSpaceShort(sides.right)} / 下${formatSpaceShort(sides.bottom)} / 左${formatSpaceShort(sides.left)}`;
}

// SpaceCard 子组件
function SpaceCard({ title, variant, value, onChange, spaceSteps, custom, onCustomChange }: {
  title: string;
  variant: SpaceVariant;
  value: string;
  onChange: (v: string) => void;
  spaceSteps: DevInspectorTokenConfig['spaceSteps'];
  custom: boolean;
  onCustomChange: (v: boolean) => void;
}) {
  const [showDrop, setShowDrop] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const matchedStep = getSpaceStepMatch(variant, value, spaceSteps);
  const isCustom = custom || !matchedStep;
  const isEmptySpace = !isCustom && matchedStep?.val === '0px';
  const spaceTokenMeta = isCustom ? '' : matchedStep?.val;
  const sides = parseFourSides(value);

  function updateSide(side: keyof FourSides, v: string) {
    const nextValue = normalizeSpacingInput(v, spaceSteps);
    const next = { ...sides, [side]: nextValue };
    onCustomChange(true);
    onChange(joinFourSides(next));
  }

  function stepSide(side: keyof FourSides, delta: number) {
    const rawNext = Math.round(getNumericCssValue(sides[side]) + delta);
    const next = variant === 'margin' ? rawNext : Math.max(0, rawNext);
    updateSide(side, `${next}px`);
  }

  function updateGap(v: string) {
    onCustomChange(true);
    onChange(normalizeSpacingInput(v, spaceSteps));
  }

  function stepGap(delta: number) {
    const rawNext = Math.round(getNumericCssValue(value) + delta);
    updateGap(`${Math.max(0, rawNext)}px`);
  }

  return (
    <div className="di-space-card">
      <div className="di-space-row-head">
        <span className="di-space-title">{title}</span>
        <button
          type="button"
          className={`di-space-token-trigger${isCustom ? ' di-space-token-trigger--custom' : ''}${isEmptySpace ? ' di-space-token-trigger--empty' : ''}`}
          onClick={event => {
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
            setPopupPos(calcDropPos(rect, 260));
            setShowDrop(v => !v);
          }}
        >
          <span className="di-space-token-label">{isCustom ? '自定义' : matchedStep?.label}</span>
          <span className="di-space-token-meta">{spaceTokenMeta}</span>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{marginLeft:'auto',flexShrink:0}}><path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
        <span className="di-space-summary">{getSpaceSummary(variant, value)}</span>
        {showDrop && (
          <>
            <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={() => setShowDrop(false)} />
            <div className="di-border-style-drop di-space-token-menu" style={{position:'fixed',top:popupPos.top,left:popupPos.left,zIndex:99998}}>
              {spaceSteps.map(step => {
                const isOn = !isCustom && matchedStep?.val === step.val;
                return (
                  <button
                    key={step.val}
                    type="button"
                    className={`di-border-style-drop-item${isOn ? ' di-border-style-drop-item--on' : ''}`}
                    onClick={() => {
                      onCustomChange(false);
                      onChange(step.val);
                      setShowDrop(false);
                    }}
                  >
                    <span className={step.val === '0px' ? 'di-border-style-label di-token-name--empty' : 'di-border-style-label'}>{step.label}</span>
                    <span className="di-shadow-drop-meta">
                      <span className="di-border-style-name">{step.val}</span>
                      <span className="di-shadow-drop-value">{step.val === '0px' ? '空值状态' : 'token spacing'}</span>
                    </span>
                  </button>
                );
              })}
              <button
                type="button"
                className={`di-border-style-drop-item${isCustom ? ' di-border-style-drop-item--on' : ''}`}
                onClick={() => {
                  onCustomChange(true);
                  setShowDrop(false);
                }}
              >
                <span className="di-custom-option-label">自定义</span>
                <span className="di-shadow-drop-meta">
                  <span className="di-border-style-name">手动调整参数</span>
                  <span className="di-shadow-drop-value">{variant === 'gap' ? '间距' : '上 / 右 / 下 / 左'}</span>
                </span>
              </button>
            </div>
          </>
        )}
      </div>

      {isCustom && variant !== 'gap' && (
        <div className="di-space-custom-grid">
          {([
            { key: 'top', label: '上', value: sides.top },
            { key: 'right', label: '右', value: sides.right },
            { key: 'bottom', label: '下', value: sides.bottom },
            { key: 'left', label: '左', value: sides.left },
          ] as const).map(item => (
            <div className="di-space-custom-row" key={item.key}>
              <span className="di-space-custom-label">{item.label}</span>
              <div className="di-number-stepper">
                <input
                  className="di-space-custom-input di-number-stepper-input"
                  value={item.value}
                  aria-label={`${title}${item.label}`}
                  onChange={event => updateSide(item.key, event.currentTarget.value)}
                  onFocus={event => event.currentTarget.select()}
                  onClick={event => event.currentTarget.select()}
                  onMouseUp={event => event.preventDefault()}
                />
                <div className="di-number-stepper-buttons">
                  <button type="button" onClick={() => stepSide(item.key, 1)} aria-label={`${title}${item.label}增加 1px`}>⌃</button>
                  <button type="button" onClick={() => stepSide(item.key, -1)} aria-label={`${title}${item.label}减少 1px`}>⌄</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isCustom && variant === 'gap' && (
        <div className="di-space-custom-grid di-space-custom-grid--gap">
          <div className="di-space-custom-row">
            <span className="di-space-custom-label">间距</span>
            <div className="di-number-stepper">
              <input
                className="di-space-custom-input di-number-stepper-input"
                value={value}
                aria-label="元素间距"
                onChange={event => updateGap(event.currentTarget.value)}
                onFocus={event => event.currentTarget.select()}
                onClick={event => event.currentTarget.select()}
                onMouseUp={event => event.preventDefault()}
              />
              <div className="di-number-stepper-buttons">
                <button type="button" onClick={() => stepGap(1)} aria-label="元素间距增加 1px">⌃</button>
                <button type="button" onClick={() => stepGap(-1)} aria-label="元素间距减少 1px">⌄</button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  const typographyStyles = getTypographyStyles(tokens);
  const containerStyles = getContainerStyles(tokens);
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
  const [showContainerStyleDrop, setShowContainerStyleDrop] = useState(false);
  const [showBorderWidthDrop, setShowBorderWidthDrop] = useState(false);
  const [showRadiusDrop, setShowRadiusDrop] = useState(false);
  const [containerCustomMode, setContainerCustomMode] = useState(false);
  const [showShadowDrop, setShowShadowDrop] = useState(false);
  const [showShadowColorDrop, setShowShadowColorDrop] = useState(false);
  const [shadowCustomMode, setShadowCustomMode] = useState(false);
  const [showStyleDrop, setShowStyleDrop] = useState(false);
  const [showWeightDrop, setShowWeightDrop] = useState(false);
  const [showFontSizeDrop, setShowFontSizeDrop] = useState(false);
  const [showTypographyStyleDrop, setShowTypographyStyleDrop] = useState(false);
  const [typographyCustomMode, setTypographyCustomMode] = useState(false);
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
  const [spaceCustomModes, setSpaceCustomModes] = useState<Record<SpaceVariant, boolean>>({
    padding: false,
    margin: false,
    gap: false,
  });
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
  const [locatorMsg, setLocatorMsg]       = useState('');
  const [submitMsg, setSubmitMsg]         = useState('');
  const [componentTextVal, setComponentTextVal] = useState('');
  const [componentTextDraft, setComponentTextDraft] = useState('');
  const [componentTextSlotVals, setComponentTextSlotVals] = useState<Record<string, string>>({});
  const [componentTextSlotDrafts, setComponentTextSlotDrafts] = useState<Record<string, string>>({});
  const [componentChildSlotVals, setComponentChildSlotVals] = useState<Record<string, string>>({});
  const [pendingComponentTextSlots, setPendingComponentTextSlots] = useState<Record<string, string>>({});
  const [pendingComponentText, setPendingComponentText] = useState<string | null>(null);
  const [componentSelectorVal, setComponentSelectorVal] = useState('');
  const [componentVariantVal, setComponentVariantVal] = useState<ButtonVariantKey>('secondary');
  const [componentVariantClassVal, setComponentVariantClassVal] = useState('');
  const [pendingComponentVariant, setPendingComponentVariant] = useState<ButtonVariantKey | ''>('');
  const [componentSizeVal, setComponentSizeVal] = useState<ButtonSizeKey>('m');
  const [pendingComponentSize, setPendingComponentSize] = useState<ButtonSizeKey | ''>('');
  const [iconColorVal, setIconColorVal] = useState<IconColorKey>('default');
  const [pendingIconColor, setPendingIconColor] = useState<IconColorKey | ''>('');
  const [badgeToneVal, setBadgeToneVal] = useState<BadgeToneKey>('default');
  const [badgeToneClassVal, setBadgeToneClassVal] = useState('');
  const [pendingBadgeTone, setPendingBadgeTone] = useState<BadgeToneKey | ''>('');
  const [cardVariantVal, setCardVariantVal] = useState<CardVariantKey>('default');
  const [cardVariantClassVal, setCardVariantClassVal] = useState('');
  const [pendingCardVariant, setPendingCardVariant] = useState<CardVariantKey | ''>('');
  const [localDrafts, setLocalDrafts] = useState<Record<string, LocalDraftEntry>>({});
  const [styleIntentSummary, setStyleIntentSummary] = useState<StyleIntentSummary>({ pendingCount: 0, latestPending: null, pendingEntries: [] });
  const [hasCopied, setHasCopied]         = useState(() => _copiedStyles.length > 0);
  const [expandedColor, setExpandedColor] = useState<string | null>(null);
  const [pendingNewToken, setPendingNewToken] = useState<{ cssVar: string; value: string; usage: string } | null>(null);
  const [addTokenModal, setAddTokenModal] = useState<{ value: string; cssProp?: string } | null>(null);
  const [customColorVals, setCustomColorVals] = useState<Record<string, string>>({});
  const selectedRef = useRef<Element>(targetEl);
  const localDraftsRef = useRef<Record<string, LocalDraftEntry>>({});
  const gapTargetRef = useRef<HTMLElement | null>(null); // gap 实际作用的元素（可能是父容器）

  useEffect(() => { modalOpenRef.current = addTokenModal !== null; }, [addTokenModal]);
  useEffect(() => { localDraftsRef.current = localDrafts; }, [localDrafts]);

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

  function getDraftTargetInfo(el: Element): Pick<LocalDraftEntry, 'key' | 'selector' | 'targetLabel' | 'scopeLabel'> {
    const componentMeta = getInspectorComponentMeta(el);
    const selector = getSelectorForScope(el, scope);
    const targetClasses = getClasses(el);
    const targetLabel = componentMeta
      ? `${componentMeta.type} / ${getComponentDisplayName(componentMeta)}`
      : targetClasses.length
      ? `${el.tagName.toLowerCase()}.${targetClasses.join('.')}`
      : el.tagName.toLowerCase();
    return {
      key: `${scope}:${selector}`,
      selector,
      targetLabel,
      scopeLabel: scope === 'current' ? '当前元素' : '相同元素',
    };
  }

  function removeLocalDraftEntry(key: string) {
    setLocalDrafts(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // 选中逻辑
  const selectEl = useCallback((el: Element) => {
    selectedRef.current = el;
    const rect = el.getBoundingClientRect();
    setPanelPos(calcPanelPos(rect));
    setLocatorMsg('');

    // 读颜色
    const elCs = getComputedStyle(el);
    const selectedComponentMeta = getInspectorComponentMeta(el);
    const selectedCapability = getComponentCapability(selectedComponentMeta);
    const isButtonComponent = selectedCapability?.type === 'Button';
    const isIconComponent = selectedCapability?.type === 'Icon';
    const isBadgeComponent = selectedCapability?.type === 'Badge';
    const isCardComponent = selectedCapability?.type === 'Card';
    const hasEditableText = !!selectedCapability?.editableText;
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
    setTypographyCustomMode(false);
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
    setShowContainerStyleDrop(false);
    setShowBorderWidthDrop(false);
    setShowRadiusDrop(false);
    setContainerCustomMode(false);

    // 圆角
    const r = getComputedRadius(el);
    setRadiusVal(r);
    setPendingRadius('');

    // 阴影
    const shadowComputed = elCs.boxShadow.trim() || 'none';
    setShadowVal(shadowComputed === 'rgba(0, 0, 0, 0) 0px 0px 0px 0px' ? 'none' : shadowComputed);
    setShadowAuthoredVal(getAuthoredStyleValue(el, 'box-shadow'));
    setPendingShadow('');
    setShadowCustomMode(false);
    setShowShadowDrop(false);
    setShowShadowColorDrop(false);

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
    setSpaceCustomModes({ padding: false, margin: false, gap: false });

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
    if (selectedComponentMeta) {
      setComponentSelectorVal(getSelectorForScope(el, 'component'));
    } else {
      setComponentSelectorVal('');
    }
    if (hasEditableText) {
      const componentText = getButtonText(el);
      setComponentTextVal(componentText);
      setComponentTextDraft(componentText);
    } else {
      setComponentTextVal('');
      setComponentTextDraft('');
    }
    const editableSlotValues = getComponentSlotValues(el, selectedCapability?.textSlots);
    const childSlotValues = getComponentSlotValues(el, selectedCapability?.childSlots);
    setComponentTextSlotVals(editableSlotValues);
    setComponentTextSlotDrafts(editableSlotValues);
    setComponentChildSlotVals(childSlotValues);
    if (isButtonComponent) {
      setComponentVariantVal(normalizeButtonVariant(selectedComponentMeta?.variant ?? ''));
      setComponentVariantClassVal(getButtonVariantClass(el));
      setComponentSizeVal(inferButtonSize(el));
    } else if (isIconComponent) {
      setComponentVariantVal('secondary');
      setComponentVariantClassVal('');
      setComponentSizeVal(inferIconSize(el));
      setIconColorVal(inferIconColor(el));
    } else if (isBadgeComponent) {
      const tone = inferBadgeTone(getClasses(el));
      setComponentVariantVal('secondary');
      setComponentVariantClassVal('');
      setComponentSizeVal(inferBadgeSize(el));
      setBadgeToneVal(tone);
      setBadgeToneClassVal(getBadgeToneClass(el));
    } else if (isCardComponent) {
      setComponentVariantVal('secondary');
      setComponentVariantClassVal('');
      setComponentSizeVal('m');
      setIconColorVal('default');
      setBadgeToneVal('default');
      setBadgeToneClassVal('');
      setCardVariantVal(inferCardVariant(getClasses(el)));
      setCardVariantClassVal(getCardVariantClass(el));
    } else {
      setComponentVariantVal('secondary');
      setComponentVariantClassVal('');
      setComponentSizeVal('m');
      setIconColorVal('default');
      setBadgeToneVal('default');
      setBadgeToneClassVal('');
      setCardVariantVal('default');
      setCardVariantClassVal('');
    }
    setPendingComponentText(null);
    setPendingComponentTextSlots({});
    setPendingComponentVariant('');
    setPendingComponentSize('');
    setPendingIconColor('');
    setPendingBadgeTone('');
    setPendingCardVariant('');
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
      if (isNegativeSpacingValue(val)) return;
      gapTargetRef.current.style.setProperty('gap', val);
    } else {
      applyToDOM([{ prop, val }]);
    }
  }

  function liveApplyMany(changes: { prop: string; val: string }[]) {
    applyToDOM(changes);
  }

  function applyTypographyStyle(style: TypographyStyleOption) {
    setPendingFontSize(style.value);
    setPendingFontWeight(style.fontWeight);
    setPendingTextColor(style.color);
    setTypographyCustomMode(false);
    liveApplyMany([
      { prop: 'font-size', val: style.value },
      { prop: 'font-weight', val: style.fontWeight },
      { prop: 'color', val: style.color },
    ]);
  }

  function applyContainerStyle(style: ContainerStyleOption) {
    setPendingColors(prev => ({ ...prev, 'background-color': style.backgroundColor }));
    setPendingBorderColor(style.borderColor);
    setPendingBorderWidth(style.borderWidth);
    setPendingBorderStyle(style.borderStyle);
    setPendingRadius(style.borderRadius);
    setCustomRadius('');
    setContainerCustomMode(false);
    liveApplyMany([
      { prop: 'background-color', val: style.backgroundColor },
      { prop: 'border-color', val: style.borderColor },
      { prop: 'border-width', val: style.borderWidth },
      { prop: 'border-style', val: style.borderStyle },
      { prop: 'border-radius', val: style.borderRadius },
    ]);
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

  function setTranslateAxis(axis: 'x' | 'y', value: string) {
    const base = pendingTranslate ?? translateVal;
    const nextValue = getNumericCssValue(normalizeCssSize(value));
    const next = { ...base, [axis]: nextValue };
    setPendingTranslate(next);
    liveApply('translate', formatTranslate(next));
  }

  function stepTranslateAxis(axis: 'x' | 'y', delta: number) {
    const base = pendingTranslate ?? translateVal;
    setTranslateAxis(axis, `${base[axis] + delta}px`);
  }

  function stepSize(prop: SizeAxis, value: string, delta: number) {
    const fallback = getNumericCssValue(prop === 'width' ? pendingWidth || widthVal : pendingHeight || heightVal);
    const next = `${Math.round(getNumericCssValue(value, fallback) + delta)}px`;
    setSizeDraft(prev => ({ ...prev, [prop]: next }));
    setSize(prop, next, 'fixed');
  }

  function setCustomShadowPart(part: keyof ShadowParts, value: string) {
    const current = parseShadowParts(pendingShadow || shadowVal);
    const nextParts = {
      ...current,
      [part]: part === 'color' ? value : normalizeShadowLengthInput(value),
    };
    const next = buildShadowValue(nextParts);
    setShadowCustomMode(true);
    setPendingShadow(next);
    liveApply('box-shadow', next);
  }

  function stepCustomShadowPart(part: Exclude<keyof ShadowParts, 'color'>, delta: number) {
    const current = parseShadowParts(pendingShadow || shadowVal);
    const next = `${Math.round(getNumericCssValue(current[part]) + delta)}px`;
    setCustomShadowPart(part, next);
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

  function getComponentTargets(): Element[] {
    const el = selectedRef.current;
    return el ? getScopeTargets(el, scope) : [];
  }

  function getComponentContentTargets(): Element[] {
    const el = selectedRef.current;
    return el ? [el] : [];
  }

  function updateComponentText(value: string) {
    setComponentTextDraft(value);
    setPendingComponentText(value === componentTextVal ? null : value);
    getComponentContentTargets().forEach(target => { target.textContent = value; });
  }

  function updateComponentTextSlot(slot: ComponentTextSlotDefinition, value: string) {
    setComponentTextSlotDrafts(prev => ({ ...prev, [slot.key]: value }));
    setPendingComponentTextSlots(prev => {
      const next = { ...prev };
      if (value === componentTextSlotVals[slot.key]) {
        delete next[slot.key];
      } else {
        next[slot.key] = value;
      }
      return next;
    });
    getComponentContentTargets().forEach(target => {
      const slotEl = getComponentSlotElement(target, slot);
      if (slotEl) slotEl.textContent = value;
    });
  }

  function updateComponentVariant(variant: ButtonVariantKey) {
    const targets = getComponentTargets();
    if (variant === componentVariantVal) {
      setPendingComponentVariant('');
      setButtonVariantOnTargets(targets, componentVariantVal, componentVariantClassVal);
      return;
    }
    setPendingComponentVariant(variant);
    setButtonVariantOnTargets(targets, variant);
  }

  function updateComponentSize(size: ButtonSizeKey) {
    const meta = getInspectorComponentMeta(selectedRef.current);
    const capability = getComponentCapability(meta);
    const targets = getComponentTargets();
    setPendingComponentSize(size === componentSizeVal ? '' : size);
    if (size === componentSizeVal) {
      clearButtonSizeOnTargets(targets);
      clearIconSizeOnTargets(targets);
      clearBadgeSizeOnTargets(targets);
      return;
    }
    if (capability?.sizeKind === 'icon') {
      setIconSizeOnTargets(targets, size);
      return;
    }
    if (capability?.sizeKind === 'badge') {
      setBadgeSizeOnTargets(targets, size);
      return;
    }
    setButtonSizeOnTargets(targets, size);
  }

  function updateIconColor(color: IconColorKey) {
    const targets = getComponentTargets();
    setPendingIconColor(color === iconColorVal ? '' : color);
    if (color === iconColorVal) {
      clearIconColorOnTargets(targets);
      return;
    }
    setIconColorOnTargets(targets, color);
  }

  function updateBadgeTone(tone: BadgeToneKey) {
    const targets = getComponentTargets();
    if (tone === badgeToneVal) {
      setPendingBadgeTone('');
      setBadgeToneOnTargets(targets, badgeToneVal, badgeToneClassVal);
      return;
    }
    setPendingBadgeTone(tone);
    setBadgeToneOnTargets(targets, tone);
  }

  function updateCardVariant(variant: CardVariantKey) {
    const targets = getComponentTargets();
    if (variant === cardVariantVal) {
      setPendingCardVariant('');
      setCardVariantOnTargets(targets, cardVariantVal, cardVariantClassVal);
      return;
    }
    setPendingCardVariant(variant);
    setCardVariantOnTargets(targets, variant);
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
    pageLabel: string;
    targetLabel: string;
    selector: string;
    scopeLabel: string;
    changes: { prop: string; from: string; val: string }[];
    note?: string;
  }) {
    const changes = params.changes
      .map((change, index) => `${index + 1}. ${getChangeLabel(change.prop)}：${change.from} → ${change.val}`)
      .join('\n');
    const latestHint = params.entryId
      ? `优先处理 id = ${params.entryId} 这条记录。`
      : '这条任务来自 DevInspector 当前选中元素。';
    return [
      'DevInspector 样式任务',
      `页面：${params.pageLabel}`,
      `元素：${params.targetLabel}`,
      `范围：${params.scopeLabel}`,
      `选择器：${params.selector}`,
      '改动：',
      changes || '无样式改动',
      ...(params.note ? ['补充：', params.note] : []),
      '定位提示：',
      latestHint,
      '请优先定位该选择器对应的组件或样式源码，判断是否应固化为正式组件样式；不要手改 dist。',
    ].join('\n');
  }

  function buildAiDraftBasketPrompt(drafts: LocalDraftEntry[]) {
    const sections = drafts
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .map((draft, index) => {
        const changes = draft.changes
          .map((change, changeIndex) => `${changeIndex + 1}. ${getChangeLabel(change.prop)}：${change.from} → ${change.val}`)
          .join('\n');
        return [
          `${index + 1}. 元素：${draft.targetLabel}`,
          `范围：${draft.scopeLabel}`,
          `选择器：${draft.selector}`,
          '改动：',
          changes || '无样式改动',
        ].join('\n');
      })
      .join('\n\n');
    return [
      'DevInspector 样式任务',
      `页面：${document.title || '当前页面'}（${window.location.href}）`,
      `待处理对象：${drafts.length}`,
      sections,
      ...(note ? ['补充：', note] : []),
      '定位提示：',
      '这些内容来自 DevInspector 本次修改内容，请按对象逐一定位源码，判断是否应固化为组件样式、token 或局部覆盖；不要手改 dist。',
    ].join('\n');
  }

  function handleSubmitToAi() {
    const draftEntries = Object.values(localDraftsRef.current);
    if (draftEntries.length > 0) {
      const prompt = buildAiDraftBasketPrompt(draftEntries);
      copyTextToClipboard(prompt)
        .then((copied) => {
          setSubmitMsg(copied ? '任务文本已复制 ✓' : '复制失败');
          setTimeout(() => setSubmitMsg(''), copied ? 2200 : 1800);
        })
        .catch(() => {
          setSubmitMsg('复制失败');
          setTimeout(() => setSubmitMsg(''), 1800);
        });
      return;
    }

    const payload = getPendingEntries();
    if (!payload) return;
    const { el, pending, selector } = payload;
    const componentMeta = getInspectorComponentMeta(el);
    const changes = getPendingChangeRecords();
    if (pending.length === 0 && !note && !componentMeta) {
      setSubmitMsg('先改点样式或写备注');
      setTimeout(() => setSubmitMsg(''), 1800);
      return;
    }

    const hasOnlyInstanceContentPending = componentMeta
      && (pendingComponentText !== null || Object.keys(pendingComponentTextSlots).length > 0)
      && !pendingComponentVariant
      && !pendingComponentSize
      && !pendingIconColor
      && !pendingBadgeTone
      && !pendingCardVariant
      && pending.length === 0;
    const scopeLabel = hasOnlyInstanceContentPending
      ? '当前元素'
      : scope === 'current' ? '当前元素' : '相同元素';
    const targetClasses = getClasses(el);
    const targetLabel = componentMeta
      ? `${componentMeta.type} / ${getComponentDisplayName(componentMeta)}`
      : targetClasses.length
      ? `${el.tagName.toLowerCase()}.${targetClasses.join('.')}`
      : el.tagName.toLowerCase();
    const stableSelector = componentMeta && hasComponentAttrPending && componentSelectorVal
      ? componentSelectorVal
      : selector;

    const prompt = buildAiTaskPrompt({
      pageLabel: `${document.title || '当前页面'}（${window.location.href}）`,
      targetLabel,
      selector: stableSelector,
      scopeLabel,
      changes,
      note,
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
    if (prop === 'box-shadow') return getShadowChangeDisplay(shadowVal, shadowAuthoredVal, shadowTokens);
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
    if (pendingShadow)      add('box-shadow', getShadowChangeDisplay(shadowVal, shadowAuthoredVal, shadowTokens), getShadowChangeDisplay(pendingShadow, pendingShadow, shadowTokens));
    if (pendingPadding)     add('padding', paddingVal, pendingPadding);
    if (pendingMargin)      add('margin', marginVal, pendingMargin);
    if (pendingGap)         add('gap', gapVal, pendingGap);
    if (pendingTranslate)   add('translate', formatTranslate(translateVal), formatTranslate(pendingTranslate));
    if (pendingWidth)       add('width', widthVal, pendingWidth);
    if (pendingHeight)      add('height', heightVal, pendingHeight);
    if (pendingComponentText !== null && pendingComponentText !== componentTextVal) {
      add('component-text', componentTextVal || '空', pendingComponentText || '空');
    }
    for (const [slotKey, nextValue] of Object.entries(pendingComponentTextSlots)) {
      const fromValue = componentTextSlotVals[slotKey] ?? '空';
      add(`component-slot:${slotKey}`, fromValue || '空', nextValue || '空');
    }
    if (pendingComponentVariant) {
      add('component-variant', componentVariantVal, pendingComponentVariant);
    }
    if (pendingComponentSize) {
      add('component-size', componentSizeVal.toUpperCase(), pendingComponentSize.toUpperCase());
    }
    if (pendingIconColor) {
      add('component-color', iconColorVal, pendingIconColor);
    }
    if (pendingBadgeTone) {
      add('component-tone', badgeToneVal, pendingBadgeTone);
    }
    if (pendingCardVariant) {
      const fromLabel = CARD_VARIANT_OPTIONS.find(option => option.key === cardVariantVal)?.label ?? cardVariantVal;
      const toLabel = CARD_VARIANT_OPTIONS.find(option => option.key === pendingCardVariant)?.label ?? pendingCardVariant;
      add('component-variant', fromLabel, toLabel);
    }
    if (pendingNewToken)    add('token', '新增', `${pendingNewToken.cssVar}: ${pendingNewToken.value}`);
    return records;
  }

  useEffect(() => {
    const el = selectedRef.current;
    if (!el) return;
    const changes = getPendingChangeRecords();
    if (changes.length === 0) return;
    const info = getDraftTargetInfo(el);
    setLocalDrafts(prev => {
      const existing = prev[info.key];
      const existingByProp = new Map(existing?.changes.map(change => [change.prop, change]) ?? []);
      const mergedByProp = new Map<string, LocalDraftChange>();
      existing?.changes.forEach(change => mergedByProp.set(change.prop, change));
      changes.forEach(change => {
        const previous = existingByProp.get(change.prop);
        mergedByProp.set(change.prop, {
          ...change,
          from: previous?.from ?? change.from,
        });
      });
      const mergedChanges = Array.from(mergedByProp.values());
      const comparableExisting = existing
        ? {
            key: existing.key,
            selector: existing.selector,
            targetLabel: existing.targetLabel,
            scopeLabel: existing.scopeLabel,
            changes: existing.changes,
          }
        : null;
      const comparableNext = { ...info, changes: mergedChanges };
      if (JSON.stringify(comparableExisting) === JSON.stringify(comparableNext)) return prev;
      const nextEntry: LocalDraftEntry = {
        ...info,
        changes: mergedChanges,
        updatedAt: Date.now(),
      };
      return { ...prev, [info.key]: nextEntry };
    });
  });

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
      'component-text': '组件文案',
      'component-variant': '组件变体',
      'component-size': '组件尺寸',
      'component-color': '组件颜色',
      'component-tone': '组件色调',
    };
    if (prop.startsWith('component-slot:')) {
      const slotKey = prop.replace('component-slot:', '');
      const slotLabel = componentCapability?.textSlots?.find(slot => slot.key === slotKey)?.label ?? slotKey;
      return `组件内容 · ${slotLabel}`;
    }
    return map[prop] || prop;
  }

  function clearPendingForProp(prop: string) {
    if (prop === 'font-size') setPendingFontSize('');
    else if (prop === 'font-weight') setPendingFontWeight('');
    else if (prop === 'color') setPendingTextColor('');
    else if (prop === 'background-color') {
      setPendingColors(prev => {
        const next = { ...prev };
        delete next[prop];
        return next;
      });
    } else if (prop === 'border-color') setPendingBorderColor('');
    else if (prop === 'border-width') setPendingBorderWidth('');
    else if (prop === 'border-style') setPendingBorderStyle('');
    else if (prop === 'border-radius') setPendingRadius('');
    else if (prop === 'box-shadow') {
      setPendingShadow('');
      setShadowCustomMode(false);
    } else if (prop === 'padding') setPendingPadding('');
    else if (prop === 'margin') setPendingMargin('');
    else if (prop === 'gap') setPendingGap('');
    else if (prop === 'translate') setPendingTranslate(null);
    else if (prop === 'width') {
      setPendingWidth('');
      setPendingWidthMode(null);
      setSizeDraft(prev => {
        const next = { ...prev };
        delete next.width;
        return next;
      });
    } else if (prop === 'height' || prop === 'min-height' || prop === 'max-height') {
      setPendingHeight('');
      setPendingHeightMode(null);
      setSizeDraft(prev => {
        const next = { ...prev };
        delete next.height;
        return next;
      });
    } else if (prop === 'component-text') {
      setPendingComponentText(null);
      setComponentTextDraft(componentTextVal);
      getComponentContentTargets().forEach(target => { target.textContent = componentTextVal; });
    } else if (prop.startsWith('component-slot:')) {
      const slotKey = prop.replace('component-slot:', '');
      setPendingComponentTextSlots(prev => {
        const next = { ...prev };
        delete next[slotKey];
        return next;
      });
      setComponentTextSlotDrafts(prev => ({ ...prev, [slotKey]: componentTextSlotVals[slotKey] ?? '' }));
      const slot = componentCapability?.textSlots?.find(item => item.key === slotKey);
      if (slot) {
        getComponentContentTargets().forEach(target => {
          const slotEl = getComponentSlotElement(target, slot);
          if (slotEl) slotEl.textContent = componentTextSlotVals[slot.key] ?? '';
        });
      }
    } else if (prop === 'component-variant') {
      setPendingComponentVariant('');
      setPendingCardVariant('');
    } else if (prop === 'component-size') {
      setPendingComponentSize('');
    } else if (prop === 'component-color') {
      setPendingIconColor('');
    } else if (prop === 'component-tone') {
      setPendingBadgeTone('');
    }
  }

  function getDraftSelectorTargets(selector: string): Element[] {
    try {
      return Array.from(document.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  function resetDraftChangeOnPage(draft: LocalDraftEntry, change: LocalDraftChange) {
    const isCurrentDraft = selectedRef.current ? getDraftTargetInfo(selectedRef.current).key === draft.key : false;
    if (isCurrentDraft) clearPendingForProp(change.prop);

    const targets = getDraftSelectorTargets(draft.selector);
    if (change.prop === 'component-text') {
      targets.forEach(target => { target.textContent = change.from === '空' ? '' : change.from; });
      return;
    }
    if (change.prop.startsWith('component-slot:')) return;
    if (change.prop.startsWith('component-')) {
      if (isCurrentDraft) {
        const currentTargets = getComponentTargets();
        if (change.prop === 'component-variant') {
          setButtonVariantOnTargets(currentTargets, componentVariantVal, componentVariantClassVal);
          setCardVariantOnTargets(currentTargets, cardVariantVal, cardVariantClassVal);
        } else if (change.prop === 'component-size') {
          clearButtonSizeOnTargets(currentTargets);
          clearIconSizeOnTargets(currentTargets);
          clearBadgeSizeOnTargets(currentTargets);
        } else if (change.prop === 'component-color') {
          clearIconColorOnTargets(currentTargets);
        } else if (change.prop === 'component-tone') {
          setBadgeToneOnTargets(currentTargets, badgeToneVal, badgeToneClassVal);
        }
      }
      return;
    }

    targets.forEach(target => {
      const hEl = target as HTMLElement;
      hEl.style.removeProperty(change.prop);
      if (change.prop === 'height') {
        hEl.style.removeProperty('min-height');
        hEl.style.removeProperty('max-height');
      }
    });
    if (change.prop === 'gap' && isCurrentDraft && gapTargetRef.current) {
      gapTargetRef.current.style.removeProperty('gap');
    }
  }

  function handleDeleteLocalDraft(key: string) {
    const draft = localDraftsRef.current[key];
    if (draft) draft.changes.forEach(change => resetDraftChangeOnPage(draft, change));
    removeLocalDraftEntry(key);
  }

  function handleResetLocalDraftChange(key: string, prop: string) {
    const draft = localDraftsRef.current[key];
    const change = draft?.changes.find(item => item.prop === prop);
    if (!draft || !change) return;
    resetDraftChangeOnPage(draft, change);
    setLocalDrafts(prev => {
      const current = prev[key];
      if (!current) return prev;
      const remaining = current.changes.filter(item => item.prop !== prop);
      const next = { ...prev };
      if (remaining.length === 0) {
        delete next[key];
      } else {
        next[key] = { ...current, changes: remaining, updatedAt: Date.now() };
      }
      return next;
    });
  }

  // ─── 取消 ────────────────────────────────────────────────────
  function handleReset() {
    const el = selectedRef.current;
    if (!el) return;
    // 还原所有 inline style 改动
    const targets = getScopeTargets(el, scope);
    if (pendingComponentText !== null) {
      getComponentContentTargets().forEach(t => { t.textContent = componentTextVal; });
    }
    const meta = getInspectorComponentMeta(el);
    const capability = getComponentCapability(meta);
    for (const slot of capability?.textSlots ?? []) {
      if (!(slot.key in pendingComponentTextSlots)) continue;
      getComponentContentTargets().forEach(t => {
        const slotEl = getComponentSlotElement(t, slot);
        if (slotEl) slotEl.textContent = componentTextSlotVals[slot.key] ?? '';
      });
    }
    if (pendingComponentVariant) {
      setButtonVariantOnTargets(targets, componentVariantVal, componentVariantClassVal);
    }
    if (pendingComponentSize) {
      clearButtonSizeOnTargets(targets);
      clearIconSizeOnTargets(targets);
      clearBadgeSizeOnTargets(targets);
    }
    if (pendingIconColor) {
      clearIconColorOnTargets(targets);
    }
    if (pendingBadgeTone) {
      setBadgeToneOnTargets(targets, badgeToneVal, badgeToneClassVal);
    }
    if (pendingCardVariant) {
      setCardVariantOnTargets(targets, cardVariantVal, cardVariantClassVal);
    }
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
    if (pendingGap && gapTargetRef.current) {
      gapTargetRef.current.style.removeProperty('gap');
    }
    setPendingColors({});
    setPendingRadius('');
    setPendingShadow('');
    setShadowCustomMode(false);
    setShowShadowColorDrop(false);
    setPendingFontSize(''); setPendingFontWeight(''); setPendingTextColor('');
    setPendingBorderColor(''); setPendingBorderWidth(''); setPendingBorderStyle('');
    setContainerCustomMode(false);
    setShowContainerStyleDrop(false);
    setShowBorderWidthDrop(false);
    setShowRadiusDrop(false);
    setPendingPadding(''); setPendingMargin(''); setPendingGap('');
    setSpaceCustomModes({ padding: false, margin: false, gap: false });
    setPendingTranslate(null); setPendingWidth(''); setPendingHeight('');
    setPendingWidthMode(null); setPendingHeightMode(null);
    setSizeDraft({});
    setComponentTextDraft(componentTextVal);
    setComponentTextSlotDrafts(componentTextSlotVals);
    setPendingComponentText(null);
    setPendingComponentTextSlots({});
    setPendingComponentVariant('');
    setPendingComponentSize('');
    setPendingIconColor('');
    setPendingBadgeTone('');
    setPendingCardVariant('');
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
    removeLocalDraftEntry(getDraftTargetInfo(el).key);
  }

  function handleClose() {
    onClose();
  }

  const componentMeta = getInspectorComponentMeta(selected);
  const componentCapability = getComponentCapability(componentMeta);
  const componentEditableSlots = componentCapability?.textSlots ?? [];
  const componentChildSlots = componentCapability?.childSlots ?? [];
  const visibleChildSlots = componentChildSlots
    .map(slot => ({ slot, value: componentChildSlotVals[slot.key] ?? '', element: getComponentSlotElement(selected, slot) }))
    .filter(item => item.element);
  const hasComponentAttrPending = pendingComponentText !== null
    || Object.keys(pendingComponentTextSlots).length > 0
    || !!pendingComponentVariant
    || !!pendingComponentSize
    || !!pendingIconColor
    || !!pendingBadgeTone
    || !!pendingCardVariant;
  const componentSelector = componentMeta && hasComponentAttrPending && componentSelectorVal
    ? componentSelectorVal
    : getSelectorForScope(selected, 'component');
  const componentDisplayName = componentMeta ? getComponentDisplayName(componentMeta) : '';
  const isTextOnlyTarget = !componentMeta && TEXT_ONLY_TAGS.has(selected.tagName.toLowerCase());
  const activeButtonVariant = pendingComponentVariant || componentVariantVal;
  const activeButtonSize = pendingComponentSize || componentSizeVal;
  const activeIconColor = pendingIconColor || iconColorVal;
  const activeBadgeTone = pendingBadgeTone || badgeToneVal;
  const activeCardVariant = pendingCardVariant || cardVariantVal;
  const componentSizeOptions = getComponentSizeControlOptions(componentCapability);
  const showElementStyleSections = !componentMeta;
  const localDraftEntries = Object.values(localDrafts).sort((a, b) => b.updatedAt - a.updatedAt);
  const localDraftChangeCount = localDraftEntries.reduce((sum, entry) => sum + entry.changes.length, 0);

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
                  相同元素 = 与当前选中对象属于同一组件或同一基础元素的一组对象；会忽略 selected、disabled、floating 等状态或变体差异。
                </div>
              )}
              <div className="di-scope-row">
                <button className={`di-scope-btn${scope === 'current' ? ' di-scope-btn--on' : ''}`} onClick={() => setScope('current')}>当前元素</button>
                <button className={`di-scope-btn${scope === 'component' ? ' di-scope-btn--on' : ''}`} onClick={() => setScope('component')}>
                  相同元素 {selected && <span className="di-scope-count">{getSameComponentEls(selected).length}</span>}
                </button>
              </div>
            </div>

            {componentMeta && (
              <div className="di-section">
                <div className="di-section-title">组件</div>
                <div className="di-component-card">
                  <div className="di-component-head">
                    <div className="di-component-main">
                      <span className="di-component-name">{componentDisplayName}</span>
                    </div>
                    <button
                      type="button"
                      className="di-component-locator"
                      title={`复制定位：${componentSelector}`}
                      onClick={() => {
                        copyTextToClipboard(componentSelector)
                          .then(copied => {
                            setLocatorMsg(copied ? '已复制' : '复制失败');
                            setTimeout(() => setLocatorMsg(''), 1400);
                          })
                          .catch(() => {
                            setLocatorMsg('复制失败');
                            setTimeout(() => setLocatorMsg(''), 1400);
                          });
                      }}
                    >
                      {locatorMsg || '定位'}
                    </button>
                  </div>
                  <div className="di-component-meta-row">
                    <span>变体：{componentMeta.variant}</span>
                    <span>状态：{componentMeta.state}</span>
                  </div>
                  {componentCapability && (
                    <div className="di-component-fields">
                      {componentEditableSlots.map(slot => (
                        <label className="di-component-field di-component-field--text" key={slot.key}>
                          <span>{slot.label}</span>
                          <input
                            className="di-component-text-input"
                            value={componentTextSlotDrafts[slot.key] ?? ''}
                            onChange={event => updateComponentTextSlot(slot, event.currentTarget.value)}
                          />
                        </label>
                      ))}
                      {visibleChildSlots.length > 0 && (
                        <div className="di-component-field di-component-field--children">
                          <span>{visibleChildSlots.length === 1 ? visibleChildSlots[0].slot.label : '可选项'}</span>
                          <div className="di-component-child-list">
                            {visibleChildSlots.map(({ slot, value, element }) => {
                              const childMeta = element ? getInspectorComponentMeta(element) : null;
                              const childName = childMeta ? getComponentDisplayName(childMeta) : slot.label;
                              const childValue = value || childMeta?.variant || childName;
                              const showChildLabel = visibleChildSlots.length > 1;
                              return (
                              <div className={`di-component-child-item${showChildLabel ? ' di-component-child-item--with-label' : ''}`} key={slot.key}>
                                {showChildLabel && <span className="di-component-child-label">{slot.label}</span>}
                                <span className="di-component-child-value">{childValue}</span>
                                <button
                                  type="button"
                                  className="di-component-child-select"
                                  onClick={() => { if (element) selectEl(element); }}
                                  title={`选择 ${childName}`}
                                >
                                  选择
                                </button>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {componentCapability.editableText && (
                        <label className="di-component-field di-component-field--text">
                          <span>文案</span>
                          <input
                            className="di-component-text-input"
                            value={componentTextDraft}
                            onChange={event => updateComponentText(event.currentTarget.value)}
                          />
                        </label>
                      )}
                      {componentCapability.variantKind === 'button' && (
                        <div className="di-component-field">
                          <span>变体</span>
                          <div className="di-component-segment" role="group" aria-label="按钮变体">
                            {BUTTON_VARIANT_OPTIONS.map(option => (
                              <button
                                key={option.key}
                                type="button"
                                className={`di-component-segment-btn${activeButtonVariant === option.key ? ' di-component-segment-btn--on' : ''}`}
                                onClick={() => updateComponentVariant(option.key)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {componentCapability.variantKind === 'card' && (
                        <div className="di-component-field">
                          <span>变体</span>
                          <div className="di-component-segment" role="group" aria-label="卡片变体">
                            {CARD_VARIANT_OPTIONS.map(option => (
                              <button
                                key={option.key}
                                type="button"
                                className={`di-component-segment-btn${activeCardVariant === option.key ? ' di-component-segment-btn--on' : ''}`}
                                onClick={() => updateCardVariant(option.key)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {componentCapability.colorKind === 'icon' && (
                        <div className="di-component-field">
                          <span>颜色</span>
                          <div className="di-component-segment di-component-segment--tone" role="group" aria-label="图标颜色">
                            {ICON_COLOR_OPTIONS.map(option => (
                              <button
                                key={option.key}
                                type="button"
                                className={`di-component-segment-btn${activeIconColor === option.key ? ' di-component-segment-btn--on' : ''}`}
                                onClick={() => updateIconColor(option.key)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {componentCapability.toneKind === 'badge' && (
                        <div className="di-component-field">
                          <span>色调</span>
                          <div className="di-component-segment di-component-segment--tone" role="group" aria-label="标签色调">
                            {BADGE_TONE_OPTIONS.map(option => (
                              <button
                                key={option.key}
                                type="button"
                                className={`di-component-segment-btn${activeBadgeTone === option.key ? ' di-component-segment-btn--on' : ''}`}
                                onClick={() => updateBadgeTone(option.key)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {componentCapability.sizeKind && (
                        <div className="di-component-field">
                          <span>尺寸</span>
                          <div className="di-component-segment di-component-segment--size" role="group" aria-label="组件尺寸">
                            {componentSizeOptions.map(option => (
                              <button
                                key={option.key}
                                type="button"
                                className={`di-component-segment-btn${activeButtonSize === option.key ? ' di-component-segment-btn--on' : ''}`}
                                onClick={() => updateComponentSize(option.key)}
                                title={option.title}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {componentMeta && (
              <div className="di-section">
                <div className="di-section-title">外部布局</div>
                <div className="di-layout-grid">
                  <div className="di-layout-card di-layout-card--position">
                    <div className="di-layout-card-title">位置</div>
                    <div className="di-position-fields" aria-label="移动组件">
                      {([
                        { key: 'x', label: 'X', value: (pendingTranslate ?? translateVal).x },
                        { key: 'y', label: 'Y', value: (pendingTranslate ?? translateVal).y },
                      ] as const).map(item => (
                        <div className="di-position-row" key={item.key}>
                          <span className="di-position-axis">{item.label}</span>
                          <div className="di-number-stepper">
                            <input
                              className="di-position-value di-number-stepper-input"
                              value={`${Math.round(item.value)}px`}
                              aria-label={`${item.label} 位置`}
                              onChange={event => setTranslateAxis(item.key, event.currentTarget.value)}
                              onFocus={event => event.currentTarget.select()}
                              onClick={event => event.currentTarget.select()}
                              onMouseUp={event => event.preventDefault()}
                            />
                            <div className="di-number-stepper-buttons">
                              <button type="button" onClick={() => stepTranslateAxis(item.key, 1)} aria-label={`${item.label} 增加 1px`}>⌃</button>
                              <button type="button" onClick={() => stepTranslateAxis(item.key, -1)} aria-label={`${item.label} 减少 1px`}>⌄</button>
                            </div>
                          </div>
                        </div>
                      ))}
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
                          <div className="di-number-stepper">
                            <input
                              className="di-size-value di-number-stepper-input"
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
                            <div className="di-number-stepper-buttons">
                              <button type="button" onClick={() => stepSize(item.key, inputVal, 1)} aria-label={`${item.label} 增加 1px`}>⌃</button>
                              <button type="button" onClick={() => stepSize(item.key, inputVal, -1)} aria-label={`${item.label} 减少 1px`}>⌄</button>
                            </div>
                          </div>
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
            )}

            {showElementStyleSections && (
              <>
            {/* 文字区（内容 + 一行式文字工具条） */}
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
              {/* 文字样式：组件化预设 + 单项覆盖 */}
              {(() => {
                const curSize = pendingFontSize || fontSizeVal || '—';
                const curWeight = pendingFontWeight || fontWeightVal;
                const curColor = pendingTextColor || textColorVal;
                const curStyle = getTypographyStyle(curSize, curWeight, curColor, typographyStyles, typographyTokens);
                const showTypographyCustomControls = typographyCustomMode || !curStyle;
                const sizeOptions = fontSizeOptions ?? [];
                const curSizeOpt = sizeOptions.find(opt => opt.value === curSize);
                const curWeightOpt = fontWeightOptions.find(o => o.value === curWeight) ?? fontWeightOptions[1];
                const { label: tcLabel, sub: tcSub, isHardcoded: tcHard } = getDisplayLabel(curColor, tokenMap, colorPalette, tokenLabels);
                const tcDark = (() => {
                  const m = curColor.match(/^#([0-9a-f]{6})$/i);
                  if (!m) return true;
                  const r = parseInt(m[1].slice(0,2),16);
                  const g = parseInt(m[1].slice(2,4),16);
                  const b = parseInt(m[1].slice(4,6),16);
                  return (r*299 + g*587 + b*114) / 1000 < 128;
                })();
                const chevron = (
                  <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true">
                    <path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                );

                return (
                  <div className={`di-typography-toolbar${showTypographyCustomControls ? ' di-typography-toolbar--custom' : ''}`}>
                    <div className="di-typography-control-wrap">
                      <button
                        className={`di-typography-control ${showTypographyCustomControls ? 'di-typography-control--custom-state' : 'di-typography-control--style-compact'}`}
                        type="button"
                        title={showTypographyCustomControls ? '当前为自定义样式，点击可切换预设' : '文字样式'}
                        onClick={e => {
                          const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                          setDropPos(calcDropPos(r));
                          setShowFontSizeDrop(false);
                          setShowWeightDrop(false);
                          setExpandedTextColor(false);
                          setShowTypographyStyleDrop(v=>!v);
                        }}
                      >
                        {showTypographyCustomControls ? (
                          <span className="di-token-name--plain">自定义样式</span>
                        ) : (
                          <>
                            <span className="di-token-name">{curStyle?.label}</span>
                            {chevron}
                          </>
                        )}
                      </button>
                      {showTypographyStyleDrop && (
                        <>
                          <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={()=>setShowTypographyStyleDrop(false)} />
                          <div className="di-border-style-drop di-typography-style-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                            {typographyStyles.map(style => (
                              <button key={style.key}
                                className={`di-border-style-drop-item${!showTypographyCustomControls && curStyle?.key===style.key?' di-border-style-drop-item--on':''}`}
                                onClick={() => {
                                  applyTypographyStyle(style);
                                  setShowTypographyStyleDrop(false);
                                }}>
                                <span className="di-border-style-label">{style.label}</span>
                                <span className="di-typography-style-drop-meta">
                                  <span className="di-border-style-name">{`${style.value} / ${style.fontWeight}`}</span>
                                  <span className="di-shadow-drop-value">{style.colorVar || style.color}</span>
                                </span>
                              </button>
                            ))}
                            {showTypographyCustomControls ? (
                              <div className="di-typography-custom-note">
                                <span className="di-border-style-label">自定义模式</span>
                                <span className="di-shadow-drop-value">使用右侧字号 / 字重 / 颜色单项调整</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="di-typography-custom-action"
                                onClick={() => {
                                  setTypographyCustomMode(true);
                                  setShowTypographyStyleDrop(false);
                                }}
                              >
                                <span className="di-border-style-label">基于当前样式自定义</span>
                                <span className="di-shadow-drop-value">进入字号 / 字重 / 颜色单项调整</span>
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {showTypographyCustomControls ? (
                      <>
                    <div className="di-typography-control-wrap">
                      <button
                        className={`di-typography-control di-typography-control--size${curSizeOpt ? ' di-typography-control--size-token' : ''}`}
                        type="button"
                        title="字号"
                        onClick={e => {
                          const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                          setDropPos(calcDropPos(r));
                          setShowTypographyStyleDrop(false);
                          setShowWeightDrop(false);
                          setExpandedTextColor(false);
                          setShowStyleDrop(false);
                          setExpandedBorderColor(false);
                          setShowShadowDrop(false);
                          setCustomRadius('');
                          setSizeDraft({});
                          setFontSizeCustomDraft(curSize === '—' ? '' : curSize);
                          setShowFontSizeDrop(v=>!v);
                        }}
                      >
                        {curSizeOpt && <span className="di-border-style-label">{curSizeOpt.label}</span>}
                        <span className="di-typography-control-value">{curSize}</span>
                        {chevron}
                      </button>
                      {showFontSizeDrop && (
                        <>
                          <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={()=>setShowFontSizeDrop(false)} />
                          <div className="di-border-style-drop di-typography-size-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                            {sizeOptions.map(opt => (
                              <button key={opt.value}
                                className={`di-border-style-drop-item${curSizeOpt?.value===opt.value?' di-border-style-drop-item--on':''}`}
                                onClick={() => {
                                  setTypographyCustomMode(true);
                                  setPendingFontSize(opt.value);
                                  liveApply('font-size', opt.value);
                                  setShowFontSizeDrop(false);
                                }}>
                                <span className="di-border-style-label">{opt.label}</span>
                                <span className="di-border-style-name">{opt.value}</span>
                              </button>
                            ))}
                            <div className="di-dropdown-custom">
                              <input
                                className="di-dropdown-custom-input"
                                value={fontSizeCustomDraft}
                                placeholder="13px"
                                onChange={(e) => {
                                  const draft = e.target.value;
                                  const next = normalizeCssLengthInput(draft);
                                  setFontSizeCustomDraft(draft);
                                  if (!next || !supportsCssValue('font-size', next)) return;
                                  setTypographyCustomMode(true);
                                  setPendingFontSize(next);
                                  liveApply('font-size', next);
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const next = normalizeCssLengthInput(fontSizeCustomDraft);
                                    if (!next || !supportsCssValue('font-size', next)) return;
                                    setTypographyCustomMode(true);
                                    setPendingFontSize(next);
                                    liveApply('font-size', next);
                                    setShowFontSizeDrop(false);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="di-dropdown-custom-apply"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = normalizeCssLengthInput(fontSizeCustomDraft);
                                  if (!next || !supportsCssValue('font-size', next)) return;
                                  setTypographyCustomMode(true);
                                  setPendingFontSize(next);
                                  liveApply('font-size', next);
                                  setShowFontSizeDrop(false);
                                }}
                              >
                                应用
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="di-typography-control-wrap">
                      <button
                        className="di-typography-control di-typography-control--weight"
                        type="button"
                        title="字重"
                        onClick={e => {
                          const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                          setDropPos(calcDropPos(r));
                          setShowTypographyStyleDrop(false);
                          setShowFontSizeDrop(false);
                          setExpandedTextColor(false);
                          setShowWeightDrop(v=>!v);
                        }}
                      >
                        <span className="di-border-style-label" style={curWeightOpt.value === 'none' ? { color: '#9ca3af' } : undefined}>{curWeightOpt.label}</span>
                        <span className="di-typography-control-value">{curWeight}</span>
                        {chevron}
                      </button>
                      {showWeightDrop && (
                        <>
                          <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={()=>setShowWeightDrop(false)} />
                          <div className="di-border-style-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                            {fontWeightOptions.map(opt => (
                              <button key={opt.value}
                                className={`di-border-style-drop-item${curWeight===opt.value?' di-border-style-drop-item--on':''}`}
                                onClick={() => { setTypographyCustomMode(true); setPendingFontWeight(opt.value); liveApply('font-weight',opt.value); setShowWeightDrop(false); }}>
                                <span className="di-border-style-label" style={opt.value === 'none' ? { color: '#9ca3af' } : undefined}>{opt.label}</span>
                                <span className="di-border-style-name">{opt.value}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="di-typography-control-wrap">
                      <button
                        className="di-typography-control di-typography-control--color"
                        type="button"
                        title="颜色"
                        onClick={e => {
                          const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                          setDropPos(calcDropPos(r));
                          setShowTypographyStyleDrop(false);
                          setShowFontSizeDrop(false);
                          setShowWeightDrop(false);
                          setExpandedTextColor(v=>!v);
                        }}
                      >
                        <span className={`di-typography-color-swatch${tcDark?' di-typography-color-swatch--dark':''}`} style={{ background: curColor || '#1d293d' }}>
                          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                            <path d="M1 1l4 4 4-4" stroke={tcDark?'#fff':'#374151'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </span>
                        <span className="di-typography-color-copy">
                          <span className={tcHard?'di-token-name--plain':'di-token-name'}>{tcLabel}</span>
                          {tcSub && <span className="di-hex">{tcSub}</span>}
                        </span>
                      </button>
                      {expandedTextColor && (
                        <ColorDropdown value={curColor} pos={dropPos} colorPalette={colorPalette}
                          onChange={c=>{ setTypographyCustomMode(true); setPendingTextColor(c); liveApply('color',c); }}
                          onClose={()=>setExpandedTextColor(false)}
                          onAddToken={v=>handleAddToken(v,'color')}
                        />
                      )}
                    </div>
                      </>
                    ) : (
                      <div className="di-typography-readout" aria-label="当前组件文字样式参数">
                        <span className="di-typography-readout-line">{`${curSize} / ${curWeight}`}</span>
                        <span className="di-typography-readout-token">{curStyle?.colorVar || curColor}</span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* 容器区 */}
            {!isTextOnlyTarget && (
            <div className="di-section">
              <div className="di-section-title">容器</div>
              {(() => {
                const curBackgroundColor = pendingColors['background-color'] ?? colors['background-color'] ?? 'transparent';
                const curBorderWidth = pendingBorderWidth || borderWidthVal || '0px';
                const curBorderStyleValue = pendingBorderStyle || borderStyleVal || 'none';
                const curBorderColor = pendingBorderColor || borderColorVal || 'transparent';
                const curBorderRadius = pendingRadius || radiusVal || '0px';
                const curContainerPreset = getContainerStyle(curBackgroundColor, curBorderWidth, curBorderStyleValue, curBorderColor, curBorderRadius, containerStyles);
                const showContainerCustomControls = containerCustomMode || !curContainerPreset;
                const curLineOpt = BORDER_STYLE_OPTIONS.find(o => o.value === curBorderStyleValue) ?? BORDER_STYLE_OPTIONS[0];
                const curRadiusPreset = matchPreset(radiusPresets, curBorderRadius);
                const { label: backgroundLabel, sub: backgroundSub, isHardcoded: backgroundHard } = getDisplayLabel(curBackgroundColor, tokenMap, colorPalette, tokenLabels);
                const { label: borderColorLabel, sub: borderColorSub, isHardcoded: borderColorHard } = getDisplayLabel(curBorderColor, tokenMap, colorPalette, tokenLabels);
                const backgroundDark = (() => {
                  const m = curBackgroundColor.match(/^#([0-9a-f]{6})$/i);
                  if (!m) return false;
                  const r = parseInt(m[1].slice(0,2),16);
                  const g = parseInt(m[1].slice(2,4),16);
                  const b = parseInt(m[1].slice(4,6),16);
                  return (r*299 + g*587 + b*114) / 1000 < 128;
                })();
                const borderColorDark = (() => {
                  const m = curBorderColor.match(/^#([0-9a-f]{6})$/i);
                  if (!m) return false;
                  const r = parseInt(m[1].slice(0,2),16);
                  const g = parseInt(m[1].slice(2,4),16);
                  const b = parseInt(m[1].slice(4,6),16);
                  return (r*299 + g*587 + b*114) / 1000 < 128;
                })();
                const backgroundIsEmpty = curBackgroundColor === 'transparent' || !curBackgroundColor;
                const borderColorIsEmpty = curBorderColor === 'transparent' || !curBorderColor;
                const borderSummary = `${curBorderWidth} / ${curLineOpt.title} / ${curBorderRadius}`;
                const containerSummary = `${backgroundLabel} / ${borderSummary}`;
                const chevron = (
                  <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true">
                    <path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                );
                const ensureVisibleBorder = () => {
                  if (curBorderWidth === '0px') {
                    setPendingBorderWidth('1px');
                    liveApply('border-width', '1px');
                  }
                  if (curBorderStyleValue === 'none') {
                    setPendingBorderStyle('solid');
                    liveApply('border-style', 'solid');
                  }
                };

                return (
                  <div className={`di-container-toolbar${showContainerCustomControls ? ' di-container-toolbar--custom' : ''}`}>
                    <div className="di-typography-control-wrap">
                      <button
                        className="di-typography-control di-typography-control--style-compact"
                        type="button"
                        title="容器样式"
                        onClick={e => {
                          const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                          setDropPos(calcDropPos(r));
                          setExpandedBorderColor(false);
                          setShowBorderWidthDrop(false);
                          setShowStyleDrop(false);
                          setShowRadiusDrop(false);
                          setShowContainerStyleDrop(v=>!v);
                        }}
                      >
                        <span className={!showContainerCustomControls ? 'di-token-name' : 'di-token-name--plain'}>
                          {!showContainerCustomControls ? curContainerPreset?.label : '自定义'}
                        </span>
                        {chevron}
                      </button>
                      {showContainerStyleDrop && (
                        <>
                          <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={()=>setShowContainerStyleDrop(false)} />
                          <div className="di-border-style-drop di-container-preset-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                            {containerStyles.map(style => (
                              <button key={style.key}
                                className={`di-border-style-drop-item${!showContainerCustomControls && curContainerPreset?.key===style.key?' di-border-style-drop-item--on':''}`}
                                onClick={() => {
                                  applyContainerStyle(style);
                                  setShowContainerStyleDrop(false);
                                }}>
                                <span className="di-border-style-label">{style.label}</span>
                                <span className="di-typography-style-drop-meta">
                                  <span className="di-border-style-name">{`${style.backgroundVar || style.backgroundColor} / ${style.borderWidth} ${BORDER_STYLE_OPTIONS.find(o => o.value === style.borderStyle)?.title ?? style.borderStyle} / ${style.borderRadius}`}</span>
                                  <span className="di-shadow-drop-value">{style.colorVar || style.borderColor}</span>
                                </span>
                              </button>
                            ))}
                            <button
                              type="button"
                              className={`di-border-style-drop-item${showContainerCustomControls ? ' di-border-style-drop-item--on' : ''}`}
                              onClick={() => {
                                setContainerCustomMode(true);
                                setShowContainerStyleDrop(false);
                              }}
                            >
                              <span className="di-border-style-label">自定义</span>
                              <span className="di-typography-style-drop-meta">
                                <span className="di-border-style-name">{containerSummary}</span>
                                <span className="di-shadow-drop-value">使用右侧单项调整</span>
                              </span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {showContainerCustomControls ? (
                      <>
                        <div className="di-typography-control-wrap">
                          <button
                            className="di-typography-control di-typography-control--color"
                            type="button"
                            title="背景色"
                            onClick={e => {
                              const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                              setDropPos(calcDropPos(r));
                              setShowContainerStyleDrop(false);
                              setExpandedBorderColor(false);
                              setShowBorderWidthDrop(false);
                              setShowStyleDrop(false);
                              setShowRadiusDrop(false);
                              setExpandedColor(expandedColor === 'background-color' ? null : 'background-color');
                            }}
                          >
                            <span
                              className={`di-typography-color-swatch${backgroundDark?' di-typography-color-swatch--dark':''}${backgroundIsEmpty ? ' di-swatch-btn--empty' : ''}`}
                              style={{ background: backgroundIsEmpty ? undefined : curBackgroundColor }}
                            >
                              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                                <path d="M1 1l4 4 4-4" stroke={backgroundIsEmpty ? '#9ca3af' : backgroundDark?'#fff':'#374151'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                            <span className="di-typography-color-copy">
                              <span className={backgroundHard || backgroundIsEmpty ? 'di-token-name--plain':'di-token-name'}>{backgroundIsEmpty ? '未设置' : backgroundLabel}</span>
                              {backgroundSub && !backgroundIsEmpty && <span className="di-hex">{backgroundSub}</span>}
                            </span>
                          </button>
                          {expandedColor === 'background-color' && (
                            <ColorDropdown value={backgroundIsEmpty ? '' : curBackgroundColor} pos={dropPos} colorPalette={colorPalette}
                              onChange={c => {
                                setContainerCustomMode(true);
                                setPendingColors(prev => ({ ...prev, 'background-color': c }));
                                liveApply('background-color', c);
                              }}
                              onClose={() => setExpandedColor(null)}
                              onAddToken={v=>handleAddToken(v,'background-color')}
                            />
                          )}
                        </div>

                        <div className="di-typography-control-wrap">
                          <button
                            className="di-typography-control di-typography-control--color"
                            type="button"
                            title="边框颜色"
                            onClick={e => {
                              const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                              setDropPos(calcDropPos(r));
                              setShowContainerStyleDrop(false);
                              setExpandedColor(null);
                              setShowBorderWidthDrop(false);
                              setShowStyleDrop(false);
                              setShowRadiusDrop(false);
                              setExpandedBorderColor(v=>!v);
                            }}
                          >
                            <span
                              className={`di-typography-color-swatch${borderColorDark?' di-typography-color-swatch--dark':''}${borderColorIsEmpty ? ' di-swatch-btn--empty' : ''}`}
                              style={{ background: borderColorIsEmpty ? undefined : curBorderColor }}
                            >
                              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
                                <path d="M1 1l4 4 4-4" stroke={borderColorIsEmpty ? '#9ca3af' : borderColorDark?'#fff':'#374151'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                            <span className="di-typography-color-copy">
                              <span className={borderColorHard || borderColorIsEmpty ? 'di-token-name--plain':'di-token-name'}>{borderColorIsEmpty ? '未设置' : borderColorLabel}</span>
                              {borderColorSub && !borderColorIsEmpty && <span className="di-hex">{borderColorSub}</span>}
                            </span>
                          </button>
                          {expandedBorderColor && (
                            <ColorDropdown value={borderColorIsEmpty ? '' : curBorderColor} pos={dropPos} colorPalette={colorPalette}
                              onChange={c => {
                                setContainerCustomMode(true);
                                setPendingBorderColor(c);
                                liveApply('border-color', c);
                                ensureVisibleBorder();
                              }}
                              onClose={() => setExpandedBorderColor(false)}
                              onAddToken={v=>handleAddToken(v,'border-color')}
                            />
                          )}
                        </div>

                        <div className="di-typography-control-wrap">
                          <button
                            className="di-typography-control di-border-control--width"
                            type="button"
                            title="边框粗细"
                            onClick={e => {
                              const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                              setDropPos(calcDropPos(r));
                              setShowContainerStyleDrop(false);
                              setExpandedBorderColor(false);
                              setShowStyleDrop(false);
                              setShowRadiusDrop(false);
                              setShowBorderWidthDrop(v=>!v);
                            }}
                          >
                            <span className="di-typography-control-value">{curBorderWidth}</span>
                            {chevron}
                          </button>
                          {showBorderWidthDrop && (
                            <>
                              <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={()=>setShowBorderWidthDrop(false)} />
                              <div className="di-border-style-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                                {borderWidthSteps.map(step => (
                                  <button key={step}
                                    className={`di-border-style-drop-item${curBorderWidth===step?' di-border-style-drop-item--on':''}`}
                                    onClick={() => {
                                      setContainerCustomMode(true);
                                      setPendingBorderWidth(step);
                                      liveApply('border-width', step);
                                      if (step === '0px') {
                                        setPendingBorderStyle('none');
                                        liveApply('border-style', 'none');
                                      } else if (curBorderStyleValue === 'none') {
                                        setPendingBorderStyle('solid');
                                        liveApply('border-style', 'solid');
                                      }
                                      setShowBorderWidthDrop(false);
                                    }}>
                                    <span className="di-border-style-name">{step}</span>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="di-typography-control-wrap">
                          <button
                            className="di-typography-control di-border-control--line"
                            type="button"
                            title="边框线型"
                            onClick={e => {
                              const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                              setDropPos(calcDropPos(r));
                              setShowContainerStyleDrop(false);
                              setExpandedBorderColor(false);
                              setShowBorderWidthDrop(false);
                              setShowRadiusDrop(false);
                              setShowStyleDrop(v=>!v);
                            }}
                          >
                            <span className="di-border-style-label" style={curLineOpt.value === 'none' ? { color: '#9ca3af' } : undefined}>{curLineOpt.label}</span>
                            <span className="di-typography-control-value">{curLineOpt.title}</span>
                            {chevron}
                          </button>
                          {showStyleDrop && (
                            <>
                              <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={() => setShowStyleDrop(false)} />
                              <div className="di-border-style-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                                {BORDER_STYLE_OPTIONS.map(opt => (
                                  <button key={opt.value}
                                    className={`di-border-style-drop-item${curBorderStyleValue===opt.value?' di-border-style-drop-item--on':''}`}
                                    onClick={() => {
                                      setContainerCustomMode(true);
                                      setPendingBorderStyle(opt.value);
                                      liveApply('border-style', opt.value);
                                      if (opt.value === 'none') {
                                        setPendingBorderWidth('0px');
                                        liveApply('border-width', '0px');
                                      } else if (curBorderWidth === '0px') {
                                        setPendingBorderWidth('1px');
                                        liveApply('border-width', '1px');
                                      }
                                      setShowStyleDrop(false);
                                    }}>
                                    <span className="di-border-style-label" style={opt.value === 'none' ? { color: '#9ca3af' } : undefined}>{opt.label}</span>
                                    <span className="di-border-style-name">{opt.title}</span>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="di-typography-control-wrap">
                          <button
                            className="di-typography-control di-border-control--radius"
                            type="button"
                            title="圆角"
                            onClick={e => {
                              const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                              setDropPos(calcDropPos(r));
                              setShowContainerStyleDrop(false);
                              setExpandedBorderColor(false);
                              setShowBorderWidthDrop(false);
                              setShowStyleDrop(false);
                              setCustomRadius(curBorderRadius === '0px' ? '' : curBorderRadius);
                              setShowRadiusDrop(v=>!v);
                            }}
                          >
                            {curRadiusPreset && <span className="di-border-style-label">{curRadiusPreset.label}</span>}
                            <span className="di-typography-control-value">{curBorderRadius}</span>
                            {chevron}
                          </button>
                          {showRadiusDrop && (
                            <>
                              <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={() => setShowRadiusDrop(false)} />
                              <div className="di-border-style-drop di-radius-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                                {radiusPresets.map(opt => (
                                  <button key={opt.label}
                                    className={`di-border-style-drop-item${curRadiusPreset?.value===opt.value?' di-border-style-drop-item--on':''}`}
                                    onClick={() => {
                                      setContainerCustomMode(true);
                                      setPendingRadius(opt.value);
                                      setCustomRadius('');
                                      liveApply('border-radius', opt.value);
                                      setShowRadiusDrop(false);
                                    }}>
                                    <span className="di-border-style-label">{opt.label}</span>
                                    {opt.sub && <span className="di-border-style-name">{opt.sub}</span>}
                                  </button>
                                ))}
                                <div className="di-dropdown-custom">
                                  <input
                                    className="di-dropdown-custom-input"
                                    value={customRadius}
                                    placeholder="12px"
                                    onChange={(e) => {
                                      const draft = e.target.value;
                                      const next = normalizeCssLengthInput(draft);
                                      setCustomRadius(draft);
                                      if (!next || !supportsCssValue('border-radius', next)) return;
                                      setContainerCustomMode(true);
                                      setPendingRadius(next);
                                      liveApply('border-radius', next);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const next = normalizeCssLengthInput(customRadius);
                                        if (!next || !supportsCssValue('border-radius', next)) return;
                                        setContainerCustomMode(true);
                                        setPendingRadius(next);
                                        liveApply('border-radius', next);
                                        setShowRadiusDrop(false);
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="di-dropdown-custom-apply"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = normalizeCssLengthInput(customRadius);
                                      if (!next || !supportsCssValue('border-radius', next)) return;
                                      setContainerCustomMode(true);
                                      setPendingRadius(next);
                                      liveApply('border-radius', next);
                                      setShowRadiusDrop(false);
                                    }}
                                  >
                                    应用
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="di-typography-readout" aria-label="当前容器样式参数">
                        <span className="di-typography-readout-line">{containerSummary}</span>
                        <span className="di-typography-readout-token">
                          {`${curContainerPreset?.backgroundVar || curBackgroundColor} / ${curContainerPreset?.colorVar || curBorderColor}`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            )}

            {/* 布局区 */}
            {!componentMeta && (
            <div className="di-section">
              <div className="di-section-title">布局</div>
              <div className="di-layout-grid">
                <div className="di-layout-card di-layout-card--position">
                  <div className="di-layout-card-title">位置</div>
                  <div className="di-position-fields" aria-label="移动元素">
                    {([
                      { key: 'x', label: 'X', value: (pendingTranslate ?? translateVal).x },
                      { key: 'y', label: 'Y', value: (pendingTranslate ?? translateVal).y },
                    ] as const).map(item => (
                      <div className="di-position-row" key={item.key}>
                        <span className="di-position-axis">{item.label}</span>
                        <div className="di-number-stepper">
                          <input
                            className="di-position-value di-number-stepper-input"
                            value={`${Math.round(item.value)}px`}
                            aria-label={`${item.label} 位置`}
                            onChange={event => setTranslateAxis(item.key, event.currentTarget.value)}
                            onFocus={event => event.currentTarget.select()}
                            onClick={event => event.currentTarget.select()}
                            onMouseUp={event => event.preventDefault()}
                          />
                          <div className="di-number-stepper-buttons">
                            <button type="button" onClick={() => stepTranslateAxis(item.key, 1)} aria-label={`${item.label} 增加 1px`}>⌃</button>
                            <button type="button" onClick={() => stepTranslateAxis(item.key, -1)} aria-label={`${item.label} 减少 1px`}>⌄</button>
                          </div>
                        </div>
                      </div>
                    ))}
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
                        <div className="di-number-stepper">
                          <input
                            className="di-size-value di-number-stepper-input"
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
                          <div className="di-number-stepper-buttons">
                            <button type="button" onClick={() => stepSize(item.key, inputVal, 1)} aria-label={`${item.label} 增加 1px`}>⌃</button>
                            <button type="button" onClick={() => stepSize(item.key, inputVal, -1)} aria-label={`${item.label} 减少 1px`}>⌄</button>
                          </div>
                        </div>
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
            )}

            {/* 阴影区 */}
            <div className="di-section">
              <div className="di-section-title">阴影</div>
              <div className="di-shadow-panel">
                {(() => {
                  const activeShadow = pendingShadow || shadowVal;
                  const activeShadowAuthored = pendingShadow ? pendingShadow : shadowAuthoredVal;
                  const matchedOption = shadowOptions.find(option => canonicalizeShadowValue(option.value) === canonicalizeShadowValue(activeShadow)) ?? null;
                  const activeOption = matchedOption ?? shadowOptions[0];
                  const isShadowCustom = shadowCustomMode || (!matchedOption && activeShadow !== 'none');
                  const shadowDisplay = isShadowCustom
                    ? { label: '自定义', sub: formatShadowDisplay(activeShadow), isHardcoded: true }
                    : getShadowDisplay(activeShadow, activeShadowAuthored, shadowTokens);
                  const shadowParts = parseShadowParts(activeShadow);
                  const shadowControlLabel = isShadowCustom ? '自定义' : activeOption.label;
                  return (
                    <>
                      <div className="di-shadow-toolbar">
                        <button
                          className={`di-shadow-token-trigger${isShadowCustom ? ' di-shadow-token-trigger--custom' : ''}`}
                          onClick={e => {
                            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setDropPos(calcDropPos(r));
                            setShowShadowDrop(v => !v);
                          }}
                        >
                          <span className="di-shadow-token-label" style={activeOption.cssVar || isShadowCustom ? undefined : { color: '#9ca3af' }}>{shadowControlLabel}</span>
                          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{marginLeft:'auto',flexShrink:0}}><path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                        <div className="di-shadow-preview-chip" style={{ boxShadow: activeShadow === 'none' ? 'none' : activeShadow }} />
                        <div className="di-shadow-preview-copy">
                          <span className={shadowDisplay.label === '无' || shadowDisplay.isHardcoded ? 'di-token-name--plain' : 'di-token-name'}>{shadowDisplay.label}</span>
                          <span className="di-hex di-hex--wrap">{shadowDisplay.sub}</span>
                        </div>
                        {showShadowDrop && (
                          <>
                            <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={() => setShowShadowDrop(false)} />
                            <div className="di-border-style-drop di-shadow-drop" style={{position:'fixed',top:dropPos.top,left:dropPos.left,zIndex:99998}}>
                              {shadowOptions.map(option => {
                                const isOn = !isShadowCustom && canonicalizeShadowValue(option.value) === canonicalizeShadowValue(activeShadow);
                                return (
                                  <button
                                    key={option.cssVar || option.label}
                                    className={`di-border-style-drop-item${isOn ? ' di-border-style-drop-item--on' : ''}`}
                                    onClick={() => {
                                      setPendingShadow(option.value);
                                      setShadowCustomMode(false);
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
                                className={`di-border-style-drop-item${isShadowCustom ? ' di-border-style-drop-item--on' : ''}`}
                                onClick={() => {
                                  const value = buildShadowValue(EMPTY_CUSTOM_SHADOW_PARTS);
                                  setPendingShadow(value);
                                  setShadowCustomMode(true);
                                  liveApply('box-shadow', value);
                                  setShowShadowDrop(false);
                                }}
                              >
                                <span className="di-custom-option-label">自定义</span>
                                <span className="di-shadow-drop-meta">
                                  <span className="di-border-style-name">手动调整参数</span>
                                  <span className="di-shadow-drop-value">X / Y / 模糊 / 扩散 / 颜色</span>
                                </span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      {isShadowCustom && (
                        <div className="di-shadow-custom-grid">
                          {([
                            { key: 'x', label: 'X', value: shadowParts.x },
                            { key: 'y', label: 'Y', value: shadowParts.y },
                            { key: 'blur', label: '模糊', value: shadowParts.blur },
                            { key: 'spread', label: '扩散', value: shadowParts.spread },
                          ] as const).map(item => (
                            <div className="di-shadow-custom-row" key={item.key}>
                              <span className="di-shadow-custom-label">{item.label}</span>
                              <div className="di-number-stepper">
                                <input
                                  className="di-shadow-custom-input di-number-stepper-input"
                                  value={item.value}
                                  aria-label={`阴影${item.label}`}
                                  onChange={event => setCustomShadowPart(item.key, event.currentTarget.value)}
                                  onFocus={event => event.currentTarget.select()}
                                  onClick={event => event.currentTarget.select()}
                                  onMouseUp={event => event.preventDefault()}
                                />
                                <div className="di-number-stepper-buttons">
                                  <button type="button" onClick={() => stepCustomShadowPart(item.key, 1)} aria-label={`阴影${item.label}增加 1px`}>⌃</button>
                                  <button type="button" onClick={() => stepCustomShadowPart(item.key, -1)} aria-label={`阴影${item.label}减少 1px`}>⌄</button>
                                </div>
                              </div>
                            </div>
                          ))}
                          <div className="di-shadow-custom-row di-shadow-custom-row--color">
                            <span className="di-shadow-custom-label">颜色</span>
                            <button
                              type="button"
                              className="di-shadow-color-control"
                              onClick={event => {
                                const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
                                setDropPos(calcDropPos(r));
                                setShowShadowColorDrop(v => !v);
                              }}
                            >
                              <span className="di-shadow-color-swatch" style={{ background: shadowParts.color }} />
                              <span className="di-shadow-color-text">{formatColorDisplay(shadowParts.color)}</span>
                              <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{marginLeft:'auto',flexShrink:0}}><path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </button>
                            {showShadowColorDrop && (
                              <ColorDropdown
                                value={shadowParts.color}
                                pos={dropPos}
                                colorPalette={colorPalette}
                                onChange={color => setCustomShadowPart('color', color)}
                                onClose={() => setShowShadowColorDrop(false)}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </>
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
                  custom={spaceCustomModes.padding}
                  onCustomChange={v => setSpaceCustomModes(prev => ({ ...prev, padding: v }))}
                  onChange={v => { setPendingPadding(v); liveApply('padding', v); }}
                />
                <SpaceCard
                  title="外边距" variant="margin"
                  value={pendingMargin || marginVal}
                  spaceSteps={spaceSteps}
                  custom={spaceCustomModes.margin}
                  onCustomChange={v => setSpaceCustomModes(prev => ({ ...prev, margin: v }))}
                  onChange={v => { setPendingMargin(v); liveApply('margin', v); }}
                />
                <SpaceCard
                  title="元素间距" variant="gap"
                  value={pendingGap || gapVal}
                  spaceSteps={spaceSteps}
                  custom={spaceCustomModes.gap}
                  onCustomChange={v => setSpaceCustomModes(prev => ({ ...prev, gap: v }))}
                  onChange={v => { setPendingGap(v); liveApply('gap', v); }}
                />
              </div>
            </div>

            <div className="di-section">
              <div className="di-section-title">本次修改内容 {localDraftChangeCount}</div>
              <div className="di-inbox-summary">
                {localDraftEntries.length > 0 ? (
                  <div className="di-inbox-list">
                    {localDraftEntries.map((entry) => (
                      <div className="di-inbox-card di-inbox-card--draft" key={entry.key}>
                        <div className="di-inbox-card-head">
                          <div>
                            <div className="di-inbox-target">{entry.targetLabel}</div>
                            <div className="di-inbox-meta">{entry.scopeLabel} · {entry.selector}</div>
                          </div>
                          <button
                            className="di-inbox-icon-btn"
                            onClick={() => handleDeleteLocalDraft(entry.key)}
                            title="删除这个对象的全部修改"
                            aria-label="删除这个对象的全部修改"
                          >
                            <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>
                        <ol className="di-inbox-change-list">
                          {entry.changes.map((change, idx) => (
                            <li className="di-inbox-change-item" key={`${entry.key}-${change.prop}-${idx}`}>
                              <span className="di-inbox-change-text">
                                {idx + 1}. {getChangeLabel(change.prop)}：{change.from} → {change.val}
                              </span>
                              <button
                                className="di-inbox-icon-btn di-inbox-icon-btn--mini"
                                onClick={() => handleResetLocalDraftChange(entry.key, change.prop)}
                                title="移除并重置这条修改"
                                aria-label="移除并重置这条修改"
                              >
                                <Minus size={14} strokeWidth={2.4} aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                ) : styleIntentSummary.pendingEntries.length === 0 ? (
                  <div className="di-empty">还没有记录的修改</div>
                ) : null}
                {styleIntentSummary.pendingEntries.length > 0 ? (
                  <div className="di-inbox-list di-inbox-list--stored">
                    {styleIntentSummary.pendingEntries.map((entry) => (
                      <div className="di-inbox-card" key={entry.id}>
                        <div className="di-inbox-card-head">
                          <div className="di-inbox-target">{entry.targetLabel || entry.selector || '未命名对象'}</div>
                          <button
                            className="di-inbox-icon-btn"
                            onClick={() => handleDeleteStyleIntent(entry.id)}
                            title="删除这条已记录对象"
                            aria-label="删除这条已记录对象"
                          >
                            <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>
                        {entry.note ? <div className="di-inbox-note">{entry.note}</div> : null}
                        <ol className="di-inbox-change-list">
                          {entry.entries.flatMap((group) => group.changes.map((change) => ({ selector: group.selector, ...change }))).map((change, idx) => (
                            <li className="di-inbox-change-item" key={`${entry.id}-${change.selector}-${change.prop}-${idx}`}>
                              <span className="di-inbox-change-text">
                                {idx + 1}. {getChangeLabel(change.prop)}：{change.from ? `${change.from} → ` : ''}{change.val}
                              </span>
                              <button
                                className="di-inbox-icon-btn di-inbox-icon-btn--mini"
                                onClick={() => handleDeleteStyleIntent(entry.id, change.selector, change.prop)}
                                title="删除这条已记录属性"
                                aria-label="删除这条已记录属性"
                              >
                                <Minus size={14} strokeWidth={2.4} aria-hidden="true" />
                              </button>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
              </>
            )}

          </div>

          {/* 底部操作 */}
          {(() => {
            const hasPending = localDraftChangeCount > 0 || Object.keys(pendingColors).length > 0 ||
              !!pendingTextColor || !!pendingRadius || !!pendingShadow ||
              !!pendingBorderColor || !!pendingBorderWidth || !!pendingBorderStyle ||
              !!pendingFontSize || !!pendingFontWeight || !!pendingPadding ||
              !!pendingMargin || !!pendingGap || !!pendingTranslate ||
              !!pendingWidth || !!pendingHeight || !!note || hasComponentAttrPending;
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

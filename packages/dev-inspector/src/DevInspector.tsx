import { useState, useEffect, useRef, useCallback } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, CircleHelp, Component as ComponentIcon, Library as LibraryIcon, Minus, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import './dev-inspector.css';
import { useDevInspectorConfig } from './DevInspectorProvider';
import type { DevInspectorTokenConfig } from './config';
import type {
  ContainerStyleOption,
  DevInspectorComponentPreview,
  DevInspectorComponentPreviewCategory,
  DevInspectorComponentPreviewVariant,
  PaletteColor,
  PaletteGroup,
  TypographyStyleOption,
} from './config';
import { buildComponentMakerPrompt, formatComponentMakerSpecDraft, formatComponentMakerVariantDraft } from './plugins/component-maker';
import type { ComponentMakerContext, ComponentMakerEditablePart, ComponentMakerSpecDraft, ComponentMakerVariantDraft, ComponentMakerVariantItem } from './plugins/component-maker';

function calcDropPos(rect: DOMRect, dropHeight = 280, dropWidth = 280): { top: number; left: number } {
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow >= dropHeight + 8 ? rect.bottom + 4 : rect.top - dropHeight - 4;
  const maxLeft = Math.max(8, window.innerWidth - dropWidth - 8);
  return { top: Math.max(8, top), left: Math.min(Math.max(8, rect.left), maxLeft) };
}

function handleArrowKeyStep<T extends HTMLElement>(
  event: ReactKeyboardEvent<T>,
  onStep: (delta: number) => void,
  onEnter?: () => void,
) {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    onStep(event.key === 'ArrowUp' ? 1 : -1);
    return;
  }
  if (event.key === 'Enter') onEnter?.();
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
type AlignProp = 'justify-content' | 'align-items';
type ScopeMode = 'current' | 'component';
type InspectorPluginMode = 'component-maker';
type ComponentMakerSourceMode = 'existing' | 'new';
type ComponentMakerAction = 'create-current' | 'add-slot' | 'create-current-variant' | 'create-other-variant';
type ComponentCreateResolution = 'reuse' | 'new';
type ComponentMakerVariantVisual = 'neutral' | 'compact' | 'floating' | 'emphasis' | 'success' | 'warning' | 'danger' | 'disabled' | 'brand' | 'size';
type ComponentMakerVariantSuggestion = ComponentMakerVariantItem & {
  id: string;
  label: string;
  description: string;
  visual: ComponentMakerVariantVisual;
};
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

const EMPTY_COMPONENT_SPEC_DRAFT: ComponentMakerSpecDraft = {
  sourceMode: '',
  action: '',
  classification: '',
  componentName: '',
  usage: '',
  editableParts: [],
  variants: '',
  slots: '',
  styleRules: '',
};

const EMPTY_COMPONENT_VARIANT_DRAFT: ComponentMakerVariantDraft = {
  dimension: '',
  name: '',
  base: '',
  rules: '',
  items: [],
};

const SIZE_OPTIONS: { label: string; mode: SizeMode; value?: string }[] = [
  { label: 'Fill', mode: 'fill', value: '100%' },
  { label: 'Hug', mode: 'hug', value: 'fit-content' },
  { label: 'Fixed', mode: 'fixed' },
];

type ComponentTypeGroup = 'text' | 'action' | 'structure' | 'data' | 'form' | 'media' | 'navigation';
type ComponentContainerKey = 'page' | 'card' | 'menu' | 'form' | 'modal' | 'list' | 'navigation' | 'action' | 'other';

type ComponentTypeOption = {
  label: string;
  name: string;
  hint: string;
  group: ComponentTypeGroup;
  category: string;
  codeName: string;
  slotLabel: string;
};

type ComponentContainerOption = {
  key: ComponentContainerKey;
  label: string;
  codePrefix: string;
  hint: string;
};

type ComponentPurposeOption = {
  label: string;
  codePart: string;
  slotLabel: string;
  hint: string;
  group: ComponentTypeGroup;
};

const COMPONENT_TYPE_GROUP_LABELS: Record<ComponentTypeGroup, string> = {
  text: '文本',
  action: '操作',
  structure: '结构',
  data: '数据',
  form: '表单',
  media: '媒体',
  navigation: '导航',
};

const COMPONENT_TYPE_ALIASES: Record<string, string> = {
  标题: '页面标题',
  文本: '正文',
  标签: '状态标签',
  输入框: '输入框',
  表单控件: '输入框',
};

const COMPONENT_CONTAINER_OPTIONS: ComponentContainerOption[] = [
  { key: 'page', label: '页面', codePrefix: 'page', hint: '页面级内容或页面骨架' },
  { key: 'card', label: '卡片', codePrefix: 'card', hint: '卡片内的信息块' },
  { key: 'menu', label: '菜单', codePrefix: 'menu', hint: '菜单或列表导航项' },
  { key: 'form', label: '表单', codePrefix: 'form', hint: '表单字段、控件和提示' },
  { key: 'modal', label: '弹窗', codePrefix: 'modal', hint: '弹窗、抽屉或浮层内容' },
  { key: 'list', label: '列表', codePrefix: 'list', hint: '重复列表或表格单元' },
  { key: 'navigation', label: '导航', codePrefix: 'nav', hint: '导航栏、面包屑和入口' },
  { key: 'action', label: '操作区', codePrefix: 'action', hint: '按钮组或操作工具区' },
  { key: 'other', label: '其他', codePrefix: 'section', hint: '暂未明确语义的区域' },
];

const COMPONENT_PURPOSE_OPTIONS: ComponentPurposeOption[] = [
  { label: '标题', codePart: 'title', slotLabel: '标题文字', hint: '标题或主视觉文字', group: 'text' },
  { label: '正文', codePart: 'text', slotLabel: '文本内容', hint: '正文、段落或普通内容', group: 'text' },
  { label: '说明', codePart: 'description', slotLabel: '说明文', hint: '描述、提示或辅助说明', group: 'text' },
  { label: '标签', codePart: 'tag', slotLabel: '标签文案', hint: '分类或短标签', group: 'data' },
  { label: '操作入口', codePart: 'action', slotLabel: '操作文案', hint: '主要操作或入口按钮', group: 'action' },
  { label: '按钮文案', codePart: 'button-label', slotLabel: '按钮文案', hint: '按钮内可替换文案', group: 'text' },
  { label: '占位提示', codePart: 'placeholder', slotLabel: '占位提示', hint: '输入控件里的 placeholder', group: 'form' },
  { label: '输入控件', codePart: 'input', slotLabel: '输入值', hint: '表单输入或选择控件', group: 'form' },
  { label: '帮助说明', codePart: 'help-text', slotLabel: '帮助说明', hint: '字段帮助或补充说明', group: 'text' },
  { label: '错误提示', codePart: 'error-message', slotLabel: '错误提示', hint: '校验失败或错误说明', group: 'form' },
  { label: '数值', codePart: 'value', slotLabel: '数值', hint: '指标、数量或价格', group: 'data' },
  { label: '状态', codePart: 'status', slotLabel: '状态文案', hint: '状态展示或状态标签', group: 'data' },
  { label: '图标', codePart: 'icon', slotLabel: '图标名称', hint: '图形符号或 icon', group: 'media' },
  { label: '内容区块', codePart: 'section', slotLabel: '内容', hint: '承载布局或内容区域', group: 'structure' },
  { label: '菜单项', codePart: 'menu-item', slotLabel: '菜单文案', hint: '菜单或下拉里的选项', group: 'navigation' },
  { label: '分组标题', codePart: 'group-title', slotLabel: '分组标题', hint: '分组或列表的小标题', group: 'text' },
  { label: '导航项', codePart: 'nav-item', slotLabel: '导航文案', hint: '导航入口或跳转项', group: 'navigation' },
  { label: '主操作', codePart: 'primary-action', slotLabel: '主操作文案', hint: '页面或区块的主要动作', group: 'action' },
  { label: '次操作', codePart: 'secondary-action', slotLabel: '次操作文案', hint: '辅助动作或次级按钮', group: 'action' },
  { label: '图标按钮', codePart: 'icon-button', slotLabel: '图标名称', hint: '仅用图标表达的操作', group: 'action' },
  { label: '功能列表', codePart: 'feature-list', slotLabel: '列表内容', hint: '展示功能、能力或任务条目', group: 'structure' },
  { label: '数据列表', codePart: 'data-list', slotLabel: '列表内容', hint: '展示数据记录或业务对象', group: 'structure' },
  { label: '导航列表', codePart: 'nav-list', slotLabel: '列表内容', hint: '展示导航入口集合', group: 'navigation' },
  { label: '步骤列表', codePart: 'step-list', slotLabel: '列表内容', hint: '展示流程步骤或顺序', group: 'structure' },
  { label: '内容列表', codePart: 'content-list', slotLabel: '列表内容', hint: '展示文章、说明或内容集合', group: 'structure' },
  { label: '其他', codePart: 'custom', slotLabel: '内容', hint: '自定义职责，可在任务里补充说明', group: 'structure' },
];

const COMPONENT_PURPOSES_BY_CONTAINER: Record<ComponentContainerKey, string[]> = {
  page: ['标题', '正文', '说明', '内容区块', '操作入口', '其他'],
  card: ['标题', '正文', '说明', '标签', '操作入口', '内容区块'],
  menu: ['菜单项', '分组标题', '图标', '状态', '操作入口', '其他'],
  form: ['输入控件', '占位提示', '帮助说明', '错误提示', '操作入口', '其他'],
  modal: ['标题', '正文', '说明', '内容区块', '操作入口', '其他'],
  list: ['功能列表', '数据列表', '导航列表', '步骤列表', '内容列表', '其他'],
  navigation: ['导航项', '分组标题', '图标', '状态', '其他'],
  action: ['主操作', '次操作', '按钮文案', '图标按钮', '其他'],
  other: ['内容区块', '标题', '正文', '说明', '操作入口', '其他'],
};

const COMPONENT_TYPE_OPTIONS: ComponentTypeOption[] = [
  { label: '页面标题', name: 'Heading', hint: '页面主标题', group: 'text', category: '标题', codeName: 'page-title', slotLabel: '标题文字' },
  { label: '区块标题', name: 'Heading', hint: '区块标题', group: 'text', category: '标题', codeName: 'section-title', slotLabel: '标题文字' },
  { label: '小标题', name: 'Heading', hint: '局部小标题', group: 'text', category: '标题', codeName: 'subsection-title', slotLabel: '标题文字' },
  { label: '卡片标题', name: 'Heading', hint: '卡片内标题', group: 'text', category: '标题', codeName: 'card-title', slotLabel: '标题文字' },
  { label: '正文', name: 'Text', hint: '段落正文', group: 'text', category: '文本', codeName: 'body-text', slotLabel: '文本内容' },
  { label: '说明文字', name: 'Text', hint: '辅助说明 / 描述', group: 'text', category: '文本', codeName: 'description-text', slotLabel: '说明文' },
  { label: '链接文字', name: 'Text link', hint: '文本跳转入口', group: 'text', category: '文本', codeName: 'text-link', slotLabel: '链接文案' },
  { label: '按钮文字', name: 'Button label', hint: '按钮内文案', group: 'text', category: '文本', codeName: 'button-label', slotLabel: '按钮文案' },
  { label: '按钮', name: 'Button', hint: '触发操作', group: 'action', category: '操作', codeName: 'button', slotLabel: '按钮文案' },
  { label: '图标按钮', name: 'Icon button', hint: '图标触发操作', group: 'action', category: '操作', codeName: 'icon-button', slotLabel: '无' },
  { label: '文字按钮', name: 'Text button', hint: '轻量文字操作', group: 'action', category: '操作', codeName: 'text-button', slotLabel: '按钮文案' },
  { label: '卡片', name: 'Card', hint: '承载一组信息', group: 'structure', category: '容器', codeName: 'card', slotLabel: '内容' },
  { label: '容器', name: 'Container', hint: '布局承载', group: 'structure', category: '布局', codeName: 'container', slotLabel: '内容' },
  { label: '列表项', name: 'List item', hint: '重复列表单元', group: 'structure', category: '列表', codeName: 'list-item', slotLabel: '内容' },
  { label: '状态标签', name: 'Badge', hint: '状态标识', group: 'data', category: '标识', codeName: 'status-badge', slotLabel: '状态文案' },
  { label: '分类标签', name: 'Tag', hint: '分类标识', group: 'data', category: '标识', codeName: 'tag', slotLabel: '标签文案' },
  { label: '输入框', name: 'Input', hint: '单行文本输入', group: 'form', category: '输入', codeName: 'input', slotLabel: '输入值' },
  { label: '文本域', name: 'Textarea', hint: '多行文本输入', group: 'form', category: '输入', codeName: 'textarea', slotLabel: '输入值' },
  { label: '选择控件', name: 'Select', hint: '选择一个选项', group: 'form', category: '选择', codeName: 'select', slotLabel: '选项值' },
  { label: '图片', name: 'Image', hint: '图片展示', group: 'media', category: '媒体', codeName: 'image', slotLabel: '图片资源' },
  { label: '图标', name: 'Icon', hint: '图形符号', group: 'media', category: '符号', codeName: 'icon', slotLabel: '图标名称' },
  { label: '导航项', name: 'Nav item', hint: '导航入口', group: 'navigation', category: '导航', codeName: 'nav-item', slotLabel: '导航文案' },
  { label: '面包屑项', name: 'Breadcrumb item', hint: '层级导航项', group: 'navigation', category: '导航', codeName: 'breadcrumb-item', slotLabel: '导航文案' },
];

const COMPONENT_MAKER_ACTION_OPTIONS: { key: ComponentMakerAction; label: string; hint: string }[] = [
  { key: 'create-current', label: '新建组件', hint: '把当前对象沉淀为默认组件' },
  { key: 'add-slot', label: '加入组件', hint: '作为组件里的可编辑内容' },
  { key: 'create-current-variant', label: '新增当前变体', hint: '把当前样式作为该组件新变体' },
  { key: 'create-other-variant', label: '新增其他变体', hint: '手动定义未出现在页面上的变体' },
];

const COMPONENT_MAKER_ACTION_LABELS: Record<ComponentMakerAction, string> = Object.fromEntries(
  COMPONENT_MAKER_ACTION_OPTIONS.map(option => [option.key, option.label]),
) as Record<ComponentMakerAction, string>;

const COMPONENT_INTERACTION_STATE_OPTIONS: {
  key: string;
  label: string;
  description: string;
  visual: ComponentMakerVariantVisual;
}[] = [
  { key: 'hover', label: '悬停', description: '鼠标悬停反馈', visual: 'floating' },
  { key: 'pressed', label: '按下', description: '按下瞬间反馈', visual: 'compact' },
  { key: 'selected', label: '选中', description: '当前选中状态', visual: 'brand' },
  { key: 'disabled', label: '禁用', description: '不可操作状态', visual: 'disabled' },
];

const COMPONENT_GENERIC_SIZE_OPTIONS: {
  key: string;
  label: string;
  description: string;
  visual: ComponentMakerVariantVisual;
}[] = [
  { key: 's', label: 'S', description: '小规格', visual: 'compact' },
  { key: 'm', label: 'M', description: '默认规格', visual: 'size' },
  { key: 'l', label: 'L', description: '大规格', visual: 'size' },
];

const JUSTIFY_OPTIONS = [
  { label: '默认', value: 'normal' },
  { label: '左', value: 'flex-start' },
  { label: '中', value: 'center' },
  { label: '右', value: 'flex-end' },
  { label: '分散', value: 'space-between' },
];

const ALIGN_ITEMS_OPTIONS = [
  { label: '默认', value: 'normal' },
  { label: '上', value: 'flex-start' },
  { label: '中', value: 'center' },
  { label: '下', value: 'flex-end' },
  { label: '拉伸', value: 'stretch' },
];

const EDIT_SHORTCUT_LABEL = 'Mac Option+I / Windows Alt+I';
const EXIT_SHORTCUT_LABEL = 'Esc / Mac Option+I / Windows Alt+I';

type InspectorSectionKey = 'text' | 'layout' | 'shadow' | 'space';

const SECTION_RESET_PROPS: Record<InspectorSectionKey, string[]> = {
  text: ['font-size', 'font-weight', 'color'],
  layout: ['translate', 'width', 'height', 'min-height', 'max-height', 'justify-content', 'align-items'],
  shadow: ['box-shadow'],
  space: ['padding', 'margin', 'gap'],
};

// ─── 工具函数 ────────────────────────────────────────────────────
function rgbToHex(rgb: string): string {
  const m = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target instanceof HTMLElement ? target : null;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return el.isContentEditable
    || tag === 'input'
    || tag === 'textarea'
    || tag === 'select'
    || !!el.closest('[contenteditable="true"]');
}

function normalizeColor(val: string): string {
  const raw = val.trim();
  if (raw === 'transparent' || /^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/i.test(raw)) return 'transparent';
  const m = val.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (m) return '#' + [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
  return raw;
}

function isTransparentColor(val: string): boolean {
  return normalizeColor(val || 'transparent') === 'transparent';
}

function formatColorDisplay(val: string): string {
  if (isTransparentColor(val)) return '透明';
  // rgba(r,g,b,a) → #hex / a%
  const m = val.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (m) {
    const hex = '#' + [m[1],m[2],m[3]].map(n=>parseInt(n).toString(16).padStart(2,'0')).join('');
    const alpha = Math.round(parseFloat(m[4]) * 100);
    return alpha < 100 ? `${hex} / ${alpha}%` : hex;
  }
  return val;
}

function isColorDark(val: string): boolean {
  if (isTransparentColor(val)) return false;
  const m = val.match(/^#([0-9a-f]{6})$/i);
  if (!m) return true;
  const r = parseInt(m[1].slice(0,2),16);
  const g = parseInt(m[1].slice(2,4),16);
  const b = parseInt(m[1].slice(4,6),16);
  return (r*299 + g*587 + b*114) / 1000 < 128;
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
  return val.replace(/(-?\d+(?:\.\d+)?)px\b/gi, '$1').replace(/\s+/g, ' ');
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

const TEXT_SEMANTIC_CLASS_RE = /(^|[-_])(caption|copy|desc|description|eyebrow|heading|label|subtitle|text|title)([-_]|$)/i;
const STRUCTURAL_CONTAINER_CLASS_RE = /(^|[-_])(area|block|card|container|content|group|grid|item|layout|list|panel|row|section|shell|stack|zone)([-_]|$)/i;
const PAGE_SHELL_CLASS_RE = /(^|[-_])(app|page|root|screen|shell|workspace)([-_]|$)/i;
const TEXT_GROUP_EXCLUDED_SELECTOR = [
  'button',
  'input',
  'textarea',
  'select',
  'img',
  'svg',
  'video',
  'canvas',
  '[role="button"]',
  '[contenteditable="true"]',
].join(',');
const TEXT_GROUP_MAX_CHILDREN = 4;
const STRUCTURAL_CONTAINER_TAGS = new Set([
  'article',
  'aside',
  'div',
  'form',
  'li',
  'main',
  'nav',
  'ol',
  'section',
  'ul',
]);

function hasTextSemanticClass(el: Element): boolean {
  return getClasses(el).some(className =>
    !isStateClass(className)
    && !/^lucide(-|$)/.test(className)
    && TEXT_SEMANTIC_CLASS_RE.test(className),
  );
}

function hasStructuralContainerClass(el: Element): boolean {
  return getClasses(el).some(className =>
    !isStateClass(className)
    && STRUCTURAL_CONTAINER_CLASS_RE.test(className),
  );
}

function isTextOnlyTargetElement(el: Element): boolean {
  if (getInspectorComponentMeta(el)) return false;

  const tag = el.tagName.toLowerCase();
  if (TEXT_ONLY_TAGS.has(tag)) return true;
  if (el.matches(TEXT_GROUP_EXCLUDED_SELECTOR)) return false;
  if (hasStructuralContainerClass(el)) return false;
  if (hasTextSemanticClass(el)) return true;

  const children = Array.from(el.children);
  if (!children.length || children.length > TEXT_GROUP_MAX_CHILDREN) return false;
  if (STRUCTURAL_CONTAINER_TAGS.has(tag) && children.length > 1) return false;
  if (children.some(child => child.matches(TEXT_GROUP_EXCLUDED_SELECTOR))) return false;

  return children.every(child => {
    const childTag = child.tagName.toLowerCase();
    return TEXT_ONLY_TAGS.has(childTag) || hasTextSemanticClass(child);
  });
}

function isSimpleTextGroupTargetElement(el: Element): boolean {
  if (getInspectorComponentMeta(el)) return false;
  if (el.matches(TEXT_GROUP_EXCLUDED_SELECTOR)) return false;

  const tag = el.tagName.toLowerCase();
  if (!STRUCTURAL_CONTAINER_TAGS.has(tag) && !hasStructuralContainerClass(el)) return false;

  const children = Array.from(el.children).filter(isInspectableChildElement);
  if (children.length < 2 || children.length > TEXT_GROUP_MAX_CHILDREN) return false;
  if (children.some(child => child.matches(TEXT_GROUP_EXCLUDED_SELECTOR) || getInspectorComponentMeta(child))) return false;

  return children.every(child => {
    const childTag = child.tagName.toLowerCase();
    return TEXT_ONLY_TAGS.has(childTag) || hasTextSemanticClass(child) || isTextOnlyTargetElement(child);
  });
}

function isStructuralContainerTargetElement(el: Element): boolean {
  if (getInspectorComponentMeta(el)) return false;
  if (isTextOnlyTargetElement(el)) return false;
  if (isSimpleTextGroupTargetElement(el)) return false;

  const tag = el.tagName.toLowerCase();
  if (!STRUCTURAL_CONTAINER_TAGS.has(tag) && !hasStructuralContainerClass(el)) return false;

  return el.children.length > 0;
}

function isNearAppRoot(el: Element): boolean {
  const parent = el.parentElement;
  if (!parent) return false;
  if (parent === document.body) return true;
  if (parent.id === 'root') return true;
  if (parent.parentElement === document.body && parent.children.length === 1) return true;
  return false;
}

function isPageShellTargetElement(el: Element): boolean {
  if (getInspectorComponentMeta(el)) return false;
  if (isTextOnlyTargetElement(el)) return false;
  if (el === document.documentElement || el === document.body) return false;

  const tag = el.tagName.toLowerCase();
  const children = Array.from(el.children).filter(isInspectableChildElement);
  if (children.length < 2) return false;

  const rect = el.getBoundingClientRect();
  const coversPageArea = rect.width >= window.innerWidth * 0.55 && rect.height >= window.innerHeight * 0.45;
  const hasPageShellClass = getClasses(el).some(className =>
    !isStateClass(className) && PAGE_SHELL_CLASS_RE.test(className)
  );

  if (tag === 'main' && coversPageArea) return true;
  if (isNearAppRoot(el) && coversPageArea && hasPageShellClass) return true;
  return false;
}

function isInspectableChildElement(el: Element): boolean {
  if (el.closest('.di-panel')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

function getVisibleDirectChildCount(el: Element): number {
  return Array.from(el.children).filter(isInspectableChildElement).length;
}

function canControlElementGap(el: Element): boolean {
  const cs = getComputedStyle(el);
  return isFlexGridDisplay(cs.display) && getVisibleDirectChildCount(el) >= 2;
}

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

function getComponentStateLabel(state: string): string {
  const map: Record<string, string> = {
    default: '默认',
    selected: '选中',
    active: '激活',
    disabled: '禁用',
    open: '展开',
    current: '当前',
  };
  return map[state] ?? state;
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

  if (tag === 'form' || classIncludes(classes, /(^|[-_])(form|form-section|field-group)([-_]|$)/i)) {
    return {
      name: componentClasses.find(className => /form/i.test(className)) ?? componentClasses[0] ?? 'form',
      type: 'Form',
      layer: 'Component',
      variant: 'default',
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
      variant: inferBadgeStatus(classes),
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

const SEMANTIC_TAG_DISPLAY_NAMES: Record<string, string> = {
  h1: '页面标题',
  h2: '章节标题',
  h3: '小节标题',
  h4: '标题文本',
  h5: '标题文本',
  h6: '标题文本',
  p: '正文文本',
  span: '文本',
  strong: '强调文本',
  em: '强调文本',
  a: '链接文本',
  label: '表单标签',
  img: '图片',
  section: '页面区块',
  main: '页面主体',
  aside: '侧边内容',
  div: '容器',
};

function getElementDisplayName(el: Element, meta: InspectorComponentMeta | null = getInspectorComponentMeta(el)): string {
  if (meta) return getComponentDisplayName(meta);

  const explicitName = el.getAttribute('data-di-name')
    || el.getAttribute('data-component')
    || el.getAttribute('data-role')
    || el.getAttribute('aria-label');
  if (explicitName?.trim()) return explicitName.trim();

  const semanticClass = getClasses(el).find(className =>
    !isStateClass(className)
    && !/^lucide(-|$)/.test(className)
  );
  if (semanticClass) return semanticClass;

  const tag = el.tagName.toLowerCase();
  return SEMANTIC_TAG_DISPLAY_NAMES[tag] ?? tag;
}

function getTargetDisplayLabel(el: Element, meta: InspectorComponentMeta | null = getInspectorComponentMeta(el)): string {
  return meta
    ? `${meta.type} / ${getComponentDisplayName(meta)}`
    : getElementDisplayName(el, meta);
}

type ButtonVariantKey = 'primary' | 'secondary' | 'ghost' | 'text';
type ButtonSizeKey = 's' | 'm' | 'l';
type IconColorKey = 'default' | 'muted' | 'brand' | 'success' | 'warning' | 'danger';
type BadgeStatusKey = 'default' | 'progress' | 'success' | 'warning' | 'danger';
type CardVariantKey = 'default' | 'compact' | 'floating' | 'emphasis';
type ComponentSizeKind = 'button' | 'icon' | 'badge';
type DesignLibraryTab = 'tokens' | 'components' | 'changes' | 'usage';
type DesignLibraryTokenUsageFilter = 'all' | 'used' | 'unused' | 'unknown';
type DesignLibraryCrudAction = 'create' | 'update' | 'delete';
type LibraryTokenCategory = 'all' | 'color' | 'typography' | 'appearance' | 'space' | 'radius' | 'shadow';
type LibraryTokenItemCategory = Exclude<LibraryTokenCategory, 'all'>;
type LibraryComponentCategory = 'all' | DevInspectorComponentPreviewCategory;
type LibraryComponentItemCategory = Exclude<LibraryComponentCategory, 'all'>;

type LibraryTokenItem = {
  id: string;
  category: LibraryTokenItemCategory;
  categoryLabel: string;
  name: string;
  value: string;
  usage: string;
  status: string;
  preview: 'color' | 'text' | 'appearance' | 'space' | 'radius' | 'shadow';
  previewValue?: string;
  rawValue?: string;
  source?: 'system' | 'custom' | 'draft';
};

type LibraryTokenFormDraft = {
  mode: Extract<DesignLibraryCrudAction, 'create' | 'update'>;
  baseId?: string;
  category: LibraryTokenItemCategory;
  name: string;
  value: string;
  usage: string;
  status: string;
};

type LibraryComponentItem = {
  id: string;
  category: LibraryComponentItemCategory;
  categoryLabel: string;
  type: string;
  label: string;
  summary: string;
  selector: string;
  status: string;
  preview?: DevInspectorComponentPreview;
  source?: 'system' | 'custom' | 'draft';
};

type LibraryComponentFormDraft = {
  mode: Extract<DesignLibraryCrudAction, 'create' | 'update'>;
  baseId?: string;
  category: LibraryComponentItemCategory;
  type: string;
  label: string;
  summary: string;
  selector: string;
  status: string;
};

type LibraryComponentSpecDetail = {
  component: LibraryComponentItem;
  variant: DevInspectorComponentPreviewVariant;
  key: string;
  selector: string;
  purpose: string;
  capabilities: string[];
  tokenRefs: string[];
  usageCount: number | null;
};

const LIBRARY_TOKEN_CATEGORIES: { key: LibraryTokenCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'color', label: '颜色' },
  { key: 'typography', label: '文字' },
  { key: 'appearance', label: '外观' },
  { key: 'space', label: '间距' },
  { key: 'radius', label: '圆角' },
  { key: 'shadow', label: '阴影' },
];

const LIBRARY_COMPONENT_CATEGORIES: { key: LibraryComponentCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'action', label: '操作' },
  { key: 'display', label: '展示' },
  { key: 'feedback', label: '反馈' },
  { key: 'container', label: '容器' },
  { key: 'form', label: '表单' },
  { key: 'icon', label: '图标' },
  { key: 'custom', label: '自定义' },
];

const LIBRARY_COMPONENT_LABELS: Record<string, string> = {
  Button: '按钮',
  Icon: '图标',
  Badge: '标签',
  Card: '卡片',
  Form: '表单',
};

function getLibraryComponentCategory(type: string): LibraryComponentItemCategory {
  const normalized = type.trim().toLowerCase();
  if (normalized.includes('button') || normalized.includes('action')) return 'action';
  if (normalized.includes('badge') || normalized.includes('tag') || normalized.includes('chip')) return 'feedback';
  if (normalized.includes('card') || normalized.includes('text') || normalized.includes('typography')) return 'display';
  if (normalized.includes('form') || normalized.includes('input') || normalized.includes('textarea') || normalized.includes('control')) return 'form';
  if (normalized.includes('icon')) return 'icon';
  if (normalized.includes('container') || normalized.includes('layout') || normalized.includes('section') || normalized.includes('panel')) return 'container';
  return 'custom';
}

function getLibraryComponentCategoryLabel(category: LibraryComponentItemCategory): string {
  return LIBRARY_COMPONENT_CATEGORIES.find(item => item.key === category)?.label ?? '自定义';
}

function getLibraryComponentVariantKey(componentId: string, variantId: string): string {
  return `${componentId}::${variantId}`;
}

function getLibraryComponentVariantPurpose(component: LibraryComponentItem, variant: DevInspectorComponentPreviewVariant): string {
  if (variant.usage) return variant.usage;
  const normalizedType = component.type.trim().toLowerCase();
  const normalizedProps = (variant.propsLabel ?? '').toLowerCase();
  if (normalizedType.includes('button')) {
    if (normalizedProps.includes('primary')) return '主行动、关键提交、确认操作';
    if (normalizedProps.includes('secondary')) return '次级操作、辅助确认、备用入口';
    if (normalizedProps.includes('ghost')) return '低强调操作、工具区动作、弱边界按钮';
    if (normalizedProps.includes('text')) return '轻量文本操作、链接式动作、局部补充入口';
    return '操作触发、表单提交或流程推进';
  }
  if (normalizedType.includes('badge')) return '状态提示、分类标记和结果反馈';
  if (normalizedType.includes('card')) return '信息分组、任务展示和内容承载';
  if (normalizedType.includes('form')) return '信息录入、编辑和提交';
  if (normalizedType.includes('icon')) return '图形化操作入口或状态表达';
  return component.summary || '组件规格展示和复用治理';
}

function getLibraryComponentVariantCapabilities(component: LibraryComponentItem, variant: DevInspectorComponentPreviewVariant): string[] {
  if (variant.capabilities?.length) return variant.capabilities;
  const capability = COMPONENT_CAPABILITIES[component.type];
  const normalizedType = component.type.trim().toLowerCase();
  const capabilities = new Set<string>();
  if (capability?.variantKind || variant.propsLabel?.includes('variant=')) capabilities.add('变体');
  if (capability?.sizeKind || variant.propsLabel?.includes('size=')) capabilities.add('尺寸');
  if (capability?.statusKind || variant.propsLabel?.includes('status=')) capabilities.add('状态');
  if (capability?.colorKind || variant.propsLabel?.includes('tone=')) capabilities.add('颜色');
  if (capability?.editableText || capability?.textSlots?.length) capabilities.add('文案');
  if (capability?.childSlots?.length) capabilities.add('子项');
  if (normalizedType.includes('button')) {
    capabilities.add('点击');
    capabilities.add('hover');
    capabilities.add('focus-visible');
    capabilities.add('disabled 待接入');
  }
  if (normalizedType.includes('form')) {
    capabilities.add('输入');
    capabilities.add('提交');
  }
  if (!capabilities.size) capabilities.add('预览');
  return Array.from(capabilities);
}

function getLibraryComponentVariantTokenRefs(component: LibraryComponentItem, variant: DevInspectorComponentPreviewVariant): string[] {
  if (variant.tokenRefs?.length) return variant.tokenRefs;
  const normalizedType = component.type.trim().toLowerCase();
  const normalizedProps = (variant.propsLabel ?? '').toLowerCase();
  const refs = new Set<string>();
  if (normalizedType.includes('button')) {
    refs.add('--radius-control');
    refs.add('--font-size-m');
    if (normalizedProps.includes('size=s')) refs.add('--font-size-s');
    if (normalizedProps.includes('size=l')) refs.add('--font-size-l');
    if (normalizedProps.includes('primary')) refs.add('--color-brand-primary');
    if (normalizedProps.includes('secondary') || normalizedProps.includes('ghost')) refs.add('--color-border-default');
    if (normalizedProps.includes('text')) refs.add('--color-brand-primary');
  } else if (normalizedType.includes('badge')) {
    refs.add('--radius-pill');
    refs.add('--font-size-xs');
  } else if (normalizedType.includes('card')) {
    refs.add('--color-surface');
    refs.add('--color-border-default');
    refs.add('--shadow-card');
  } else if (normalizedType.includes('form')) {
    refs.add('--color-surface');
    refs.add('--color-border-default');
    refs.add('--radius-control');
  } else if (normalizedType.includes('icon')) {
    refs.add('--color-icon-default');
  }
  return Array.from(refs);
}

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
  statusKind?: 'badge';
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

const FORM_CHILD_SLOTS: ComponentTextSlotDefinition[] = [
  {
    key: 'primary-input',
    label: '输入框',
    selector: '[data-di-slot="primary-input"], .demo-input, input',
  },
  {
    key: 'description-input',
    label: '说明输入',
    selector: '[data-di-slot="description-input"], .demo-textarea, textarea',
  },
  {
    key: 'cancel-action',
    label: '取消按钮',
    selector: '[data-di-slot="cancel-action"], .ghost-button',
  },
  {
    key: 'submit-action',
    label: '提交按钮',
    selector: '[data-di-slot="submit-action"], .primary-btn',
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
    statusKind: 'badge',
    sizeKind: 'badge',
  },
  Card: {
    type: 'Card',
    variantKind: 'card',
    textSlots: CARD_EDITABLE_TEXT_SLOTS,
    childSlots: CARD_CHILD_SLOTS,
  },
  Form: {
    type: 'Form',
    childSlots: FORM_CHILD_SLOTS,
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

const BADGE_STATUS_OPTIONS: { key: BadgeStatusKey; label: string }[] = [
  { key: 'default', label: '默认' },
  { key: 'progress', label: '进行中' },
  { key: 'success', label: '成功' },
  { key: 'warning', label: '警告' },
  { key: 'danger', label: '危险' },
];

const BADGE_STATUS_CLASS_BY_KEY: Record<BadgeStatusKey, string> = {
  default: '',
  progress: 'status-badge--progress',
  success: 'status-badge--done',
  warning: 'status-badge--warning',
  danger: 'status-badge--danger',
};

const BADGE_STATUS_CLASS_NAMES = new Set([
  ...Object.values(BADGE_STATUS_CLASS_BY_KEY).filter(Boolean),
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

function inferBadgeStatus(classes: string[]): BadgeStatusKey {
  if (classIncludes(classes, /(^|[-_])(progress|processing|info)([-_]|$)/i)) return 'progress';
  if (classIncludes(classes, /(^|[-_])(done|success|complete|completed)([-_]|$)/i)) return 'success';
  if (classIncludes(classes, /(^|[-_])(warning|warn)([-_]|$)/i)) return 'warning';
  if (classIncludes(classes, /(^|[-_])(danger|error|destructive)([-_]|$)/i)) return 'danger';
  return 'default';
}

function getBadgeStatusClass(el: Element): string {
  const classes = getClasses(el);
  return classes.find(className => BADGE_STATUS_CLASS_NAMES.has(className)) ?? '';
}

function setBadgeStatusOnTargets(targets: Element[], status: BadgeStatusKey, restoreClass?: string) {
  targets.forEach(target => {
    const el = target as HTMLElement;
    Array.from(el.classList).forEach(className => {
      const isKnownStatus = BADGE_STATUS_CLASS_NAMES.has(className);
      const isBadgeStatus = /(badge|tag|chip)/i.test(className) && /(default|progress|processing|info|done|success|complete|completed|warning|warn|danger|error|destructive)/i.test(className);
      if (isKnownStatus || isBadgeStatus) el.classList.remove(className);
    });
    const nextClass = restoreClass === undefined ? BADGE_STATUS_CLASS_BY_KEY[status] : restoreClass;
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

function getCardDisplayLabel(variant: string): string {
  return CARD_VARIANT_OPTIONS.find(option => option.key === variant)?.label ?? variant;
}

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

function getElementDocumentPosition(el: Element): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
  };
}

function getPositionBase(el: Element, translate: { x: number; y: number }): { x: number; y: number } {
  const pos = getElementDocumentPosition(el);
  return {
    x: pos.x - translate.x,
    y: pos.y - translate.y,
  };
}

function formatTranslate(pos: { x: number; y: number }): string {
  return `${Math.round(pos.x)}px ${Math.round(pos.y)}px`;
}

function formatPositionRecord(pos: { x: number; y: number }): string {
  return `X ${Math.round(pos.x)}px / Y ${Math.round(pos.y)}px`;
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

function isFlexGridDisplay(display: string): boolean {
  return display.includes('flex') || display.includes('grid');
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

function formatLengthControlValue(value: string): string {
  const raw = formatSizeDisplay(value || '').trim();
  const pxMatch = raw.match(/^(-?\d+(?:\.\d+)?)px$/i);
  return pxMatch ? pxMatch[1] : raw;
}

function formatFontSizeControlValue(value: string): string {
  const raw = formatSizeDisplay(value || '').trim();
  if (!raw || raw === '—') return raw || '—';
  const pxMatch = raw.match(/^(-?\d+(?:\.\d+)?)px$/i);
  return pxMatch ? `${pxMatch[1]}px` : raw;
}

function displaySizeValue(cssValue: string, current: string): string {
  if (!cssValue || cssValue === '100%' || cssValue === 'fit-content') return formatLengthControlValue(current || '0px');
  return formatLengthControlValue(cssValue);
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

type SelectionLabelPlacement = 'top' | 'bottom' | 'inside';

function calcSelectionLabelPos(rect: DOMRect, text: string): { top: number; left: number; placement: SelectionLabelPlacement } {
  const labelH = 30;
  const gap = 8;
  const margin = 8;
  const labelW = Math.min(260, Math.max(96, text.length * 13 + 28));
  const panelRect = document.querySelector('.di-panel')?.getBoundingClientRect() ?? null;
  const clampLeft = (left: number) => Math.min(
    Math.max(left, margin + labelW / 2),
    window.innerWidth - margin - labelW / 2,
  );
  const intersectsPanel = (top: number, left: number) => {
    if (!panelRect) return false;
    const box = {
      left: left - labelW / 2,
      right: left + labelW / 2,
      top,
      bottom: top + labelH,
    };
    return box.left < panelRect.right
      && box.right > panelRect.left
      && box.top < panelRect.bottom
      && box.bottom > panelRect.top;
  };
  const centerLeft = clampLeft(rect.left + rect.width / 2);
  const candidates: Array<{ placement: SelectionLabelPlacement; top: number; left: number }> = [
    { placement: 'top', top: rect.top - labelH - gap, left: centerLeft },
    { placement: 'bottom', top: rect.bottom + gap, left: centerLeft },
  ];
  const visibleCandidate = candidates.find(candidate =>
    candidate.top >= margin
    && candidate.top + labelH <= window.innerHeight - margin
    && !intersectsPanel(candidate.top, candidate.left)
  );
  if (visibleCandidate) return visibleCandidate;

  const insideLeft = clampLeft(
    rect.width >= labelW + 16 ? rect.left + labelW / 2 + 8 : rect.left + rect.width / 2,
  );
  const insideTop = Math.min(
    Math.max(rect.top + 8, margin),
    window.innerHeight - labelH - margin,
  );
  return { placement: 'inside', top: insideTop, left: insideLeft };
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
  const displayLabel = step && step.label !== '无' ? step.label : value === '0px' ? '0' : formatLengthControlValue(value);
  const displaySub = step && step.label !== '无' ? formatLengthControlValue(value) : null;

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
                  {s.val !== '0px' && <span className="di-side-step-sub">{formatLengthControlValue(s.val)}</span>}
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

function formatSpaceRecordShort(value: string): string {
  return normalizeSpacingInput(value || '0px', []);
}

function isZeroLengthValue(value: string): boolean {
  const normalized = normalizeSpacingInput(value || '0px', []).trim();
  return /^-?0(?:\.0+)?(?:px|rem|em|%)?$/i.test(normalized);
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

function isEmptySpaceValue(variant: SpaceVariant, value: string): boolean {
  if (variant === 'gap') return isZeroLengthValue(value);
  const sides = parseFourSides(value);
  return Object.values(sides).every(isZeroLengthValue);
}

function getSpaceSummary(variant: SpaceVariant, value: string): string {
  if (variant === 'gap') return isEmptySpaceValue(variant, value) ? '' : `gap ${formatSpaceShort(value)}`;
  const sides = parseFourSides(value);
  const entries = [
    ['上', sides.top],
    ['右', sides.right],
    ['下', sides.bottom],
    ['左', sides.left],
  ].filter(([, sideValue]) => !isZeroLengthValue(sideValue));
  return entries.map(([label, sideValue]) => `${label}${formatSpaceShort(sideValue)}`).join(' / ');
}

function getSpaceRecordSummary(variant: SpaceVariant, value: string): string {
  if (variant === 'gap') return isEmptySpaceValue(variant, value) ? '' : `gap ${formatSpaceRecordShort(value)}`;
  const sides = parseFourSides(value);
  const entries = [
    ['上', sides.top],
    ['右', sides.right],
    ['下', sides.bottom],
    ['左', sides.left],
  ].filter(([, sideValue]) => !isZeroLengthValue(sideValue));
  return entries.map(([label, sideValue]) => `${label}${formatSpaceRecordShort(sideValue)}`).join(' / ');
}

function formatStoredSpaceRecordValue(value: string): string {
  if (!value || value === '无') return value;
  return value.replace(
    /(上|右|下|左|gap\s*)(-?\d+(?:\.\d+)?)(?!\s*(?:px|rem|em|%))/gi,
    '$1$2px',
  );
}

function getCompactAxisInputWidth(label: string, value: string): number {
  const text = String(value || '0');
  const leftPadding = label.length > 1 ? 42 : 25;
  const rightPadding = 9;
  const valueWidth = Math.max(8, text.length * 7.5);
  const minWidth = label.length > 1 ? 66 : 52;
  return Math.ceil(Math.min(96, Math.max(minWidth, leftPadding + valueWidth + rightPadding)));
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
  const spaceTokenMeta = isCustom || matchedStep?.val === '0px' ? '' : formatLengthControlValue(matchedStep?.val ?? '');
  const spaceSummary = getSpaceSummary(variant, value);
  const sides = parseFourSides(value);
  const emptySpaceStep = spaceSteps.find(step => step.val === '0px') ?? { label: '无', size: '', val: '0px' };
  const spaceTokenSteps = spaceSteps.filter(step => step.val !== '0px');
  const spaceTokenUsage = variant === 'gap' ? '元素间距 token' : `${title} token`;

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
    <div className={`di-space-card di-space-card--${variant}`}>
      <div className="di-space-row-head">
        <span className="di-space-title">{title}</span>
        <div className={`di-space-control-line${isCustom ? ' di-space-control-line--custom' : ''}${isCustom && variant !== 'gap' ? ' di-space-control-line--sides' : ''}${isCustom && variant === 'gap' ? ' di-space-control-line--gap' : ''}`}>
          {!isCustom && (
            <button
              type="button"
              className={`di-space-token-trigger${isEmptySpace ? ' di-space-token-trigger--empty' : ''}`}
              onClick={event => {
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                setPopupPos(calcDropPos(rect, 260));
                setShowDrop(v => !v);
              }}
            >
              <span className="di-space-token-label">{matchedStep?.label}</span>
              {spaceTokenMeta && <span className="di-space-token-meta">{spaceTokenMeta}</span>}
              <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{marginLeft:'auto',flexShrink:0}}><path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          )}
          {spaceSummary && <span className="di-space-summary">{spaceSummary}</span>}
          {showDrop && (
            <>
              <div style={{position:'fixed',inset:0,zIndex:99997}} onClick={() => setShowDrop(false)} />
              <div className="di-border-style-drop di-space-token-menu" style={{position:'fixed',top:popupPos.top,left:popupPos.left,zIndex:99998}}>
                {[emptySpaceStep, ...spaceTokenSteps].map(step => {
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
                        <span className="di-border-style-name">{formatLengthControlValue(step.val)}</span>
                        <span className="di-shadow-drop-value">{step.val === '0px' ? '空值状态' : spaceTokenUsage}</span>
                      </span>
                    </button>
                  );
                })}
                {spaceTokenSteps.length === 0 && (
                  <div className="di-token-empty-state">
                    No variables available
                  </div>
                )}
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

          {isCustom && variant !== 'gap' && (
            <div className="di-space-custom-grid di-space-custom-grid--sides">
              {([
                { key: 'top', label: '上', value: sides.top },
                { key: 'right', label: '右', value: sides.right },
                { key: 'bottom', label: '下', value: sides.bottom },
                { key: 'left', label: '左', value: sides.left },
              ] as const).map(item => (
                <div
                  className="di-space-custom-row"
                  key={item.key}
                  style={{ '--di-space-input-width': `${getCompactAxisInputWidth(item.label, formatLengthControlValue(item.value))}px` } as CSSProperties}
                >
                  <AxisNumberInput
                    label={item.label}
                    value={formatLengthControlValue(item.value)}
                    ariaLabel={`${title}${item.label}`}
                    inputClassName="di-space-custom-input"
                    onChangeValue={next => updateSide(item.key, next)}
                    onStep={delta => stepSide(item.key, delta)}
                  />
                </div>
              ))}
            </div>
          )}

          {isCustom && variant === 'gap' && (
            <div className="di-space-custom-grid di-space-custom-grid--gap">
              <div
                className="di-space-custom-row"
                style={{ '--di-space-input-width': `${getCompactAxisInputWidth('间距', formatLengthControlValue(value))}px` } as CSSProperties}
              >
                <AxisNumberInput
                  label="间距"
                  value={formatLengthControlValue(value)}
                  ariaLabel="元素间距"
                  inputClassName="di-space-custom-input"
                  wideLabel
                  onChangeValue={updateGap}
                  onStep={stepGap}
                />
              </div>
            </div>
          )}
          {isCustom && (
            <SourcePickerButton
              className="di-source-action--field"
              title={`选择${title} token`}
              onClick={event => {
                const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                setPopupPos(calcDropPos(rect, 260));
                setShowDrop(v => !v);
              }}
            />
          )}
        </div>
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
  const customColorInputRef = useRef<HTMLInputElement | null>(null);

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
        <div className="di-palette-scroll">
          {/* 无背景色 */}
          <div className="di-palette-group">
            <div className="di-palette-group-label">无</div>
            <div className="di-palette-swatches">
              <button className="di-palette-none" title="无背景色 / transparent"
                onClick={() => { onChange('transparent', ''); onClose(); }} />
            </div>
          </div>

          {/* 色板 + 每组末尾「+」格子 */}
          {colorPalette.map((g, index) => (
            <div key={g.group} className={`di-palette-group${index === colorPalette.length - 1 ? ' di-palette-group--last' : ''}`}>
              <div className="di-palette-group-label">{g.group}</div>
              <div className="di-palette-swatches">
                {g.colors.map(c => (
                  <button key={c.token}
                    className={`di-palette-swatch${value === c.val ? ' di-palette-swatch--on' : ''}`}
                    title={`${g.group}·${c.label}  ${c.val}`}
                    onClick={() => { onChange(c.val, c.token); onClose(); }}
                  >
                    <span className="di-palette-swatch-fill" style={{ background: c.val }} />
                  </button>
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
        </div>

        {/* 自定义底部：色块 + [#][hex] + [alpha][%] */}
        <div className="di-custom-bottom">
          <button
            className="di-custom-color-trigger"
            style={{ background: buildColor(hexInput, alpha), flexShrink: 0 }}
            title="选择自定义颜色"
            onClick={() => customColorInputRef.current?.click()}
          />
          <input
            ref={customColorInputRef}
            className="di-custom-color-input"
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(hexInput) ? hexInput : '#6b7280'}
            aria-label="选择自定义颜色"
            onChange={event => {
              const h = event.currentTarget.value;
              setHexInput(h);
              applyColor(h, alpha);
            }}
          />
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
  if (isTransparentColor(val)) return { label: '无', sub: '', isHardcoded: true };
  const displayVal = formatColorDisplay(val);
  const paletteLabel = getColorLabel(val, colorPalette);
  if (paletteLabel) return { label: paletteLabel, sub: displayVal, isHardcoded: false };
  const token = tokenMap[val];
  if (token) return { label: tokenLabels[token] ?? token.replace('--', ''), sub: displayVal, isHardcoded: false };
  return { label: displayVal, sub: '', isHardcoded: true };
}

function normalizeLibraryTokenName(value: string): string {
  return value.replace(/^--/, '').replace(/-/g, '·');
}

function getLibraryTokenItems(
  tokens: DevInspectorTokenConfig,
  tokenMap: Record<string, string>,
): LibraryTokenItem[] {
  const items: LibraryTokenItem[] = [];
  const seen = new Set<string>();
  const add = (item: LibraryTokenItem) => {
    const key = `${item.category}:${item.name}:${item.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  tokens.colorPalette.forEach(group => {
    group.colors.forEach(color => add({
      id: `color:${group.group}:${color.token || color.label}`,
      category: 'color',
      categoryLabel: '颜色',
      name: color.token || `${group.group}.${color.label}`,
      value: formatColorDisplay(color.val),
      rawValue: color.val,
      usage: `${group.group} / ${color.label}`,
      status: '系统 token',
      preview: 'color',
      previewValue: color.val,
      source: 'system',
    }));
  });

  Object.entries(tokenMap).forEach(([value, token]) => {
    if (!token || seen.has(`color:${token}:${formatColorDisplay(value)}`)) return;
    if (!/^#|rgb|hsl/i.test(value.trim())) return;
    add({
      id: `custom-color:${token}:${value}`,
      category: 'color',
      categoryLabel: '颜色',
      name: token,
      value: formatColorDisplay(value),
      rawValue: value,
      usage: normalizeLibraryTokenName(token),
      status: '自定义 token',
      preview: 'color',
      previewValue: value,
      source: 'custom',
    });
  });

  (tokens.typographyStyles ?? []).forEach(style => add({
    id: `typography-style:${style.key}`,
    category: 'typography',
    categoryLabel: '文字',
    name: style.key,
    value: `${style.value} / ${style.fontWeight}`,
    rawValue: style.value,
    usage: style.usage || style.label,
    status: '系统 token',
    preview: 'text',
    previewValue: style.color,
    source: 'system',
  }));

  tokens.typographyTokens.forEach(token => add({
    id: `typography-token:${token.key}`,
    category: 'typography',
    categoryLabel: '文字',
    name: token.key,
    value: `${token.fontSize} / ${token.fontWeight}`,
    rawValue: token.fontSize,
    usage: token.usage || token.label,
    status: '系统 token',
    preview: 'text',
    previewValue: token.color,
    source: 'system',
  }));

  getContainerStyles(tokens).forEach(style => add({
    id: `appearance:${style.key}`,
    category: 'appearance',
    categoryLabel: '外观',
    name: style.key,
    value: `${style.backgroundVar || formatColorDisplay(style.backgroundColor)} / ${style.borderWidth} / ${style.borderStyle} / ${style.borderRadius}`,
    rawValue: style.backgroundColor,
    usage: style.usage || style.label,
    status: '系统 token',
    preview: 'appearance',
    previewValue: style.borderColor || style.backgroundColor,
    source: 'system',
  }));

  tokens.spaceSteps.forEach(step => add({
    id: `space:${step.label}:${step.val}`,
    category: 'space',
    categoryLabel: '间距',
    name: step.label,
    value: step.val,
    rawValue: step.val,
    usage: step.size || '空值 / 无间距',
    status: '系统 token',
    preview: 'space',
    source: 'system',
  }));

  tokens.radiusPresets.forEach(radius => add({
    id: `radius:${radius.label}:${radius.value}`,
    category: 'radius',
    categoryLabel: '圆角',
    name: radius.token || radius.label,
    value: radius.value,
    rawValue: radius.value,
    usage: radius.sub || '无圆角',
    status: '系统 token',
    preview: 'radius',
    source: 'system',
  }));

  tokens.shadowTokens.forEach(shadow => add({
    id: `shadow:${shadow.cssVar || shadow.label}`,
    category: 'shadow',
    categoryLabel: '阴影',
    name: shadow.cssVar || shadow.label,
    value: shadow.value,
    rawValue: shadow.value,
    usage: shadow.usage,
    status: '系统 token',
    preview: 'shadow',
    source: 'system',
  }));

  return items;
}

const LIBRARY_TOKEN_USAGE_PROPS: Record<LibraryTokenItemCategory, string[]> = {
  color: ['color', 'background-color', 'border-color'],
  typography: ['font-size'],
  appearance: ['background-color', 'border-color', 'border-radius'],
  space: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'gap'],
  radius: ['border-radius'],
  shadow: ['box-shadow'],
};

function getLibraryTokenUsageTargets(item: LibraryTokenItem): Element[] | null {
  if (!item.rawValue || item.rawValue.includes('var(')) return null;
  const needle = item.category === 'color' || item.category === 'appearance'
    ? normalizeColor(item.rawValue)
    : item.rawValue.trim();
  if (!needle || needle === 'transparent') return null;

  const props = LIBRARY_TOKEN_USAGE_PROPS[item.category] ?? [];
  const targets: Element[] = [];
  if (typeof document === 'undefined') return targets;
  document.querySelectorAll('body *').forEach(el => {
    if (isInsidePanel(el)) return;
    const cs = getComputedStyle(el);
    if (props.some(prop => {
      const value = cs.getPropertyValue(prop).trim();
      const normalized = item.category === 'color' || item.category === 'appearance'
        ? normalizeColor(value)
        : value;
      return normalized === needle;
    })) targets.push(el);
  });
  return targets;
}

function countLibraryTokenUsage(item: LibraryTokenItem): number | null {
  return getLibraryTokenUsageTargets(item)?.length ?? null;
}

function getComponentCapabilitySummary(type: string, capability: ComponentCapability): string {
  const parts = [
    capability.editableText ? '文案' : '',
    capability.variantKind ? (capability.variantKind === 'card' ? '展示' : '变体') : '',
    capability.sizeKind ? '尺寸' : '',
    capability.colorKind ? '颜色' : '',
    capability.statusKind ? '状态' : '',
    capability.textSlots?.length ? '可编辑内容' : '',
    capability.childSlots?.length ? '子组件入口' : '',
  ].filter(Boolean);
  return parts.join(' / ') || `${type} 识别`;
}

function ColorSelectButton({
  value,
  label,
  sub,
  isHardcoded,
  title,
  className = '',
  swatchClassName = '',
  swatchStyle,
  onClick,
}: {
  value: string;
  label: string;
  sub?: string;
  isHardcoded?: boolean;
  title: string;
  className?: string;
  swatchClassName?: string;
  swatchStyle?: CSSProperties;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const isEmpty = isTransparentColor(value);
  const displayLabel = isEmpty ? '透明' : isHardcoded ? '自定义色' : label;
  const detail = isEmpty ? '' : sub || (displayLabel !== label ? label : '');
  const buttonTitle = detail ? `${title}: ${displayLabel} ${detail}` : `${title}: ${displayLabel}`;
  return (
    <button
      className={`di-color-select ${className}`.trim()}
      type="button"
      title={buttonTitle}
      onClick={onClick}
    >
      <span
        className={`di-color-select-swatch${swatchClassName ? ` ${swatchClassName}` : ''}${isColorDark(value) ? ' di-color-select-swatch--dark' : ''}${isEmpty ? ' di-color-swatch--empty' : ''}`}
        style={{ background: isEmpty ? undefined : value, ...swatchStyle }}
      />
      <span className="di-color-select-copy">
        <span className={isHardcoded || isEmpty ? 'di-token-name--plain' : 'di-token-name'}>{displayLabel}</span>
      </span>
    </button>
  );
}

function CustomSelectButton({
  title = '自定义',
  className = '',
  onClick,
}: {
  title?: string;
  className?: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`di-custom-select ${className}`.trim()}
      type="button"
      title={title}
      onClick={onClick}
    >
      <span className="di-custom-select-label">自定义</span>
    </button>
  );
}

function SourcePickerButton({
  title,
  className = '',
  onClick,
}: {
  title: string;
  className?: string;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`di-source-action ${className}`.trim()}
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <ComponentIcon size={15} strokeWidth={2.1} aria-hidden="true" />
    </button>
  );
}

function AxisNumberInput({
  label,
  value,
  ariaLabel,
  inputClassName,
  wideLabel = false,
  onChangeValue,
  onStep,
  onFocusValue,
  onBlur,
  onEnter,
}: {
  label: string;
  value: string;
  ariaLabel: string;
  inputClassName: string;
  wideLabel?: boolean;
  onChangeValue: (value: string) => void;
  onStep: (delta: number) => void;
  onFocusValue?: () => void;
  onBlur?: () => void;
  onEnter?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className={`di-number-stepper di-number-stepper--with-axis${wideLabel ? ' di-number-stepper--wide-axis' : ''}`}>
      <span className={`di-field-axis${wideLabel ? ' di-field-axis--wide' : ''}`} aria-hidden="true">{label}</span>
      <input
        className={`${inputClassName} di-number-stepper-input`}
        value={value}
        aria-label={ariaLabel}
        onChange={event => onChangeValue(event.currentTarget.value)}
        onFocus={event => {
          onFocusValue?.();
          event.currentTarget.select();
        }}
        onClick={event => event.currentTarget.select()}
        onMouseUp={event => event.preventDefault()}
        onBlur={onBlur}
        onKeyDown={event => handleArrowKeyStep(event, onStep, () => onEnter?.(event))}
      />
      <div className="di-number-stepper-buttons">
        <button type="button" onClick={() => onStep(1)} aria-label={`${ariaLabel}增加 1px`}>⌃</button>
        <button type="button" onClick={() => onStep(-1)} aria-label={`${ariaLabel}减少 1px`}>⌄</button>
      </div>
    </div>
  );
}

// ─── InspectorPanel：可复用的面板组件 ────────────────────────────
export function InspectorPanel({
  targetEl,
  tokenMap,
  onTokenMapUpdate,
  onTargetChange,
  onClose,
}: {
  targetEl: Element;
  tokenMap: Record<string, string>;
  onTokenMapUpdate: (updates: Record<string, string>) => void;
  onTargetChange: (el: Element) => void;
  onClose: () => void;
}) {
  const isSecondary = false;
  const { componentPreviews, endpoints, tokens } = useDevInspectorConfig();
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
  const [positionBaseVal, setPositionBaseVal] = useState({ x: 0, y: 0 });
  const [widthVal, setWidthVal]     = useState('');
  const [heightVal, setHeightVal]   = useState('');
  const [widthMode, setWidthMode]   = useState<SizeMode>('fixed');
  const [heightMode, setHeightMode] = useState<SizeMode>('hug');
  const [justifyVal, setJustifyVal] = useState('normal');
  const [alignItemsVal, setAlignItemsVal] = useState('normal');
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
  const [pendingJustifyContent, setPendingJustifyContent] = useState('');
  const [pendingAlignItems, setPendingAlignItems] = useState('');
  const [sizeDraft, setSizeDraft] = useState<Partial<Record<SizeAxis, string>>>({});
  const [newTokenProp, setNewTokenProp]   = useState<string | null>(null);
  const [newTokenName, setNewTokenName]   = useState('');
  const [saveMsg, setSaveMsg]             = useState('');
  const [copyMsg, setCopyMsg]             = useState('');
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
  const [badgeStatusVal, setBadgeStatusVal] = useState<BadgeStatusKey>('default');
  const [badgeStatusClassVal, setBadgeStatusClassVal] = useState('');
  const [pendingBadgeStatus, setPendingBadgeStatus] = useState<BadgeStatusKey | ''>('');
  const [cardVariantVal, setCardVariantVal] = useState<CardVariantKey>('default');
  const [cardVariantClassVal, setCardVariantClassVal] = useState('');
  const [pendingCardVariant, setPendingCardVariant] = useState<CardVariantKey | ''>('');
  const [componentMakerSourceMode, setComponentMakerSourceMode] = useState<ComponentMakerSourceMode>('new');
  const [componentMakerAction, setComponentMakerAction] = useState<ComponentMakerAction>('create-current');
  const [componentSpecDraft, setComponentSpecDraft] = useState<ComponentMakerSpecDraft>(EMPTY_COMPONENT_SPEC_DRAFT);
  const [componentCreateOpen, setComponentCreateOpen] = useState(false);
  const [componentCreateContainer, setComponentCreateContainer] = useState<ComponentContainerKey>('page');
  const [componentCreateContainerMenuOpen, setComponentCreateContainerMenuOpen] = useState(false);
  const [componentCreateType, setComponentCreateType] = useState('');
  const [componentCreateTypeMenuOpen, setComponentCreateTypeMenuOpen] = useState(false);
  const [componentCreatePurpose, setComponentCreatePurpose] = useState('');
  const [componentCreateNameTouched, setComponentCreateNameTouched] = useState(false);
  const [componentCreateResolution, setComponentCreateResolution] = useState<ComponentCreateResolution>('new');
  const [componentVariantDraft, setComponentVariantDraft] = useState<ComponentMakerVariantDraft>(EMPTY_COMPONENT_VARIANT_DRAFT);
  const [componentVariantExcludedIds, setComponentVariantExcludedIds] = useState<string[]>([]);
  const [componentVariantPreviewId, setComponentVariantPreviewId] = useState('');
  const [localDrafts, setLocalDrafts] = useState<Record<string, LocalDraftEntry>>({});
  const [styleIntentSummary, setStyleIntentSummary] = useState<StyleIntentSummary>({ pendingCount: 0, latestPending: null, pendingEntries: [] });
  const [activePlugin, setActivePlugin] = useState<InspectorPluginMode | null>(null);
  const [pluginMsg, setPluginMsg] = useState('');
  const [hasCopied, setHasCopied]         = useState(() => _copiedStyles.length > 0);
  const [expandedColor, setExpandedColor] = useState<string | null>(null);
  const [pendingNewToken, setPendingNewToken] = useState<{ cssVar: string; value: string; usage: string } | null>(null);
  const [addTokenModal, setAddTokenModal] = useState<{ value: string; cssProp?: string } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryWorkbenchOpen, setLibraryWorkbenchOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<DesignLibraryTab>('tokens');
  const [libraryTokenCategory, setLibraryTokenCategory] = useState<LibraryTokenCategory>('all');
  const [libraryComponentCategory, setLibraryComponentCategory] = useState<LibraryComponentCategory>('all');
  const [libraryTokenUsageFilter, setLibraryTokenUsageFilter] = useState<DesignLibraryTokenUsageFilter>('all');
  const [librarySearch, setLibrarySearch] = useState('');
  const [selectedLibraryTokenId, setSelectedLibraryTokenId] = useState('');
  const [selectedLibraryComponentId, setSelectedLibraryComponentId] = useState('');
  const [selectedLibraryComponentVariantId, setSelectedLibraryComponentVariantId] = useState('');
  const [libraryTokenForm, setLibraryTokenForm] = useState<LibraryTokenFormDraft | null>(null);
  const [libraryComponentForm, setLibraryComponentForm] = useState<LibraryComponentFormDraft | null>(null);
  const [libraryCustomTokens, setLibraryCustomTokens] = useState<LibraryTokenItem[]>([]);
  const [libraryTokenOverrides, setLibraryTokenOverrides] = useState<Record<string, Partial<LibraryTokenItem>>>({});
  const [libraryDeletedTokenIds, setLibraryDeletedTokenIds] = useState<Record<string, string>>({});
  const [libraryCustomComponents, setLibraryCustomComponents] = useState<LibraryComponentItem[]>([]);
  const [libraryComponentOverrides, setLibraryComponentOverrides] = useState<Record<string, Partial<LibraryComponentItem>>>({});
  const [libraryDeletedComponentIds, setLibraryDeletedComponentIds] = useState<Record<string, string>>({});
  const [customColorVals, setCustomColorVals] = useState<Record<string, string>>({});
  const selectedRef = useRef<Element>(targetEl);
  const localDraftsRef = useRef<Record<string, LocalDraftEntry>>({});
  const gapTargetRef = useRef<HTMLElement | null>(null); // gap 只作用于当前可产生子项间距的容器

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
    return {
      key: `${scope}:${selector}`,
      selector,
      targetLabel: getTargetDisplayLabel(el, componentMeta),
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
    if (el !== targetEl) onTargetChange(el);

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
    if (canControlElementGap(el)) {
      const g = cs.gap.trim();
      setGapVal(g === 'normal' ? '0px' : g);
      gapTargetRef.current = el as HTMLElement;
    } else {
      setGapVal('0px');
      gapTargetRef.current = null;
    }
    setPendingPadding(''); setPendingMargin(''); setPendingGap('');
    setSpaceCustomModes({ padding: false, margin: false, gap: false });

    const nextTranslate = parseTranslate(cs.translate);
    setTranslateVal(nextTranslate);
    setPositionBaseVal(getPositionBase(el, nextTranslate));
    setWidthVal(cs.width.trim());
    setHeightVal(cs.height.trim());
    setWidthMode(inferSizeMode(el, 'width', cs.width.trim()));
    setHeightMode(inferSizeMode(el, 'height', cs.height.trim()));
    setJustifyVal(cs.justifyContent.trim() || 'normal');
    setAlignItemsVal(cs.alignItems.trim() || 'normal');
    setPendingTranslate(null); setPendingWidth(''); setPendingHeight('');
    setPendingWidthMode(null); setPendingHeightMode(null);
    setPendingJustifyContent('');
    setPendingAlignItems('');
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
      const status = inferBadgeStatus(getClasses(el));
      setComponentVariantVal('secondary');
      setComponentVariantClassVal('');
      setComponentSizeVal(inferBadgeSize(el));
      setBadgeStatusVal(status);
      setBadgeStatusClassVal(getBadgeStatusClass(el));
    } else if (isCardComponent) {
      setComponentVariantVal('secondary');
      setComponentVariantClassVal('');
      setComponentSizeVal('m');
      setIconColorVal('default');
      setBadgeStatusVal('default');
      setBadgeStatusClassVal('');
      setCardVariantVal(inferCardVariant(getClasses(el)));
      setCardVariantClassVal(getCardVariantClass(el));
    } else {
      setComponentVariantVal('secondary');
      setComponentVariantClassVal('');
      setComponentSizeVal('m');
      setIconColorVal('default');
      setBadgeStatusVal('default');
      setBadgeStatusClassVal('');
      setCardVariantVal('default');
      setCardVariantClassVal('');
    }
    setPendingComponentText(null);
    setPendingComponentTextSlots({});
    setPendingComponentVariant('');
    setPendingComponentSize('');
    setPendingIconColor('');
    setPendingBadgeStatus('');
    setPendingCardVariant('');
    setComponentMakerSourceMode(selectedComponentMeta ? 'existing' : 'new');
    setComponentMakerAction(selectedComponentMeta ? 'create-current-variant' : 'create-current');
    setComponentSpecDraft(getComponentMakerSpecDefaults(el));
    const suggestedCreateContainer = getSuggestedComponentContainer(el);
    setComponentCreateContainer(suggestedCreateContainer);
    setComponentCreateContainerMenuOpen(false);
    setComponentCreateType(getSuggestedComponentCreatePurposeType(el, suggestedCreateContainer));
    setComponentCreatePurpose(getSuggestedComponentPurpose(el));
    setComponentCreateOpen(false);
    setComponentVariantDraft(getComponentMakerVariantDefaults(el));
    setComponentVariantExcludedIds([]);
    setComponentVariantPreviewId('');
    setNewTokenProp(null);
    setExpandedColor(null);
    setShowScopeHelp(false);
    setIsEditing(false); // 选中新元素时重置为查看模式
    setSelected(el);
  }, [onTargetChange, targetEl]);

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
      ...(pendingGap && gapTargetRef.current ? [['gap', pendingGap] as [string, string]] : []),
      ...(pendingTranslate ? [['translate', formatTranslate(pendingTranslate)] as [string, string]] : []),
      ...(pendingWidth ? [['width', pendingWidth] as [string, string]] : []),
      ...(pendingHeight ? [['height', pendingHeight] as [string, string]] : []),
      ...(fixedMinHeight ? [['min-height', fixedMinHeight] as [string, string]] : []),
      ...(pendingHeight && pendingHeightMode === 'fixed' ? [['max-height', pendingHeight] as [string, string]] : []),
      ...(pendingJustifyContent ? [['justify-content', pendingJustifyContent] as [string, string]] : []),
      ...(pendingAlignItems ? [['align-items', pendingAlignItems] as [string, string]] : []),
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

  function getDisplayPosition(translate: { x: number; y: number }) {
    return {
      x: positionBaseVal.x + translate.x,
      y: positionBaseVal.y + translate.y,
    };
  }

  function getTranslateFromDisplayPosition(pos: { x: number; y: number }) {
    return {
      x: pos.x - positionBaseVal.x,
      y: pos.y - positionBaseVal.y,
    };
  }

  function setTranslateAxis(axis: 'x' | 'y', value: string) {
    const base = getDisplayPosition(pendingTranslate ?? translateVal);
    const nextValue = getNumericCssValue(normalizeCssSize(value));
    const next = getTranslateFromDisplayPosition({ ...base, [axis]: nextValue });
    setPendingTranslate(next);
    liveApply('translate', formatTranslate(next));
  }

  function getAlignmentLabel(prop: AlignProp, value: string): string {
    const options = prop === 'justify-content' ? JUSTIFY_OPTIONS : ALIGN_ITEMS_OPTIONS;
    return options.find(option => option.value === value)?.label ?? value;
  }

  function setAlignment(prop: AlignProp, value: string) {
    if (prop === 'justify-content') setPendingJustifyContent(value);
    else setPendingAlignItems(value);
    liveApply(prop, value);
  }

  function stepTranslateAxis(axis: 'x' | 'y', delta: number) {
    const base = getDisplayPosition(pendingTranslate ?? translateVal);
    setTranslateAxis(axis, `${base[axis] + delta}px`);
  }

  function stepSize(prop: SizeAxis, value: string, delta: number) {
    const fallback = getNumericCssValue(prop === 'width' ? pendingWidth || widthVal : pendingHeight || heightVal);
    const next = `${Math.round(getNumericCssValue(value, fallback) + delta)}px`;
    setSizeDraft(prev => ({ ...prev, [prop]: formatLengthControlValue(next) }));
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

  function updateBadgeStatus(status: BadgeStatusKey) {
    const targets = getComponentTargets();
    if (status === badgeStatusVal) {
      setPendingBadgeStatus('');
      setBadgeStatusOnTargets(targets, badgeStatusVal, badgeStatusClassVal);
      return;
    }
    setPendingBadgeStatus(status);
    setBadgeStatusOnTargets(targets, status);
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

  function getPluginTargetContext(el: Element) {
    const meta = getInspectorComponentMeta(el);
    return {
      meta,
      label: getTargetDisplayLabel(el, meta),
      selector: meta ? getSelectorForScope(el, 'component') : getSelectorForScope(el, 'current'),
    };
  }

  function getComponentMakerSummary(el: Element): string[] {
    const meta = getInspectorComponentMeta(el);
    const capability = getComponentCapability(meta);
    if (!meta || !capability) return ['当前是普通元素：请判断是否应沉淀为组件、primitive 或保持局部元素。'];

    const lines = [
      `组件名：${getComponentDisplayName(meta)}`,
      `类型：${meta.type}`,
      `变体：${meta.variant || 'default'}`,
      `状态：${getComponentStateLabel(meta.state)}`,
    ];
    const textSlots = capability.textSlots?.map(slot => `${slot.label}=${(getComponentSlotElement(el, slot)?.textContent ?? '').trim() || '空'}`) ?? [];
    const childSlots = capability.childSlots?.map(slot => `${slot.label}=${(getComponentSlotElement(el, slot)?.textContent ?? '').trim() || '空'}`) ?? [];
    if (capability.editableText) lines.push(`文案：${getButtonText(el) || '空'}`);
    if (textSlots.length) lines.push(`可编辑内容：${textSlots.join('；')}`);
    if (childSlots.length) lines.push(`子组件：${childSlots.join('；')}`);
    return lines;
  }

  function getComponentMakerComponentOptions(current: Element) {
    const options = new Map<string, { name: string; type: string; layer: string; count: number }>();
    document.querySelectorAll('body *').forEach(item => {
      const node = item as HTMLElement;
      if (node.closest('.di-panel') || node.classList.contains('di-selected')) return;
      const meta = getInspectorComponentMeta(item);
      if (!meta) return;
      const name = getComponentDisplayName(meta);
      const existing = options.get(name);
      if (existing) {
        existing.count += 1;
        return;
      }
      options.set(name, {
        name,
        type: meta.type,
        layer: meta.layer,
        count: 1,
      });
    });

    const currentMeta = getInspectorComponentMeta(current);
    if (currentMeta) {
      const name = getComponentDisplayName(currentMeta);
      if (!options.has(name)) {
        options.set(name, {
          name,
          type: currentMeta.type,
          layer: currentMeta.layer,
          count: 1,
        });
      }
    }

    return Array.from(options.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  function getComponentMakerActions(mode: ComponentMakerSourceMode) {
    return COMPONENT_MAKER_ACTION_OPTIONS.filter(option => {
      if (mode === 'new') return option.key !== 'add-slot';
      return option.key !== 'create-current';
    });
  }

  function syncComponentSpecDraft(updates: Partial<ComponentMakerSpecDraft>) {
    setComponentSpecDraft(prev => ({ ...prev, ...updates }));
  }

  function updateComponentMakerSourceMode(mode: ComponentMakerSourceMode, fallbackName: string) {
    const availableActions = getComponentMakerActions(mode);
    const nextAction = availableActions.some(option => option.key === componentMakerAction)
      ? componentMakerAction
      : availableActions[0].key;
    setComponentMakerSourceMode(mode);
    setComponentMakerAction(nextAction);
    syncComponentSpecDraft({
      sourceMode: mode === 'existing' ? '已有组件' : '新建组件',
      action: COMPONENT_MAKER_ACTION_LABELS[nextAction],
      componentName: fallbackName,
    });
  }

  function updateComponentMakerAction(action: ComponentMakerAction) {
    setComponentMakerAction(action);
    syncComponentSpecDraft({ action: COMPONENT_MAKER_ACTION_LABELS[action] });
  }

  function getSuggestedComponentType(el: Element): string {
    const meta = getInspectorComponentMeta(el);
    if (meta?.type) return COMPONENT_TYPE_ALIASES[meta.type] ?? meta.type;
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1') return '页面标题';
    if (tag === 'h2') return '区块标题';
    if (/^h[3-6]$/.test(tag)) return '小标题';
    if (tag === 'button') return '按钮';
    if (tag === 'a') return '链接文字';
    if (tag === 'img' || tag === 'picture') return '图片';
    if (tag === 'input') return '输入框';
    if (tag === 'textarea') return '文本域';
    if (tag === 'select') return '选择控件';
    if (tag === 'label') return '说明文字';
    if (tag === 'p') return '正文';
    if (tag === 'span' || tag === 'strong' || tag === 'em') return '说明文字';
    if (tag === 'section' || tag === 'main' || tag === 'aside' || tag === 'div') return '容器';
    return '容器';
  }

  function normalizeComponentType(value: string): string {
    return value.trim().toLowerCase();
  }

  function getComponentContainerOption(key: ComponentContainerKey): ComponentContainerOption {
    return COMPONENT_CONTAINER_OPTIONS.find(option => option.key === key) ?? COMPONENT_CONTAINER_OPTIONS[0];
  }

  function getPurposeOptionsForContainer(containerKey: ComponentContainerKey): ComponentPurposeOption[] {
    const labels = COMPONENT_PURPOSES_BY_CONTAINER[containerKey] ?? COMPONENT_PURPOSES_BY_CONTAINER.other;
    return labels
      .map(label => COMPONENT_PURPOSE_OPTIONS.find(option => option.label === label))
      .filter((option): option is ComponentPurposeOption => Boolean(option));
  }

  function isPurposeAllowedForContainer(type: string, containerKey: ComponentContainerKey): boolean {
    const label = getComponentPurposeOption(type).label;
    return getPurposeOptionsForContainer(containerKey).some(option => option.label === label);
  }

  function getDefaultPurposeForContainer(containerKey: ComponentContainerKey): ComponentPurposeOption {
    return getPurposeOptionsForContainer(containerKey)[0] ?? COMPONENT_PURPOSE_OPTIONS[0];
  }

  function getComponentPurposeOption(type: string): ComponentPurposeOption {
    const normalized = COMPONENT_TYPE_ALIASES[type] ?? type.trim();
    if (normalized.includes('标题')) return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '标题')!;
    if (normalized === '正文') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '正文')!;
    if (normalized === '说明文字' || normalized === '链接文字') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '说明')!;
    if (normalized === '状态标签' || normalized === '分类标签') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '标签')!;
    if (normalized === '按钮文字') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '按钮文案')!;
    if (normalized === '按钮') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '操作入口')!;
    if (normalized === '输入框' || normalized === '文本域' || normalized === '选择控件') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '输入控件')!;
    if (normalized === '图标') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '图标')!;
    if (normalized === '列表项') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '功能列表')!;
    if (normalized === '容器' || normalized === '卡片' || normalized === '内容容器' || normalized === '内容区块') return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === '内容区块')!;
    return COMPONENT_PURPOSE_OPTIONS.find(option => option.label === normalized) ?? COMPONENT_PURPOSE_OPTIONS[0];
  }

  function getSuggestedComponentContainer(el: Element): ComponentContainerKey {
    const meta = getInspectorComponentMeta(el);
    if (meta?.type === 'Card') return 'card';
    if (meta?.type === 'Button') return 'action';
    if (meta?.type === 'Badge') return 'card';

    const selfAndAncestors: HTMLElement[] = [];
    let node: Element | null = el;
    while (node && node !== document.body && selfAndAncestors.length < 6) {
      if (node instanceof HTMLElement) selfAndAncestors.push(node);
      node = node.parentElement;
    }
    const haystack = selfAndAncestors
      .map(item => `${item.tagName.toLowerCase()} ${Array.from(item.classList).join(' ')} ${item.getAttribute('role') ?? ''}`)
      .join(' ')
      .toLowerCase();

    if (/\b(card|panel|tile|task-card)\b/.test(haystack)) return 'card';
    if (/\b(menu|dropdown|popover|option)\b/.test(haystack)) return 'menu';
    if (/\b(form|field|input|textarea|select)\b/.test(haystack)) return 'form';
    if (/\b(modal|dialog|drawer|sheet)\b/.test(haystack)) return 'modal';
    if (/\b(list|table|row|item|history)\b/.test(haystack)) return 'list';
    if (/\b(nav|navbar|breadcrumb|tabs)\b/.test(haystack)) return 'navigation';
    if (/\b(actions|toolbar|button-group|footer)\b/.test(haystack)) return 'action';

    const tag = el.tagName.toLowerCase();
    if (tag === 'nav') return 'navigation';
    if (tag === 'form') return 'form';
    if (tag === 'button') return 'action';
    if (tag === 'li' || tag === 'tr') return 'list';
    return 'page';
  }

  function getSuggestedComponentCreatePurposeType(el: Element, containerKey: ComponentContainerKey = getSuggestedComponentContainer(el)): string {
    const tag = el.tagName.toLowerCase();
    const text = (getTextContent(el) ?? '').trim();
    if (/^h[1-6]$/.test(tag)) return '标题';
    if (tag === 'p') return '正文';
    if (tag === 'button') return '按钮文案';
    if (tag === 'input' || tag === 'textarea') return '占位提示';
    if (tag === 'img' || tag === 'svg' || tag === 'picture') return '图标';
    if (tag === 'label') return '说明';
    if (/\b(status|badge|tag|chip)\b/i.test(Array.from((el as HTMLElement).classList ?? []).join(' '))) return '标签';
    if (/^\d+([.,]\d+)?%?$/.test(text)) return '数值';
    if (tag === 'span' || tag === 'strong' || tag === 'em' || tag === 'a') return text.length <= 12 ? '说明' : '正文';
    if (containerKey === 'list') return '功能列表';
    if (tag === 'section' || tag === 'main' || tag === 'aside' || tag === 'div') return '内容区块';
    const suggested = getComponentPurposeOption(getSuggestedComponentType(el)).label;
    return isPurposeAllowedForContainer(suggested, containerKey) ? suggested : getDefaultPurposeForContainer(containerKey).label;
  }

  function getComponentTypeOption(type: string): ComponentTypeOption | undefined {
    const canonicalType = COMPONENT_TYPE_ALIASES[type] ?? type;
    return COMPONENT_TYPE_OPTIONS.find(item => normalizeComponentType(item.label) === normalizeComponentType(canonicalType));
  }

  function getComponentTypeClassification(type: string, fallbackGroup: ComponentTypeGroup = 'structure', containerKey?: ComponentContainerKey) {
    const option = getComponentTypeOption(type);
    const normalized = COMPONENT_TYPE_ALIASES[type] ?? type.trim();
    const purpose = getComponentPurposeOption(type);
    const group = option?.group ?? purpose.group ?? fallbackGroup;
    const groupLabel = containerKey ? getComponentContainerOption(containerKey).label : COMPONENT_TYPE_GROUP_LABELS[group];
    const category = option?.category ?? '自定义';
    const label = containerKey ? purpose.label : (option?.label ?? (normalized || '自定义'));
    return {
      group,
      groupLabel,
      category,
      label,
      path: containerKey ? `${groupLabel} / ${label}` : `${groupLabel} / ${category} / ${label}`,
    };
  }

  function getSuggestedComponentTypeGroup(el: Element): ComponentTypeGroup {
    const option = getComponentTypeOption(getSuggestedComponentType(el));
    if (option) return option.group;
    const tag = el.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag) || tag === 'p' || tag === 'span' || tag === 'strong' || tag === 'em' || tag === 'label' || tag === 'a') return 'text';
    if (tag === 'button') return 'action';
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'form';
    if (tag === 'img' || tag === 'picture' || tag === 'svg') return 'media';
    if (tag === 'nav') return 'navigation';
    return 'structure';
  }

  function getComponentTypeHint(type: string): string {
    const option = getComponentTypeOption(type);
    const purpose = getComponentPurposeOption(type);
    return option ? `${purpose.label} · ${purpose.hint}` : `${purpose.label} · ${purpose.hint}`;
  }

  function getComponentNameByType(type: string, el: Element, containerKey?: ComponentContainerKey): string {
    const normalized = COMPONENT_TYPE_ALIASES[type] ?? type.trim();
    const option = getComponentTypeOption(normalized);
    const purpose = getComponentPurposeOption(type);
    if (containerKey) {
      const container = getComponentContainerOption(containerKey);
      if (container.key === 'other' && purpose.group === 'structure') return purpose.codePart === 'section' ? 'container' : purpose.codePart;
      return `${container.codePrefix}-${purpose.codePart}`;
    }
    const tag = el.tagName.toLowerCase();
    if (normalized === '页面标题' && tag === 'h1') return 'page-title';
    if (normalized === '区块标题' && tag === 'h2') return 'section-title';
    if (normalized === '小标题' && /^h[3-6]$/.test(tag)) return 'subsection-title';
    return option?.codeName ?? normalizeComponentMakerCodePart(normalized) ?? 'component';
  }

  function getComponentSpecValuePart(value: string, label: string): string {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = value.match(new RegExp(`${escaped}：([^；]+)`));
    return match?.[1]?.trim() ?? '';
  }

  function getRecordedComponentSpecs() {
    return Object.values(localDraftsRef.current).flatMap(draft => (
      draft.changes
        .filter(change => change.prop === 'component-spec')
        .map(change => ({
          targetLabel: draft.targetLabel,
          componentName: getComponentSpecValuePart(change.val, '组件名'),
          classification: getComponentSpecValuePart(change.val, '归类'),
          usage: getComponentSpecValuePart(change.val, '使用场景'),
        }))
        .filter(spec => spec.componentName || spec.classification)
    ));
  }

  function getExistingComponentCreateMatch(classification: string, componentName: string) {
    const recordedSpecs = getRecordedComponentSpecs();
    const byClassification = recordedSpecs.find(spec => spec.classification === classification);
    if (byClassification) return byClassification;

    const normalizedName = normalizeComponentMakerCodePart(componentName);
    if (!normalizedName) return null;

    const recordedByName = recordedSpecs.find(spec => normalizeComponentMakerCodePart(spec.componentName) === normalizedName);
    if (recordedByName) return recordedByName;

    const current = selectedRef.current;
    const existingKnown = current ? getComponentMakerComponentOptions(current).find(option =>
      normalizeComponentMakerCodePart(option.name) === normalizedName
    ) : null;
    return existingKnown ? {
      targetLabel: existingKnown.name,
      componentName: existingKnown.name,
      classification,
      usage: `${existingKnown.type} · ${existingKnown.count}`,
    } : null;
  }

  function getUniqueComponentName(baseName: string) {
    const normalizedBase = normalizeComponentMakerCodePart(baseName) || 'component';
    const current = selectedRef.current;
    const used = new Set([
      ...getRecordedComponentSpecs().map(spec => normalizeComponentMakerCodePart(spec.componentName)),
      ...(current ? getComponentMakerComponentOptions(current).map(option => normalizeComponentMakerCodePart(option.name)) : []),
    ].filter(Boolean));
    if (!used.has(normalizedBase)) return normalizedBase;
    for (const suffix of ['alt', 'custom', 'local', 'variant']) {
      const candidate = `${normalizedBase}-${suffix}`;
      if (!used.has(candidate)) return candidate;
    }
    let index = 2;
    while (used.has(`${normalizedBase}-${index}`)) index += 1;
    return `${normalizedBase}-${index}`;
  }

  function getSuggestedComponentPurposeByType(type: string, el: Element, containerKey: ComponentContainerKey = getSuggestedComponentContainer(el)): string {
    const label = getElementDisplayName(el);
    const container = getComponentContainerOption(containerKey).label;
    const purpose = getComponentPurposeOption(type).label;
    if (purpose === '标题') return `用于${container}标题展示`;
    if (purpose === '正文') return `用于${container}正文内容展示`;
    if (purpose === '说明') return `用于${container}辅助说明展示`;
    if (purpose === '标签' || purpose === '状态') return `用于${container}状态或标签展示`;
    if (purpose === '按钮文案') return `用于${container}操作按钮文案`;
    if (purpose === '占位提示') return `用于${container}输入提示`;
    if (purpose === '数值') return `用于${container}数值展示`;
    if (purpose === '图标') return `用于${container}图标展示`;
    if (purpose === '内容区块') return `用于承载${label}区域内容`;
    if (purpose === '功能列表') return `用于${container}功能条目展示`;
    if (purpose === '数据列表') return `用于${container}数据记录展示`;
    if (purpose === '导航列表') return `用于${container}导航入口展示`;
    if (purpose === '步骤列表') return `用于${container}流程步骤展示`;
    if (purpose === '内容列表') return `用于${container}内容集合展示`;
    if (purpose === '菜单项') return `用于${container}菜单项展示`;
    if (purpose === '分组标题') return `用于${container}分组标题展示`;
    if (purpose === '导航项') return `用于${container}导航入口展示`;
    if (purpose === '主操作') return `用于${container}主操作`;
    if (purpose === '次操作') return `用于${container}次级操作`;
    if (purpose === '图标按钮') return `用于${container}图标操作`;
    return `用于${label}展示`;
  }

  function getSuggestedComponentSlotsByType(type: string): string {
    const option = getComponentTypeOption(type);
    return option?.slotLabel && option.slotLabel !== '无' ? option.slotLabel : '内容';
  }

  function getSuggestedComponentName(el: Element): string {
    const meta = getInspectorComponentMeta(el);
    if (meta) return getComponentDisplayName(meta);
    const tag = el.tagName.toLowerCase();
    const tagNameMap: Record<string, string> = {
      h1: 'page-title',
      h2: 'section-title',
      h3: 'subsection-title',
      p: 'body-text',
      span: 'inline-text',
      strong: 'strong-text',
      em: 'emphasis-text',
      a: 'text-link',
      label: 'form-label',
      button: 'button',
      img: 'image',
      section: 'section',
      main: 'main-content',
      aside: 'side-content',
      div: 'container',
    };
    if (tagNameMap[tag] && /^h[1-6]$/.test(tag)) return tagNameMap[tag];

    const semanticClass = getClasses(el).find(className =>
      !isStateClass(className)
      && !/^lucide(-|$)/.test(className)
      && /[a-zA-Z]/.test(className)
    );
    return normalizeComponentMakerCodePart(semanticClass || tagNameMap[tag] || getElementDisplayName(el)) || 'component';
  }

  function getSuggestedComponentPurpose(el: Element): string {
    const container = getSuggestedComponentContainer(el);
    const type = getSuggestedComponentCreatePurposeType(el, container);
    return getSuggestedComponentPurposeByType(type, el, container);
  }

  function getSuggestedComponentSlots(el: Element): string {
    const text = (getTextContent(el) ?? '').trim();
    const type = getSuggestedComponentType(el);
    if (!text) return '内容';
    return getSuggestedComponentSlotsByType(type);
  }

  function getEditablePartFieldName(label: string, type: string): string {
    const normalized = COMPONENT_TYPE_ALIASES[type] ?? type;
    if (label.includes('说明')) return 'description';
    if (label.includes('标签') || label.includes('状态')) return 'statusBadge';
    if (label.includes('按钮') || normalized === '按钮文字' || normalized === '按钮') return 'label';
    if (label.includes('标题')) return 'title';
    if (label.includes('正文') || label.includes('内容')) return 'content';
    return normalizeComponentMakerCodePart(label) || 'content';
  }

  function makeEditablePart(part: {
    id: string;
    label: string;
    value: string;
    type: string;
    editable?: boolean;
    readonlyReason?: string;
  }): ComponentMakerEditablePart {
    return {
      id: part.id,
      label: part.label,
      value: part.value.trim(),
      fieldName: getEditablePartFieldName(part.label, part.type),
      editable: part.editable ?? true,
      readonlyReason: part.readonlyReason,
    };
  }

  function getComponentCreateEditableParts(el: Element, type = getSuggestedComponentType(el)): ComponentMakerEditablePart[] {
    const meta = getInspectorComponentMeta(el);
    const capability = getComponentCapability(meta);
    const parts: ComponentMakerEditablePart[] = [];
    const pushUnique = (part: ComponentMakerEditablePart) => {
      if (!part.value && !part.label) return;
      if (parts.some(item => item.id === part.id || (item.label === part.label && item.value === part.value))) return;
      parts.push(part);
    };

    if (capability?.textSlots?.length) {
      capability.textSlots.forEach(slot => pushUnique(makeEditablePart({
        id: slot.key,
        label: slot.label,
        value: getComponentSlotValues(el, [slot])[slot.key] ?? '',
        type,
      })));
    }
    if (capability?.editableText) {
      pushUnique(makeEditablePart({
        id: 'text',
        label: getSuggestedComponentSlotsByType(type),
        value: getButtonText(el),
        type,
      }));
    }
    if (capability?.childSlots?.length) {
      capability.childSlots.forEach(slot => {
        const value = getComponentSlotValues(el, [slot])[slot.key] ?? '';
        if (!value) return;
        pushUnique(makeEditablePart({
          id: slot.key,
          label: slot.label,
          value,
          type,
          editable: false,
          readonlyReason: '子组件',
        }));
      });
    }

    if (!parts.length) {
      const directText = (getTextContent(el) ?? '').trim();
      if (directText) {
        pushUnique(makeEditablePart({
          id: 'text',
          label: getSuggestedComponentSlotsByType(type),
          value: directText,
          type,
        }));
      }
    }

    if (!parts.length) {
      const candidates: Array<{ id: string; label: string; selector: string; editable: boolean; readonlyReason?: string }> = [
        { id: 'title', label: '标题', selector: '[data-di-slot="title"], .task-title, .card-title, h1, h2, h3', editable: true },
        { id: 'description', label: '说明文', selector: '[data-di-slot="description"], .card-desc, .card-description, p', editable: true },
        { id: 'statusBadge', label: '标签', selector: '[data-di-slot="status"], .status-badge, .badge, .tag, .chip', editable: false, readonlyReason: '子组件' },
      ];
      candidates.forEach(candidate => {
        const target = el.querySelector(candidate.selector);
        const value = (target?.textContent ?? '').trim();
        if (!value) return;
        pushUnique(makeEditablePart({
          id: candidate.id,
          label: candidate.label,
          value,
          type,
          editable: candidate.editable,
          readonlyReason: candidate.readonlyReason,
        }));
      });
    }

    if (!parts.length) {
      const allText = (el.textContent ?? '').trim();
      if (allText) {
        pushUnique(makeEditablePart({
          id: 'content',
          label: '内容',
          value: allText,
          type,
        }));
      }
    }

    return parts;
  }

  function getComponentEditablePartsSummary(parts: ComponentMakerEditablePart[]): string {
    const editable = parts.filter(part => part.editable);
    if (editable.length) return editable.map(part => part.label).join('；');
    return parts.length ? parts.map(part => `${part.label}（只读）`).join('；') : '内容';
  }

  function getComponentCreateStyleRules(type: string, purpose: string, fallbackGroup: ComponentTypeGroup = 'structure', containerKey?: ComponentContainerKey): string {
    const classification = getComponentTypeClassification(type, fallbackGroup, containerKey);
    return [
      `组件归类：${classification.path}`,
      `使用场景：${purpose.trim() || '用于当前元素复用'}`,
      '使用当前元素的文字、外观、布局、阴影和间距作为组件默认样式',
      'token 优先：能匹配 token 的使用 token，无法匹配的保留自定义值',
      '暂不创建变体',
      '创建后用新组件替换当前元素',
      '不修改业务逻辑',
    ].join('；');
  }

  function getComponentMakerSpecDefaults(el: Element): ComponentMakerSpecDraft {
    const meta = getInspectorComponentMeta(el);
    const capability = getComponentCapability(meta);
    const suggestedContainer = getSuggestedComponentContainer(el);
    const suggestedType = getSuggestedComponentCreatePurposeType(el, suggestedContainer);
    const suggestedTypeGroup = getComponentPurposeOption(suggestedType).group;
    const classification = getComponentTypeClassification(suggestedType, suggestedTypeGroup, suggestedContainer).path;
    const editableParts = getComponentCreateEditableParts(el, suggestedType);
    const variantLabel = meta
      ? [
          capability?.variantKind === 'card' ? `展示=${getCardDisplayLabel(meta.variant)}` : `变体=${meta.variant || 'default'}`,
          `状态=${getComponentStateLabel(meta.state)}`,
        ].join('；')
      : 'default';
    return {
      sourceMode: meta ? '已有组件' : '新建组件',
      action: meta ? '新增当前变体' : '创建组件',
      classification: meta ? '' : classification,
      componentName: meta ? getComponentDisplayName(meta) : getComponentNameByType(suggestedType, el, suggestedContainer),
      usage: meta ? '' : getSuggestedComponentPurpose(el),
      editableParts,
      variants: variantLabel,
      slots: editableParts.length ? getComponentEditablePartsSummary(editableParts) : getSuggestedComponentSlots(el),
      styleRules: meta
        ? '沿用当前组件白名单，只开放允许修改的 props、可编辑内容、variant 和 token。'
        : getComponentCreateStyleRules(suggestedType, getSuggestedComponentPurpose(el), suggestedTypeGroup, suggestedContainer),
    };
  }

  function getComponentMakerVariantDefaults(el: Element): ComponentMakerVariantDraft {
    const meta = getInspectorComponentMeta(el);
    const capability = getComponentCapability(meta);
    const dimension = capability?.variantKind === 'card'
      ? '展示'
      : capability?.variantKind
        ? '变体'
        : capability?.statusKind
          ? '状态'
          : capability?.sizeKind
            ? '尺寸'
            : '自定义';
    const base = meta
      ? capability?.variantKind === 'card'
        ? getCardDisplayLabel(meta.variant)
        : meta.variant || getComponentStateLabel(meta.state)
      : '当前样式';
    return {
      dimension,
      name: '',
      base,
      rules: '基于当前组件样式创建新变体；只新增组件 API、token 映射和样式规则，不改业务逻辑。',
    };
  }

  function getComponentMakerDimensionDisplayName(dimension: string): string {
    if (dimension === '状态') return '交互状态';
    if (dimension === '尺寸') return '大小规格';
    if (dimension === '展示') return '展示形态';
    if (dimension === '变体') return '外观变体';
    if (dimension === '颜色') return '颜色规格';
    return dimension || '规格';
  }

  function normalizeComponentMakerCodePart(value: string): string {
    return value
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  function getGeneratedComponentMakerVariantName(componentName: string, item: ComponentMakerVariantSuggestion | null): string {
    const base = normalizeComponentMakerCodePart(componentName) || 'component';
    const suffix = normalizeComponentMakerCodePart(item?.name || item?.label || 'variant') || 'variant';
    return `${base}--${suffix}`;
  }

  function makeComponentMakerVariantSuggestion(item: {
    id: string;
    dimension: string;
    name: string;
    label: string;
    base: string;
    rules: string;
    description: string;
    visual: ComponentMakerVariantVisual;
  }): ComponentMakerVariantSuggestion {
    return item;
  }

  function getComponentMakerVariantSuggestions(el: Element): ComponentMakerVariantSuggestion[] {
    const meta = getInspectorComponentMeta(el);
    const capability = getComponentCapability(meta);
    const base = getComponentMakerVariantDefaults(el).base || '当前样式';
    const cs = getComputedStyle(el);
    const colorInfo = getDisplayLabel(normalizeColor(cs.color), tokenMap, colorPalette, tokenLabels);
    const currentStyle = `${formatFontSizeControlValue(cs.fontSize.trim())} / ${cs.fontWeight.trim()} / ${colorInfo.label}`;
    const withBase = (item: Omit<ComponentMakerVariantSuggestion, 'base'>) => makeComponentMakerVariantSuggestion({
      ...item,
      base,
    });

    if (capability?.type === 'Button') {
      return [
        ...BUTTON_VARIANT_OPTIONS.map(option => withBase({
          id: `button-variant-${option.key}`,
          dimension: '变体',
          name: option.key,
          label: option.label,
          description: '按钮外观分支',
          rules: `补齐 ${option.label} 的默认、hover、focus-visible 和 disabled 视觉规则。`,
          visual: option.key === 'primary' ? 'brand' : option.key === 'ghost' ? 'neutral' : option.key === 'text' ? 'compact' : 'floating',
        })),
        ...BUTTON_SIZE_OPTIONS.map(option => withBase({
          id: `button-size-${option.key}`,
          dimension: '尺寸',
          name: option.key.toUpperCase(),
          label: option.label,
          description: `${option.minHeight} 高度规格`,
          rules: `新增 ${option.label} 尺寸：高度 ${option.minHeight}，内边距 ${option.padding}，字号 ${option.fontSize}。`,
          visual: 'size',
        })),
        withBase({
          id: 'button-state-disabled',
          dimension: '状态',
          name: 'disabled',
          label: '禁用',
          description: '不可点击状态',
          rules: '新增 disabled 状态：降低对比度，保留可读性，并禁止 hover 强反馈。',
          visual: 'disabled',
        }),
      ];
    }

    if (capability?.type === 'Badge') {
      return [
        ...BADGE_STATUS_OPTIONS.map(option => withBase({
          id: `badge-status-${option.key}`,
          dimension: '状态',
          name: option.key,
          label: option.label,
          description: '标签语义状态',
          rules: `补齐 ${option.label} 标签状态：背景、文字色、边框色优先复用语义 token。`,
          visual: option.key === 'success' ? 'success' : option.key === 'warning' ? 'warning' : option.key === 'danger' ? 'danger' : option.key === 'progress' ? 'brand' : 'neutral',
        })),
        ...BADGE_SIZE_OPTIONS.map(option => withBase({
          id: `badge-size-${option.key}`,
          dimension: '尺寸',
          name: option.key.toUpperCase(),
          label: option.label,
          description: `${option.minHeight} 标签尺寸`,
          rules: `新增 ${option.label} 尺寸：高度 ${option.minHeight}，内边距 ${option.padding}，字号 ${option.fontSize}。`,
          visual: 'size',
        })),
      ];
    }

    if (capability?.type === 'Card') {
      return [
        ...CARD_VARIANT_OPTIONS.filter(option => option.key !== 'default').map(option => withBase({
          id: `card-display-${option.key}`,
          dimension: '展示',
          name: option.key,
          label: option.label,
          description: '卡片展示形态',
          rules: `新增 ${option.label} 展示：基于当前卡片结构调整容器、阴影、间距和标题层级；可编辑内容保持不变。`,
          visual: option.key === 'compact' ? 'compact' : option.key === 'floating' ? 'floating' : option.key === 'emphasis' ? 'emphasis' : 'neutral',
        })),
        ...COMPONENT_INTERACTION_STATE_OPTIONS.map(option => withBase({
          id: `card-state-${option.key}`,
          dimension: '状态',
          name: option.key,
          label: option.label,
          description: option.description,
          rules: `新增 ${option.label} 交互状态：保留卡片结构，只调整视觉反馈和可访问状态。`,
          visual: option.visual,
        })),
        ...COMPONENT_GENERIC_SIZE_OPTIONS.map(option => withBase({
          id: `card-size-${option.key}`,
          dimension: '尺寸',
          name: option.key,
          label: option.label,
          description: option.description,
          rules: `新增 ${option.label} 大小规格：基于当前卡片调整内边距、最小高度和文字层级。`,
          visual: option.visual,
        })),
      ];
    }

    if (capability?.type === 'Icon') {
      return [
        ...ICON_COLOR_OPTIONS.map(option => withBase({
          id: `icon-color-${option.key}`,
          dimension: '颜色',
          name: option.key,
          label: option.label,
          description: '图标语义色',
          rules: `新增 ${option.label} 图标颜色映射：${option.value}。`,
          visual: option.key === 'success' ? 'success' : option.key === 'warning' ? 'warning' : option.key === 'danger' ? 'danger' : option.key === 'brand' ? 'brand' : 'neutral',
        })),
        ...ICON_SIZE_OPTIONS.map(option => withBase({
          id: `icon-size-${option.key}`,
          dimension: '尺寸',
          name: option.key.toUpperCase(),
          label: option.label,
          description: `${option.size} 图标尺寸`,
          rules: `新增 ${option.label} 图标尺寸：宽高 ${option.size}。`,
          visual: 'size',
        })),
      ];
    }

    const target = meta ? getComponentDisplayName(meta) : getElementDisplayName(el, meta);
    return [
      withBase({
        id: 'generic-default',
        dimension: '展示',
        name: 'default',
        label: '默认',
        description: currentStyle,
        rules: `沉淀 ${target} 的当前样式为默认态：${currentStyle}。`,
        visual: 'neutral',
      }),
      withBase({
        id: 'generic-compact',
        dimension: '展示',
        name: 'compact',
        label: '紧凑',
        description: '压缩空间',
        rules: '基于当前样式生成紧凑形态：字号、间距或高度降低一档，保持可读。',
        visual: 'compact',
      }),
      withBase({
        id: 'generic-emphasis',
        dimension: '展示',
        name: 'emphasis',
        label: '强调',
        description: '增强重点',
        rules: '基于当前样式生成强调形态：提升字重或语义色，不改变业务内容。',
        visual: 'emphasis',
      }),
      withBase({
        id: 'generic-muted',
        dimension: '状态',
        name: 'muted',
        label: '弱化',
        description: '降低层级',
        rules: '基于当前样式生成弱化形态：降低文字色层级或透明度，保留布局。',
        visual: 'disabled',
      }),
      withBase({
        id: 'generic-size-s',
        dimension: '尺寸',
        name: 'S',
        label: 'S',
        description: '小尺寸',
        rules: '基于当前样式生成小尺寸规格，压缩字号、内边距或高度一档。',
        visual: 'size',
      }),
      withBase({
        id: 'generic-size-l',
        dimension: '尺寸',
        name: 'L',
        label: 'L',
        description: '大尺寸',
        rules: '基于当前样式生成大尺寸规格，放大字号、内边距或高度一档。',
        visual: 'size',
      }),
    ];
  }

  function stripInspectorArtifactsFromPreview(el: Element) {
    el.classList.remove('di-selected');
    el.removeAttribute('data-di-panel-role');
    el.querySelectorAll('*').forEach(child => {
      child.classList.remove('di-selected');
      child.removeAttribute('data-di-panel-role');
    });
  }

  function applyGenericVariantPreview(el: Element, item: ComponentMakerVariantSuggestion) {
    if (!(el instanceof HTMLElement)) return;
    const key = item.name.toLowerCase();
    if (item.visual === 'compact') {
      el.style.setProperty('transform', key === 'pressed' ? 'scale(0.98)' : 'scale(0.92)');
      el.style.setProperty('transform-origin', 'left center');
    }
    if (item.visual === 'floating') {
      el.style.setProperty('box-shadow', '0 12px 28px rgba(15, 23, 42, 0.16)');
      el.style.setProperty('transform', 'translateY(-2px)');
      el.style.setProperty('transform-origin', 'left center');
    }
    if (item.visual === 'emphasis') {
      el.style.setProperty('font-weight', '800');
      el.style.setProperty('color', 'var(--color-text-strong, #0f172a)');
    }
    if (item.visual === 'brand') {
      el.style.setProperty('outline', '2px solid #7c3aed');
      el.style.setProperty('outline-offset', '2px');
    }
    if (item.visual === 'disabled') {
      el.style.setProperty('opacity', '0.52');
    }
    if (item.id.includes('-size-s')) {
      el.style.setProperty('transform', 'scale(0.92)');
      el.style.setProperty('transform-origin', 'left center');
    }
    if (item.id.includes('-size-l')) {
      el.style.setProperty('transform', 'scale(1.04)');
      el.style.setProperty('transform-origin', 'left center');
    }
  }

  function applyComponentMakerPreviewVariant(el: Element, item: ComponentMakerVariantSuggestion | null) {
    if (!item) return;
    const key = item.name.toLowerCase();

    if (item.id.startsWith('card-display-')) {
      setCardVariantOnTargets([el], key as CardVariantKey);
      return;
    }
    if (item.id.startsWith('card-state-') || item.id.startsWith('card-size-')) {
      applyGenericVariantPreview(el, item);
      return;
    }
    if (item.id.startsWith('button-variant-')) {
      setButtonVariantOnTargets([el], key as ButtonVariantKey);
      return;
    }
    if (item.id.startsWith('button-size-')) {
      setButtonSizeOnTargets([el], key as ButtonSizeKey);
      return;
    }
    if (item.id.startsWith('badge-status-')) {
      setBadgeStatusOnTargets([el], key as BadgeStatusKey);
      return;
    }
    if (item.id.startsWith('badge-size-')) {
      setBadgeSizeOnTargets([el], key as ButtonSizeKey);
      return;
    }
    if (item.id.startsWith('icon-color-')) {
      setIconColorOnTargets([el], key as IconColorKey);
      return;
    }
    if (item.id.startsWith('icon-size-')) {
      setIconSizeOnTargets([el], key as ButtonSizeKey);
      return;
    }

    applyGenericVariantPreview(el, item);
  }

  function getComponentMakerLivePreviewHtml(el: Element, item: ComponentMakerVariantSuggestion | null): string {
    const clone = el.cloneNode(true) as Element;
    stripInspectorArtifactsFromPreview(clone);
    applyComponentMakerPreviewVariant(clone, item);
    clone.classList.add('di-plugin-preview-node');
    if (clone instanceof HTMLElement) {
      clone.style.setProperty('max-width', '100%');
      clone.style.setProperty('box-sizing', 'border-box');
    }
    return clone.outerHTML;
  }

  function getSelectedComponentMakerVariantItems(el: Element): ComponentMakerVariantSuggestion[] {
    return getComponentMakerVariantSuggestions(el)
      .filter(item => !componentVariantExcludedIds.includes(item.id));
  }

  function getActiveComponentMakerVariantDraft(el: Element): ComponentMakerVariantDraft {
    const selectedItems = getSelectedComponentMakerVariantItems(el);
    return {
      ...componentVariantDraft,
      items: selectedItems,
      dimension: selectedItems.length === 1 ? selectedItems[0].dimension : componentVariantDraft.dimension,
      name: selectedItems.length === 1 ? selectedItems[0].name : componentVariantDraft.name,
      rules: selectedItems.length
        ? '基于当前选中对象生成一组组件变体草案；选中卡片即为本次要创建的变体。'
        : componentVariantDraft.rules,
    };
  }

  function toggleComponentMakerVariantSuggestion(id: string) {
    setComponentVariantPreviewId(id);
    setComponentVariantExcludedIds(prev => (
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    ));
  }

  function copyPluginPrompt(prompt: string, successMsg: string) {
    if (!prompt) return;
    copyTextToClipboard(prompt)
      .then(copied => {
        setPluginMsg(copied ? successMsg : '复制失败');
        setTimeout(() => setPluginMsg(''), copied ? 2200 : 1800);
      })
      .catch(() => {
        setPluginMsg('复制失败');
        setTimeout(() => setPluginMsg(''), 1800);
      });
  }

  function handleRecordComponentSpecDraft(draftOverride: ComponentMakerSpecDraft = componentSpecDraft) {
    const nextEntry = buildComponentSpecDraftEntry(draftOverride);
    setLocalDrafts(prev => ({ ...prev, [nextEntry.key]: nextEntry }));
    setPluginMsg('组件规格已记录 ✓');
    setTimeout(() => setPluginMsg(''), 2200);
  }

  function buildComponentSpecDraftEntry(draftOverride: ComponentMakerSpecDraft): LocalDraftEntry {
    const el = selectedRef.current;
    const info = getDraftTargetInfo(el);
    const val = formatComponentMakerSpecDraft(draftOverride);
    const existing = localDraftsRef.current[info.key];
    const existingByProp = new Map(existing?.changes.map(change => [change.prop, change]) ?? []);
    const mergedByProp = new Map<string, LocalDraftChange>();
    existing?.changes.forEach(change => mergedByProp.set(change.prop, change));
    const previous = existingByProp.get('component-spec');
    mergedByProp.set('component-spec', {
      prop: 'component-spec',
      from: previous?.from ?? '未记录',
      val,
    });
    return {
      ...info,
      changes: Array.from(mergedByProp.values()),
      updatedAt: Date.now(),
    };
  }

  function openComponentCreateDrawer() {
    const el = selectedRef.current;
    setLibraryOpen(false);
    const defaults = getComponentMakerSpecDefaults(el);
    const suggestedContainer = getSuggestedComponentContainer(el);
    const suggestedType = getSuggestedComponentCreatePurposeType(el, suggestedContainer);
    const suggestedGroup = getComponentPurposeOption(suggestedType).group;
    const classification = getComponentTypeClassification(suggestedType, suggestedGroup, suggestedContainer).path;
    const suggestedName = getComponentNameByType(suggestedType, el, suggestedContainer);
    const existingMatch = getExistingComponentCreateMatch(classification, suggestedName);
    const resolution: ComponentCreateResolution = existingMatch ? 'reuse' : 'new';
    setComponentMakerSourceMode('new');
    setComponentMakerAction('create-current');
    setComponentSpecDraft({
      ...defaults,
      sourceMode: resolution === 'reuse' ? '复用已有组件' : '新建组件',
      action: resolution === 'reuse' ? '复用组件' : '创建组件',
      classification,
      componentName: resolution === 'reuse' && existingMatch?.componentName ? existingMatch.componentName : suggestedName,
      usage: getSuggestedComponentPurposeByType(suggestedType, el, suggestedContainer),
      editableParts: getComponentCreateEditableParts(el, suggestedType),
      variants: '暂不创建',
    });
    setComponentCreateContainer(suggestedContainer);
    setComponentCreateContainerMenuOpen(false);
    setComponentCreateType(suggestedType);
    setComponentCreateTypeMenuOpen(false);
    setComponentCreatePurpose(getSuggestedComponentPurposeByType(suggestedType, el, suggestedContainer));
    setComponentCreateNameTouched(false);
    setComponentCreateResolution(resolution);
    setComponentCreateOpen(true);
  }

  function applyComponentCreateContainer(nextContainer: ComponentContainerKey) {
    const el = selectedRef.current;
    if (!el) return;
    const currentType = componentCreateType || getSuggestedComponentCreatePurposeType(el, componentCreateContainer);
    const type = isPurposeAllowedForContainer(currentType, nextContainer)
      ? currentType
      : getSuggestedComponentCreatePurposeType(el, nextContainer);
    const group = getComponentPurposeOption(type).group;
    const classification = getComponentTypeClassification(type, group, nextContainer).path;
    const nextSuggestedName = getComponentNameByType(type, el, nextContainer);
    const existingMatch = getExistingComponentCreateMatch(classification, nextSuggestedName);
    const nextResolution: ComponentCreateResolution = existingMatch ? 'reuse' : 'new';
    const currentName = componentSpecDraft.componentName.trim();
    const previousSuggestedName = getComponentNameByType(type, el, componentCreateContainer);
    const shouldUpdateName = !componentCreateNameTouched || !currentName || currentName === previousSuggestedName || currentName === getSuggestedComponentName(el);
    const nextPurpose = getSuggestedComponentPurposeByType(type, el, nextContainer);

    setComponentCreateContainer(nextContainer);
    setComponentCreateType(type);
    setComponentCreateContainerMenuOpen(false);
    setComponentCreatePurpose(nextPurpose);
    setComponentCreateResolution(nextResolution);
    syncComponentSpecDraft({
      sourceMode: nextResolution === 'reuse' ? '复用已有组件' : '新建组件',
      action: nextResolution === 'reuse' ? '复用组件' : '创建组件',
      classification,
      usage: nextPurpose,
      ...(shouldUpdateName ? { componentName: nextResolution === 'reuse' && existingMatch?.componentName ? existingMatch.componentName : nextSuggestedName } : {}),
      styleRules: getComponentCreateStyleRules(type, nextPurpose, group, nextContainer),
    });
  }

  function applyComponentCreateType(nextType: string) {
    const type = nextType.trim();
    if (!type) return;
    const el = selectedRef.current;
    if (!el) return;
    const previousType = componentCreateType;
    const currentName = componentSpecDraft.componentName.trim();
    const currentSlots = componentSpecDraft.slots.trim();
    const previousSuggestedName = previousType ? getComponentNameByType(previousType, el, componentCreateContainer) : getSuggestedComponentName(el);
    const previousSuggestedSlots = previousType ? getSuggestedComponentSlotsByType(previousType) : getSuggestedComponentSlots(el);
    const nextEditableParts = getComponentCreateEditableParts(el, type);
    const group = getComponentPurposeOption(type).group;
    const classification = getComponentTypeClassification(type, group, componentCreateContainer).path;
    const nextSuggestedName = getComponentNameByType(type, el, componentCreateContainer);
    const existingMatch = getExistingComponentCreateMatch(classification, nextSuggestedName);
    const nextResolution: ComponentCreateResolution = existingMatch ? 'reuse' : 'new';
    const shouldUpdateName = !componentCreateNameTouched
      || !currentName
      || currentName === previousSuggestedName
      || currentName === getSuggestedComponentName(el);
    const shouldUpdateSlots = !currentSlots || currentSlots === previousSuggestedSlots || currentSlots === getSuggestedComponentSlots(el);

    setComponentCreateType(type);
    setComponentCreatePurpose(getSuggestedComponentPurposeByType(type, el, componentCreateContainer));
    setComponentCreateResolution(nextResolution);
    syncComponentSpecDraft({
      sourceMode: nextResolution === 'reuse' ? '复用已有组件' : '新建组件',
      action: nextResolution === 'reuse' ? '复用组件' : '创建组件',
      classification,
      usage: getSuggestedComponentPurposeByType(type, el, componentCreateContainer),
      editableParts: nextEditableParts,
      ...(shouldUpdateName ? { componentName: nextResolution === 'reuse' && existingMatch?.componentName ? existingMatch.componentName : nextSuggestedName } : {}),
      ...(shouldUpdateSlots ? { slots: getComponentEditablePartsSummary(nextEditableParts) } : {}),
      styleRules: getComponentCreateStyleRules(type, getSuggestedComponentPurposeByType(type, el, componentCreateContainer), group, componentCreateContainer),
    });
    setComponentCreateTypeMenuOpen(false);
  }

  function handleSendComponentCreateToAi() {
    const el = selectedRef.current;
    const draft: ComponentMakerSpecDraft = {
      ...componentSpecDraft,
      sourceMode: componentCreateResolution === 'reuse' ? '复用已有组件' : '新建组件',
      action: componentCreateResolution === 'reuse' ? '复用组件' : '创建组件',
      classification: getComponentTypeClassification(componentCreateType, getComponentPurposeOption(componentCreateType).group, componentCreateContainer).path,
      componentName: componentSpecDraft.componentName.trim() || getComponentNameByType(componentCreateType, el, componentCreateContainer),
      usage: componentCreatePurpose.trim() || getSuggestedComponentPurpose(el),
      editableParts: componentSpecDraft.editableParts?.length
        ? componentSpecDraft.editableParts
        : getComponentCreateEditableParts(el, componentCreateType),
      variants: '暂不创建',
      slots: componentSpecDraft.slots.trim()
        || getComponentEditablePartsSummary(componentSpecDraft.editableParts ?? [])
        || getSuggestedComponentSlots(el),
      styleRules: getComponentCreateStyleRules(componentCreateType, componentCreatePurpose, getComponentPurposeOption(componentCreateType).group, componentCreateContainer),
    };
    const nextEntry = buildComponentSpecDraftEntry(draft);
    const nextDrafts = { ...localDraftsRef.current, [nextEntry.key]: nextEntry };
    setComponentSpecDraft(draft);
    setLocalDrafts(nextDrafts);
    setComponentCreateOpen(false);
    setComponentCreateContainerMenuOpen(false);
    setComponentCreateTypeMenuOpen(false);
    copyDraftEntriesToAi(Object.values(nextDrafts));
  }

  function handleRecordComponentVariantDraft() {
    const el = selected;
    const info = getDraftTargetInfo(el);
    const selectedItems: ComponentMakerVariantItem[] = isRecognizedComponentVariantFlow
      ? activeComponentMakerVariantDraft.items ?? []
      : getSelectedComponentMakerVariantItems(el);
    if (!selectedItems.length) {
      setPluginMsg('至少保留一个变体');
      setTimeout(() => setPluginMsg(''), 1800);
      return;
    }
    const draft = isRecognizedComponentVariantFlow
      ? activeComponentMakerVariantDraft
      : getActiveComponentMakerVariantDraft(el);
    const val = formatComponentMakerVariantDraft(draft);
    const componentName = isRecognizedComponentVariantFlow
      ? componentMakerActiveComponentName
      : componentSpecDraft.componentName.trim() || getElementDisplayName(el);
    setLocalDrafts(prev => {
      const existing = prev[info.key];
      const existingByProp = new Map(existing?.changes.map(change => [change.prop, change]) ?? []);
      const mergedByProp = new Map<string, LocalDraftChange>();
      existing?.changes.forEach(change => mergedByProp.set(change.prop, change));
      const prop = `component-variant-group:${componentName}`;
      const previous = existingByProp.get(prop);
      mergedByProp.set(prop, {
        prop,
        from: previous?.from ?? '未创建',
        val,
      });
      const nextEntry: LocalDraftEntry = {
        ...info,
        changes: Array.from(mergedByProp.values()),
        updatedAt: Date.now(),
      };
      return { ...prev, [info.key]: nextEntry };
    });
    setPluginMsg('变体组已记录 ✓');
    setTimeout(() => setPluginMsg(''), 2200);
  }

  function recordLibraryCrudChange(params: {
    resource: 'token' | 'component';
    action: DesignLibraryCrudAction;
    name: string;
    from: string;
    val: string;
  }) {
    const actionLabel = params.action === 'create' ? '新增' : params.action === 'update' ? '编辑' : '删除';
    const safeName = params.name.trim() || '未命名';
    const prop = `library-${params.resource}:${params.action}:${safeName}`;
    const info: Pick<LocalDraftEntry, 'key' | 'selector' | 'targetLabel' | 'scopeLabel'> = {
      key: 'library:design-library',
      selector: 'Library / 设计库',
      targetLabel: 'Library / 设计库',
      scopeLabel: '设计库',
    };
    setLocalDrafts(prev => {
      const existing = prev[info.key];
      const mergedByProp = new Map<string, LocalDraftChange>();
      existing?.changes.forEach(change => mergedByProp.set(change.prop, change));
      mergedByProp.set(prop, {
        prop,
        from: params.from,
        val: `${actionLabel}：${params.val}`,
      });
      return {
        ...prev,
        [info.key]: {
          ...info,
          changes: Array.from(mergedByProp.values()),
          updatedAt: Date.now(),
        },
      };
    });
  }

  function getLibraryTokenPreviewKind(category: LibraryTokenItemCategory): LibraryTokenItem['preview'] {
    if (category === 'typography') return 'text';
    if (category === 'radius') return 'radius';
    if (category === 'shadow') return 'shadow';
    if (category === 'space') return 'space';
    if (category === 'appearance') return 'appearance';
    return 'color';
  }

  function getLibraryTokenCategoryLabel(category: LibraryTokenItemCategory): string {
    return LIBRARY_TOKEN_CATEGORIES.find(item => item.key === category)?.label ?? category;
  }

  function formatLibraryTokenSummary(item: Pick<LibraryTokenItem, 'categoryLabel' | 'name' | 'value' | 'usage' | 'status'>): string {
    return `${item.categoryLabel} / ${item.name} / ${item.value} / ${item.usage || '未登记用途'} / ${item.status}`;
  }

  function buildLibraryTokenItemFromForm(form: LibraryTokenFormDraft): LibraryTokenItem {
    const categoryLabel = getLibraryTokenCategoryLabel(form.category);
    return {
      id: form.baseId || `draft-token:${Date.now()}:${form.name}`,
      category: form.category,
      categoryLabel,
      name: form.name.trim(),
      value: form.value.trim(),
      rawValue: form.value.trim(),
      usage: form.usage.trim() || '未登记用途',
      status: form.status.trim() || (form.mode === 'create' ? '新增草稿' : '编辑草稿'),
      preview: getLibraryTokenPreviewKind(form.category),
      previewValue: form.value.trim(),
      source: 'draft',
    };
  }

  function openLibraryTokenCreate() {
    const fallbackValue = pendingTextColor || textColorVal || Object.values(pendingColors)[0] || '#111827';
    setLibraryTokenForm({
      mode: 'create',
      category: 'color',
      name: '--color-custom',
      value: fallbackValue,
      usage: '用于当前页面样式',
      status: '新增草稿',
    });
  }

  function openLibraryTokenEdit(item: LibraryTokenItem) {
    setSelectedLibraryTokenId(item.id);
    setLibraryTokenForm({
      mode: 'update',
      baseId: item.id,
      category: item.category,
      name: item.name,
      value: item.rawValue || item.value,
      usage: item.usage,
      status: item.status.includes('草稿') ? item.status : '编辑草稿',
    });
  }

  function submitLibraryTokenForm() {
    if (!libraryTokenForm) return;
    const nextItem = buildLibraryTokenItemFromForm(libraryTokenForm);
    if (!nextItem.name || !nextItem.value) return;
    if (libraryTokenForm.mode === 'create') {
      setLibraryCustomTokens(prev => [nextItem, ...prev]);
      setSelectedLibraryTokenId(nextItem.id);
      recordLibraryCrudChange({
        resource: 'token',
        action: 'create',
        name: nextItem.name,
        from: '未登记',
        val: formatLibraryTokenSummary(nextItem),
      });
    } else {
      setLibraryTokenOverrides(prev => ({ ...prev, [nextItem.id]: { ...nextItem, status: '编辑草稿', source: 'draft' } }));
      setSelectedLibraryTokenId(nextItem.id);
      const original = libraryTokenItems.find(item => item.id === nextItem.id);
      recordLibraryCrudChange({
        resource: 'token',
        action: 'update',
        name: nextItem.name,
        from: original ? formatLibraryTokenSummary(original) : '未登记',
        val: formatLibraryTokenSummary({ ...nextItem, status: '编辑草稿' }),
      });
    }
    setLibraryTokenForm(null);
  }

  function deleteLibraryToken(item: LibraryTokenItem) {
    const usageCount = countLibraryTokenUsage(item);
    const deleteHint = usageCount === null
      ? '删除草稿（使用情况无法统计，需 AI 复核）'
      : usageCount > 0
        ? `删除草稿（${usageCount} 处使用，需先替换）`
        : '删除草稿（未使用）';
    if (item.source === 'draft') {
      setLibraryCustomTokens(prev => prev.filter(token => token.id !== item.id));
    } else {
      setLibraryDeletedTokenIds(prev => ({ ...prev, [item.id]: deleteHint }));
    }
    if (selectedLibraryTokenId === item.id) setSelectedLibraryTokenId('');
    recordLibraryCrudChange({
      resource: 'token',
      action: 'delete',
      name: item.name,
      from: formatLibraryTokenSummary(item),
      val: `${item.name} / ${deleteHint}`,
    });
  }

  function focusLibraryTokenUsage(item: LibraryTokenItem) {
    setSelectedLibraryTokenId(item.id);
    const targets = getLibraryTokenUsageTargets(item);
    if (targets === null) {
      setSubmitMsg('该 token 暂无法统计使用');
      setTimeout(() => setSubmitMsg(''), 1800);
      return;
    }
    const target = targets[0];
    if (!target) {
      setSubmitMsg('当前页面未使用该 token');
      setTimeout(() => setSubmitMsg(''), 1800);
      return;
    }
    setLibraryWorkbenchOpen(false);
    setLibraryOpen(false);
    setComponentCreateOpen(false);
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    selectEl(target);
    setSubmitMsg(`已定位 1 / ${targets.length}`);
    setTimeout(() => setSubmitMsg(''), 1800);
  }

  function formatLibraryComponentSummary(item: Pick<LibraryComponentItem, 'categoryLabel' | 'type' | 'label' | 'summary' | 'selector' | 'status'>): string {
    return `${item.label} / ${item.type} / ${item.categoryLabel} / ${item.summary || '未登记能力'} / ${item.selector || '未登记 selector'} / ${item.status}`;
  }

  function openLibraryComponentCreate() {
    setLibraryComponentForm({
      mode: 'create',
      category: libraryComponentCategory === 'all' ? 'custom' : libraryComponentCategory,
      type: 'Custom',
      label: '自定义组件',
      summary: '待补能力',
      selector: '.custom-component',
      status: '新增草稿',
    });
  }

  function openLibraryComponentEdit(item: LibraryComponentItem) {
    setSelectedLibraryComponentId(item.id);
    setLibraryComponentForm({
      mode: 'update',
      baseId: item.id,
      category: item.category,
      type: item.type,
      label: item.label,
      summary: item.summary,
      selector: item.selector,
      status: item.status.includes('草稿') ? item.status : '编辑草稿',
    });
  }

  function submitLibraryComponentForm() {
    if (!libraryComponentForm) return;
    const category = libraryComponentForm.category || getLibraryComponentCategory(libraryComponentForm.type);
    const nextItem: LibraryComponentItem = {
      id: libraryComponentForm.baseId || `draft-component:${Date.now()}:${libraryComponentForm.type}`,
      category,
      categoryLabel: getLibraryComponentCategoryLabel(category),
      type: libraryComponentForm.type.trim() || 'Custom',
      label: libraryComponentForm.label.trim() || libraryComponentForm.type.trim() || '自定义组件',
      summary: libraryComponentForm.summary.trim() || '待补能力',
      selector: libraryComponentForm.selector.trim() || '未登记 selector',
      status: libraryComponentForm.status.trim() || (libraryComponentForm.mode === 'create' ? '新增草稿' : '编辑草稿'),
      source: 'draft',
    };
    if (libraryComponentForm.mode === 'create') {
      setLibraryCustomComponents(prev => [nextItem, ...prev]);
      setSelectedLibraryComponentId(nextItem.id);
      recordLibraryCrudChange({
        resource: 'component',
        action: 'create',
        name: nextItem.type,
        from: '未登记',
        val: formatLibraryComponentSummary(nextItem),
      });
    } else {
      setLibraryComponentOverrides(prev => ({ ...prev, [nextItem.id]: { ...nextItem, status: '编辑草稿', source: 'draft' } }));
      setSelectedLibraryComponentId(nextItem.id);
      const original = componentLibraryItems.find(item => item.id === nextItem.id);
      recordLibraryCrudChange({
        resource: 'component',
        action: 'update',
        name: nextItem.type,
        from: original ? formatLibraryComponentSummary(original) : '未登记',
        val: formatLibraryComponentSummary({ ...nextItem, status: '编辑草稿' }),
      });
    }
    setLibraryComponentForm(null);
  }

  function deleteLibraryComponent(item: LibraryComponentItem) {
    const deleteHint = item.source === 'draft' ? '删除新增草稿' : '删除规格草稿（不删除源码组件）';
    if (item.source === 'draft') {
      setLibraryCustomComponents(prev => prev.filter(component => component.id !== item.id));
    } else {
      setLibraryDeletedComponentIds(prev => ({ ...prev, [item.id]: deleteHint }));
    }
    if (selectedLibraryComponentId === item.id) setSelectedLibraryComponentId('');
    recordLibraryCrudChange({
      resource: 'component',
      action: 'delete',
      name: item.type,
      from: formatLibraryComponentSummary(item),
      val: `${item.type} / ${deleteHint}`,
    });
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
      .map((change, index) => `${index + 1}. ${getChangeLabel(change.prop)}：${formatStoredChangeRecordValue(change.prop, change.from)} → ${formatStoredChangeRecordValue(change.prop, change.val)}`)
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
    const hasComponentSpec = drafts.some(draft => draft.changes.some(change => (
      change.prop === 'component-spec'
      || change.prop.startsWith('component-new-variant:')
      || change.prop.startsWith('component-variant-group:')
    )));
    const hasLibraryChange = drafts.some(draft => draft.changes.some(change => change.prop.startsWith('library-')));
    const sections = drafts
      .sort((a, b) => a.updatedAt - b.updatedAt)
      .map((draft, index) => {
      const changes = draft.changes
          .map((change, changeIndex) => `${changeIndex + 1}. ${getChangeLabel(change.prop)}：${formatStoredChangeRecordValue(change.prop, change.from)} → ${formatStoredChangeRecordValue(change.prop, change.val)}`)
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
    const title = hasLibraryChange
      ? 'DevInspector 设计库 / 组件 / 样式任务'
      : hasComponentSpec ? 'DevInspector 组件 / 样式任务' : 'DevInspector 样式任务';
    const locationHint = hasLibraryChange
      ? '这些内容来自 DevInspector 设计库工作台；Token / Component 的增删改都是用户确认的受控草稿，请先定位设计 token 配置、组件能力表或源码中的正式定义，再判断如何落地；删除操作需先处理使用关系，不要手改 dist。'
      : hasComponentSpec
      ? '这些内容来自 DevInspector 本次修改内容；组件规格和新变体是用户确认的草稿，请按组件名、可编辑内容、变体维度、状态、尺寸和样式规则定位源码落地；不要手改 dist。'
      : '这些内容来自 DevInspector 本次修改内容，请按对象逐一定位源码，判断是否应固化为组件样式、token 或局部覆盖；不要手改 dist。';
    return [
      title,
      `页面：${document.title || '当前页面'}（${window.location.href}）`,
      `待处理对象：${drafts.length}`,
      sections,
      ...(note ? ['补充：', note] : []),
      '定位提示：',
      locationHint,
    ].join('\n');
  }

  function handleSubmitToAi() {
    const draftEntries = Object.values(localDraftsRef.current);
    if (draftEntries.length > 0) {
      copyDraftEntriesToAi(draftEntries);
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
      && !pendingBadgeStatus
      && !pendingCardVariant
      && pending.length === 0;
    const scopeLabel = hasOnlyInstanceContentPending
      ? '当前元素'
      : scope === 'current' ? '当前元素' : '相同元素';
    const stableSelector = componentMeta && hasComponentAttrPending && componentSelectorVal
      ? componentSelectorVal
      : selector;

    const prompt = buildAiTaskPrompt({
      pageLabel: `${document.title || '当前页面'}（${window.location.href}）`,
      targetLabel: getTargetDisplayLabel(el, componentMeta),
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

  function copyDraftEntriesToAi(draftEntries: LocalDraftEntry[]) {
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
    if (prop === 'justify-content') return getAlignmentLabel('justify-content', justifyVal);
    if (prop === 'align-items') return getAlignmentLabel('align-items', alignItemsVal);
    return '';
  }

  function formatChangeRecordValue(prop: string, value: string): string {
    if (prop === 'padding' || prop === 'margin') {
      return getSpaceRecordSummary(prop, value) || '无';
    }
    if (prop === 'gap') {
      return getSpaceRecordSummary('gap', value) || '无';
    }
    if (prop === 'width' || prop === 'height' || prop === 'min-height' || prop === 'max-height') {
      return formatSizeDisplay(value);
    }
    if (prop === 'justify-content') return getAlignmentLabel('justify-content', value);
    if (prop === 'align-items') return getAlignmentLabel('align-items', value);
    return value;
  }

  function formatStoredChangeRecordValue(prop: string, value: string): string {
    if (prop === 'padding' || prop === 'margin' || prop === 'gap') {
      return formatStoredSpaceRecordValue(value);
    }
    return value;
  }

  function normalizeChangeRecordValue(prop: string, value: string): string {
    const formatted = formatChangeRecordValue(prop, value).trim();
    if (!formatted || formatted === '无' || formatted === 'none') return 'empty';
    if (isZeroLengthValue(formatted)) return '0';
    return formatted.replace(/\s+/g, ' ');
  }

  function getPendingChangeRecords() {
    const records: { prop: string; from: string; val: string }[] = [];
    const add = (prop: string, from: string, val: string) => {
      if (normalizeChangeRecordValue(prop, from) === normalizeChangeRecordValue(prop, val)) return;
      records.push({
        prop,
        from: formatChangeRecordValue(prop, from),
        val: formatChangeRecordValue(prop, val),
      });
    };
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
    if (pendingTranslate)   add('translate', formatPositionRecord(getDisplayPosition(translateVal)), formatPositionRecord(getDisplayPosition(pendingTranslate)));
    if (pendingWidth)       add('width', widthVal, pendingWidth);
    if (pendingHeight)      add('height', heightVal, pendingHeight);
    if (pendingJustifyContent) add('justify-content', justifyVal, pendingJustifyContent);
    if (pendingAlignItems)     add('align-items', alignItemsVal, pendingAlignItems);
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
    if (pendingBadgeStatus) {
      add('component-status', badgeStatusVal, pendingBadgeStatus);
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
    const info = getDraftTargetInfo(el);
    const hasCurrentPendingState = Object.keys(pendingColors).length > 0
      || !!pendingTextColor
      || !!pendingRadius
      || !!pendingShadow
      || !!pendingBorderColor
      || !!pendingBorderWidth
      || !!pendingBorderStyle
      || !!pendingFontSize
      || !!pendingFontWeight
      || !!pendingPadding
      || !!pendingMargin
      || !!pendingGap
      || !!pendingTranslate
      || !!pendingWidth
      || !!pendingHeight
      || !!pendingJustifyContent
      || !!pendingAlignItems
      || pendingComponentText !== null
      || Object.keys(pendingComponentTextSlots).length > 0
      || !!pendingComponentVariant
      || !!pendingComponentSize
      || !!pendingIconColor
      || !!pendingBadgeStatus
      || !!pendingCardVariant
      || !!pendingNewToken;
    if (changes.length === 0) {
      if (hasCurrentPendingState) removeLocalDraftEntry(info.key);
      return;
    }
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
    if (prop.startsWith('library-token:') || prop.startsWith('library-component:')) {
      const [resource = '', action = '', name = '未命名'] = prop.split(':');
      const resourceLabel = resource === 'library-token' ? 'Token' : '组件规格';
      const actionLabel = action === 'create' ? '新增' : action === 'update' ? '编辑' : action === 'delete' ? '删除' : '变更';
      return `${resourceLabel} · ${actionLabel} · ${name}`;
    }
    if (prop.startsWith('component-variant-group:')) {
      const [, name = '未命名组件'] = prop.split(':');
      return `创建变体组 · ${name}`;
    }
    if (prop.startsWith('component-new-variant:')) {
      const [, dimension = '自定义', name = '未命名'] = prop.split(':');
      return `创建变体 · ${dimension} · ${name}`;
    }
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
      'justify-content': '水平对齐',
      'align-items': '垂直对齐',
      'component-text': '组件文案',
      'component-variant': componentCapability?.variantKind === 'card' ? '组件展示' : '组件变体',
      'component-size': '组件尺寸',
      'component-color': '组件颜色',
      'component-status': '标签状态',
      'component-spec': '组件规格',
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
    else if (prop === 'justify-content') setPendingJustifyContent('');
    else if (prop === 'align-items') setPendingAlignItems('');
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
    } else if (prop === 'component-status') {
      setPendingBadgeStatus('');
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
    if (change.prop.startsWith('library-')) return;
    if (change.prop === 'component-spec' || change.prop.startsWith('component-new-variant:')) return;

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
        } else if (change.prop === 'component-status') {
          setBadgeStatusOnTargets(currentTargets, badgeStatusVal, badgeStatusClassVal);
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

  function isPropPending(prop: string): boolean {
    if (prop === 'font-size') return !!pendingFontSize;
    if (prop === 'font-weight') return !!pendingFontWeight;
    if (prop === 'color') return !!pendingTextColor;
    if (prop === 'box-shadow') return !!pendingShadow;
    if (prop === 'padding') return !!pendingPadding;
    if (prop === 'margin') return !!pendingMargin;
    if (prop === 'gap') return !!pendingGap;
    if (prop === 'translate') return !!pendingTranslate;
    if (prop === 'width') return !!pendingWidth;
    if (prop === 'height' || prop === 'min-height' || prop === 'max-height') return !!pendingHeight;
    if (prop === 'justify-content') return !!pendingJustifyContent;
    if (prop === 'align-items') return !!pendingAlignItems;
    return false;
  }

  function refreshSectionComputedValues(section: InspectorSectionKey) {
    const el = selectedRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    if (section === 'text') {
      setFontSizeVal(cs.fontSize.trim());
      setFontWeightVal(cs.fontWeight.trim());
      setTextColorVal(normalizeColor(cs.color.trim()));
      setFontSizeCustomDraft(cs.fontSize.trim());
      return;
    }
    if (section === 'layout') {
      const nextTranslate = parseTranslate(cs.translate);
      setTranslateVal(nextTranslate);
      setPositionBaseVal(getPositionBase(el, nextTranslate));
      setWidthVal(cs.width.trim());
      setHeightVal(cs.height.trim());
      setWidthMode(inferSizeMode(el, 'width', cs.width.trim()));
      setHeightMode(inferSizeMode(el, 'height', cs.height.trim()));
      setJustifyVal(cs.justifyContent.trim() || 'normal');
      setAlignItemsVal(cs.alignItems.trim() || 'normal');
      return;
    }
    if (section === 'shadow') {
      const shadowComputed = cs.boxShadow.trim() || 'none';
      setShadowVal(shadowComputed === 'rgba(0, 0, 0, 0) 0px 0px 0px 0px' ? 'none' : shadowComputed);
      setShadowAuthoredVal(getAuthoredStyleValue(el, 'box-shadow'));
      return;
    }
    const normSpace = (v: string) => {
      const parts = v.trim().split(' ');
      return parts.every(p => p === parts[0]) ? parts[0] : v.trim();
    };
    setPaddingVal(normSpace(`${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`));
    setMarginVal(normSpace(`${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`));
    const g = cs.gap.trim();
    setGapVal(g === 'normal' ? '0px' : g);
  }

  function handleResetSection(section: InspectorSectionKey) {
    const el = selectedRef.current;
    if (!el) return;
    const props = SECTION_RESET_PROPS[section];
    const currentKey = getDraftTargetInfo(el).key;
    const draft = localDraftsRef.current[currentKey];
    const draftChanges = draft?.changes.filter(change => props.includes(change.prop)) ?? [];
    draftChanges.forEach(change => resetDraftChangeOnPage(draft!, change));
    if (draftChanges.length > 0) {
      setLocalDrafts(prev => {
        const current = prev[currentKey];
        if (!current) return prev;
        const remaining = current.changes.filter(change => !props.includes(change.prop));
        const next = { ...prev };
        if (remaining.length === 0) {
          delete next[currentKey];
        } else {
          next[currentKey] = { ...current, changes: remaining, updatedAt: Date.now() };
        }
        return next;
      });
    }

    const targets = getScopeTargets(el, scope);
    props.forEach(prop => {
      if (isPropPending(prop)) {
        targets.forEach(target => {
          const hEl = target as HTMLElement;
          hEl.style.removeProperty(prop);
          if (prop === 'height') {
            hEl.style.removeProperty('min-height');
            hEl.style.removeProperty('max-height');
          }
        });
        if (prop === 'gap' && gapTargetRef.current) {
          gapTargetRef.current.style.removeProperty('gap');
        }
      }
      clearPendingForProp(prop);
    });

    if (section === 'text') {
      setTypographyCustomMode(false);
      setShowTypographyStyleDrop(false);
      setShowFontSizeDrop(false);
      setShowWeightDrop(false);
      setExpandedTextColor(false);
    } else if (section === 'layout') {
      setSizeDraft({});
    } else if (section === 'shadow') {
      setShadowCustomMode(false);
      setShowShadowDrop(false);
      setShowShadowColorDrop(false);
    } else {
      setSpaceCustomModes({ padding: false, margin: false, gap: false });
    }
    refreshSectionComputedValues(section);
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
    if (pendingBadgeStatus) {
      setBadgeStatusOnTargets(targets, badgeStatusVal, badgeStatusClassVal);
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
      if (pendingJustifyContent) hEl.style.removeProperty('justify-content');
      if (pendingAlignItems) hEl.style.removeProperty('align-items');
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
    setPendingJustifyContent('');
    setPendingAlignItems('');
    setSizeDraft({});
    setComponentTextDraft(componentTextVal);
    setComponentTextSlotDrafts(componentTextSlotVals);
    setPendingComponentText(null);
    setPendingComponentTextSlots({});
    setPendingComponentVariant('');
    setPendingComponentSize('');
    setPendingIconColor('');
    setPendingBadgeStatus('');
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
    const nextTranslate = parseTranslate(cs.translate);
    setTranslateVal(nextTranslate);
    setPositionBaseVal(getPositionBase(el, nextTranslate));
    setWidthVal(cs.width.trim());
    setHeightVal(cs.height.trim());
    setWidthMode(inferSizeMode(el, 'width', cs.width.trim()));
    setHeightMode(inferSizeMode(el, 'height', cs.height.trim()));
    setJustifyVal(cs.justifyContent.trim() || 'normal');
    setAlignItemsVal(cs.alignItems.trim() || 'normal');
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
    || !!pendingBadgeStatus
    || !!pendingCardVariant;
  const componentSelector = componentMeta && hasComponentAttrPending && componentSelectorVal
    ? componentSelectorVal
    : getSelectorForScope(selected, 'component');
  const componentDisplayName = componentMeta ? getComponentDisplayName(componentMeta) : '';
  const showComponentVariantMeta = !!componentMeta
    && (!!componentCapability?.variantKind || componentMeta.variant !== 'default');
  const isTextOnlyTarget = isTextOnlyTargetElement(selected);
  const isPageShellTarget = isPageShellTargetElement(selected);
  const isStructuralContainerTarget = !isPageShellTarget && isStructuralContainerTargetElement(selected);
  const isSimpleTextGroupTarget = isSimpleTextGroupTargetElement(selected);
  const hideTextStyleSection = isPageShellTarget || isStructuralContainerTarget || isSimpleTextGroupTarget;
  const canAlignChildren = isFlexGridDisplay(getComputedStyle(selected).display);
  const activeButtonVariant = pendingComponentVariant || componentVariantVal;
  const activeButtonSize = pendingComponentSize || componentSizeVal;
  const activeIconColor = pendingIconColor || iconColorVal;
  const activeBadgeStatus = pendingBadgeStatus || badgeStatusVal;
  const activeCardVariant = pendingCardVariant || cardVariantVal;
  const componentSizeOptions = getComponentSizeControlOptions(componentCapability);
  const showElementStyleSections = !componentMeta;
  const localDraftEntries = Object.values(localDrafts).sort((a, b) => b.updatedAt - a.updatedAt);
  const localDraftChangeCount = localDraftEntries.reduce((sum, entry) => sum + entry.changes.length, 0);
  const currentPendingChangeCount = getPendingChangeRecords().length;
  const currentDraftEntry = localDrafts[getDraftTargetInfo(selected).key];
  const hasSectionChanges = (section: InspectorSectionKey) => {
    const props = SECTION_RESET_PROPS[section];
    return props.some(isPropPending)
      || !!currentDraftEntry?.changes.some(change => props.includes(change.prop));
  };
  const renderSectionReset = (section: InspectorSectionKey, label: string) => (
    hasSectionChanges(section) ? (
      <button
        type="button"
        className="di-section-icon-action di-section-icon-action--reset"
        onClick={() => handleResetSection(section)}
        title={`重置${label}`}
        aria-label={`重置${label}`}
      >
        <RotateCcw size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>
    ) : null
  );
  const pluginTargetContext = getPluginTargetContext(selected);
  const componentMakerComponentOptions = getComponentMakerComponentOptions(selected);
  const selectedComponentOption = componentMakerComponentOptions.find(option => option.name === componentSpecDraft.componentName);
  const componentCreateSuggestedTypeGroup = selected ? getComponentPurposeOption(componentCreateType || getSuggestedComponentCreatePurposeType(selected)).group : 'structure';
  const componentCreateContainerOption = getComponentContainerOption(componentCreateContainer);
  const componentCreateTypeQuery = normalizeComponentType(componentCreateType);
  const componentCreateClassification = getComponentTypeClassification(
    componentCreateType || (selected ? getSuggestedComponentCreatePurposeType(selected) : ''),
    componentCreateSuggestedTypeGroup,
    componentCreateContainer,
  );
  const componentCreatePurposeOptions = getPurposeOptionsForContainer(componentCreateContainer);
  const componentCreateHasExactType = componentCreatePurposeOptions
    .some(option => normalizeComponentType(option.label) === componentCreateTypeQuery);
  const componentCreateTypeOptions = componentCreatePurposeOptions
    .filter(option => {
      if (!componentCreateTypeQuery || componentCreateHasExactType) return true;
      return normalizeComponentType(option.label).includes(componentCreateTypeQuery)
        || normalizeComponentType(option.hint).includes(componentCreateTypeQuery);
    })
    .slice(0, 10);
  const componentMakerActiveComponentName = selectedComponentOption?.name || componentSpecDraft.componentName || pluginTargetContext.label;
  const componentMakerActiveComponentType = selectedComponentOption?.type || pluginTargetContext.meta?.type || '组件';
  const isComponentMakerVariantAction = componentMakerAction === 'create-current-variant' || componentMakerAction === 'create-other-variant';
  const isRecognizedComponentVariantFlow = Boolean(pluginTargetContext.meta) && isComponentMakerVariantAction;
  const componentMakerVariantSuggestions = getComponentMakerVariantSuggestions(selected);
  const multiSelectedComponentMakerVariantSuggestions = componentMakerVariantSuggestions.filter(item => !componentVariantExcludedIds.includes(item.id));
  const activeComponentMakerVariantPreview = componentMakerVariantSuggestions.find(item => item.id === componentVariantPreviewId)
    ?? multiSelectedComponentMakerVariantSuggestions[0]
    ?? componentMakerVariantSuggestions[0]
    ?? null;
  const selectedComponentMakerVariantSuggestions = isRecognizedComponentVariantFlow
    ? (activeComponentMakerVariantPreview ? [activeComponentMakerVariantPreview] : [])
    : multiSelectedComponentMakerVariantSuggestions;
  const generatedComponentMakerVariantName = getGeneratedComponentMakerVariantName(componentMakerActiveComponentName, activeComponentMakerVariantPreview);
  const componentMakerVariantCodeName = componentVariantDraft.name.trim() || generatedComponentMakerVariantName;
  const componentMakerVariantGroups = componentMakerVariantSuggestions.reduce<Array<[string, ComponentMakerVariantSuggestion[]]>>((groups, item) => {
    const existing = groups.find(([dimension]) => dimension === item.dimension);
    if (existing) {
      existing[1].push(item);
    } else {
      groups.push([item.dimension, [item]]);
    }
    return groups;
  }, []);
  const activeComponentMakerVariantDraft = isComponentMakerVariantAction
    ? {
      ...getActiveComponentMakerVariantDraft(selected),
      items: selectedComponentMakerVariantSuggestions,
      name: componentMakerVariantCodeName,
      dimension: activeComponentMakerVariantPreview?.dimension ?? componentVariantDraft.dimension,
    }
    : componentVariantDraft;
  const componentMakerContext: ComponentMakerContext = {
    pageTitle: document.title || '当前页面',
    pageUrl: window.location.href,
    targetLabel: pluginTargetContext.label,
    selector: pluginTargetContext.selector,
    scopeLabel: scope === 'current' ? '当前元素' : '相同元素',
    recognitionLines: getComponentMakerSummary(selected),
    isRecognizedComponent: Boolean(pluginTargetContext.meta),
    specDraft: componentSpecDraft,
    variantDraft: activeComponentMakerVariantDraft,
  };
  const componentMakerActions = getComponentMakerActions(componentMakerSourceMode);
  const componentMakerVariantActionOptions = COMPONENT_MAKER_ACTION_OPTIONS.filter(option =>
    option.key === 'create-current-variant' || option.key === 'create-other-variant'
  );
  const componentMakerLivePreviewHtml = getComponentMakerLivePreviewHtml(selected, activeComponentMakerVariantPreview);
  const canCreateComponent = Boolean(selected) && !componentMeta;
  const componentCreateTargetLabel = selected ? getElementDisplayName(selected, componentMeta) : '当前元素';
  const componentCreateSelector = selected ? getSelectorForScope(selected, 'current') : '';
  const componentCreateDefaultText = selected ? (getTextContent(selected) ?? '').trim() : '';
  const componentCreateRulePreview = getComponentCreateStyleRules(componentCreateType, componentCreatePurpose, componentCreateSuggestedTypeGroup, componentCreateContainer)
    .split('；')
    .filter(Boolean);
  const componentCreateEditableParts = componentSpecDraft.editableParts ?? [];
  const componentCreateExistingMatch = getExistingComponentCreateMatch(
    componentCreateClassification.path,
    componentSpecDraft.componentName || (selected
      ? getComponentNameByType(
        componentCreateType || getSuggestedComponentCreatePurposeType(selected, componentCreateContainer),
        selected,
        componentCreateContainer,
      )
      : ''),
  );
  const panelTitle = '页面样式';
  const activePaddingValue = pendingPadding || paddingVal;
  const activeMarginValue = pendingMargin || marginVal;
  const activeGapValue = pendingGap || gapVal;
  const showElementGapControl = canControlElementGap(selected);
  const shouldUseCustomSpaceControls = (variant: SpaceVariant, value: string) => (
    spaceCustomModes[variant] || isEmptySpaceValue(variant, value)
  );
  const baseLibraryTokenItems = getLibraryTokenItems(tokens, tokenMap);
  const libraryTokenItems = [
    ...baseLibraryTokenItems
      .filter(item => !libraryDeletedTokenIds[item.id])
      .map(item => libraryTokenOverrides[item.id] ? { ...item, ...libraryTokenOverrides[item.id] } : item),
    ...libraryCustomTokens,
  ];
  const normalizedLibrarySearch = librarySearch.trim().toLowerCase();
  const filteredLibraryTokenItems = libraryTokenItems.filter(item => {
    const matchesCategory = libraryTokenCategory === 'all' || item.category === libraryTokenCategory;
    if (!matchesCategory) return false;
    const usageCount = countLibraryTokenUsage(item);
    if (libraryTokenUsageFilter === 'used' && !(usageCount !== null && usageCount > 0)) return false;
    if (libraryTokenUsageFilter === 'unused' && usageCount !== 0) return false;
    if (libraryTokenUsageFilter === 'unknown' && usageCount !== null) return false;
    if (!normalizedLibrarySearch) return true;
    return [
      item.name,
      item.value,
      item.usage,
      item.status,
      item.categoryLabel,
    ].some(value => value.toLowerCase().includes(normalizedLibrarySearch));
  });
  const visibleLibraryTokenItems = filteredLibraryTokenItems.slice(0, 80);
  const libraryTokenCategoryCounts = LIBRARY_TOKEN_CATEGORIES.reduce<Record<LibraryTokenCategory, number>>((acc, category) => {
    acc[category.key] = category.key === 'all'
      ? libraryTokenItems.length
      : libraryTokenItems.filter(item => item.category === category.key).length;
    return acc;
  }, {} as Record<LibraryTokenCategory, number>);
  const selectedLibraryToken = libraryTokenItems.find(item => item.id === selectedLibraryTokenId) ?? visibleLibraryTokenItems[0] ?? null;
  const componentPreviewByType = new Map(
    componentPreviews.map(preview => [preview.type.trim().toLowerCase(), preview]),
  );
  const systemComponentTypes = new Set(Object.keys(COMPONENT_CAPABILITIES).map(type => type.toLowerCase()));
  const buildLibraryComponentItemFromPreview = (preview: DevInspectorComponentPreview): LibraryComponentItem => {
    const type = preview.type.trim() || 'Custom';
    const category = preview.category ?? getLibraryComponentCategory(type);
    return {
      id: `component-preview:${type}`,
      category,
      categoryLabel: getLibraryComponentCategoryLabel(category),
      type,
      label: preview.label || LIBRARY_COMPONENT_LABELS[type] || type,
      summary: preview.summary || '真实组件预览',
      selector: preview.selector || `真实组件 ${type}`,
      status: preview.status || '真实组件',
      preview,
      source: 'system',
    };
  };
  const componentLibraryItems: LibraryComponentItem[] = [
    ...Object.entries(COMPONENT_CAPABILITIES)
      .map(([type, capability]) => {
        const id = `component:${type}`;
        const registeredPreview = componentPreviewByType.get(type.toLowerCase());
        const category = registeredPreview?.category ?? getLibraryComponentCategory(type);
        const item: LibraryComponentItem = {
          id,
          category,
          categoryLabel: getLibraryComponentCategoryLabel(category),
          type,
          label: registeredPreview?.label || LIBRARY_COMPONENT_LABELS[type] || type,
          summary: registeredPreview?.summary || getComponentCapabilitySummary(type, capability),
          selector: registeredPreview?.selector || (type === 'Icon' ? 'svg.lucide' : `.${type.toLowerCase()}, [data-component="${type}"]`),
          status: registeredPreview?.status || '已接入',
          preview: registeredPreview,
          source: 'system',
        };
        return libraryComponentOverrides[id] ? { ...item, ...libraryComponentOverrides[id] } : item;
      })
      .filter(item => !libraryDeletedComponentIds[item.id]),
    ...componentPreviews
      .filter(preview => !systemComponentTypes.has(preview.type.trim().toLowerCase()))
      .map(preview => {
        const item = buildLibraryComponentItemFromPreview(preview);
        return libraryComponentOverrides[item.id] ? { ...item, ...libraryComponentOverrides[item.id] } : item;
      })
      .filter(item => !libraryDeletedComponentIds[item.id]),
    ...libraryCustomComponents,
  ];
  const filteredLibraryComponentItems = componentLibraryItems.filter(item => {
    const matchesCategory = libraryComponentCategory === 'all' || item.category === libraryComponentCategory;
    if (!matchesCategory) return false;
    if (!normalizedLibrarySearch) return true;
    return [item.type, item.label, item.categoryLabel, item.summary, item.selector, item.status]
      .some(value => value.toLowerCase().includes(normalizedLibrarySearch));
  });
  const filteredLibraryComponentSpecCount = filteredLibraryComponentItems.reduce((count, item) =>
    count + (item.preview?.variants.length || 1),
  0);
  const libraryComponentCategoryCounts = LIBRARY_COMPONENT_CATEGORIES.reduce<Record<LibraryComponentCategory, number>>((acc, category) => {
    acc[category.key] = category.key === 'all'
      ? componentLibraryItems.length
      : componentLibraryItems.filter(item => item.category === category.key).length;
    return acc;
  }, {} as Record<LibraryComponentCategory, number>);
  const selectedLibraryComponent = componentLibraryItems.find(item => item.id === selectedLibraryComponentId)
    ?? filteredLibraryComponentItems[0]
    ?? null;
  const selectedLibraryComponentVariant = selectedLibraryComponent?.preview?.variants.find(variant =>
    getLibraryComponentVariantKey(selectedLibraryComponent.id, variant.id) === selectedLibraryComponentVariantId,
  ) ?? selectedLibraryComponent?.preview?.variants[0] ?? null;
  const selectedLibraryComponentSpecKey = selectedLibraryComponent && selectedLibraryComponentVariant
    ? getLibraryComponentVariantKey(selectedLibraryComponent.id, selectedLibraryComponentVariant.id)
    : '';
  const getLibraryComponentSpecSelector = (component: LibraryComponentItem, variant: DevInspectorComponentPreviewVariant) =>
    variant.selector?.trim() || component.selector.trim();
  const countLibraryComponentSelectorUsage = (selector: string): number | null => {
    const normalizedSelector = selector.trim();
    if (!normalizedSelector || normalizedSelector.startsWith('真实组件') || normalizedSelector === '未登记 selector') return null;
    try {
      return Array.from(document.querySelectorAll(normalizedSelector))
        .filter(element => !element.closest('.di-panel'))
        .length;
    } catch {
      return null;
    }
  };
  const selectedLibraryComponentSpec: LibraryComponentSpecDetail | null = selectedLibraryComponent && selectedLibraryComponentVariant
    ? {
        component: selectedLibraryComponent,
        variant: selectedLibraryComponentVariant,
        key: selectedLibraryComponentSpecKey,
        selector: getLibraryComponentSpecSelector(selectedLibraryComponent, selectedLibraryComponentVariant),
        purpose: getLibraryComponentVariantPurpose(selectedLibraryComponent, selectedLibraryComponentVariant),
        capabilities: getLibraryComponentVariantCapabilities(selectedLibraryComponent, selectedLibraryComponentVariant),
        tokenRefs: getLibraryComponentVariantTokenRefs(selectedLibraryComponent, selectedLibraryComponentVariant),
        usageCount: countLibraryComponentSelectorUsage(getLibraryComponentSpecSelector(selectedLibraryComponent, selectedLibraryComponentVariant)),
      }
    : null;
  const libraryDraftChangeRows = localDraftEntries.flatMap((entry) => (
    entry.changes.map((change, index) => ({ entry, change, index }))
  ));
  const libraryUsageItems = libraryTokenItems
    .map(item => ({ item, usageCount: countLibraryTokenUsage(item) }))
    .filter(({ usageCount }) => usageCount !== null)
    .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
    .slice(0, 60);
  const libraryNavItems: Array<{ key: DesignLibraryTab; label: string; count: number; hint: string }> = [
    { key: 'tokens', label: 'Tokens', count: libraryTokenItems.length, hint: '设计 token' },
    { key: 'components', label: 'Components', count: componentLibraryItems.length, hint: '组件规格' },
    { key: 'changes', label: 'Changes', count: localDraftChangeCount, hint: '修改篮' },
    { key: 'usage', label: 'Usage', count: libraryUsageItems.length, hint: '使用治理' },
  ];

  function groupRegisteredPreviewVariants(variants: DevInspectorComponentPreviewVariant[]) {
    const groups = new Map<string, DevInspectorComponentPreviewVariant[]>();
    variants.forEach(variant => {
      const key = variant.group || '默认';
      groups.set(key, [...(groups.get(key) ?? []), variant]);
    });
    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
  }

  function selectLibraryComponentSpec(component: LibraryComponentItem, variant: DevInspectorComponentPreviewVariant) {
    setSelectedLibraryComponentId(component.id);
    setSelectedLibraryComponentVariantId(getLibraryComponentVariantKey(component.id, variant.id));
    setLibraryComponentForm(null);
  }

  function renderRegisteredComponentPreview(component: LibraryComponentItem, preview: DevInspectorComponentPreview, mode: 'card' | 'detail') {
    const groups = groupRegisteredPreviewVariants(preview.variants);
    return (
      <div
        className={`di-library-real-preview${mode === 'detail' ? ' di-library-real-preview--detail' : ''}`}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => event.stopPropagation()}
      >
        {groups.map(group => (
          <div className="di-library-real-preview-group" key={group.label}>
            <div className="di-library-real-preview-group-title">{group.label}</div>
            <div className="di-library-real-preview-grid">
              {group.items.map(variant => {
                const specKey = getLibraryComponentVariantKey(component.id, variant.id);
                const isSelected = selectedLibraryComponentSpecKey === specKey;
                return (
                <div
                  className={`di-library-real-preview-item${isSelected ? ' di-library-real-preview-item--selected' : ''}`}
                  key={variant.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onMouseDownCapture={() => selectLibraryComponentSpec(component, variant)}
                  onKeyDown={event => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    selectLibraryComponentSpec(component, variant);
                  }}
                >
                  <div className="di-library-real-preview-slot">
                    {variant.render()}
                  </div>
                  <div className="di-library-real-preview-meta">
                    <span>{variant.label}</span>
                    {variant.propsLabel ? <small>{variant.propsLabel}</small> : null}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderLibraryComponentPreview(item: LibraryComponentItem, mode: 'card' | 'detail' = 'card') {
    if (item.preview?.variants.length) {
      return renderRegisteredComponentPreview(item, item.preview, mode);
    }

    const normalizedType = item.type.trim().toLowerCase();
    const matrixModeClass = mode === 'detail' ? ' di-library-preview-matrix--detail' : '';
    if (normalizedType.includes('button') || item.category === 'action') {
      const gridStyle = {
        '--di-library-matrix-columns': `34px repeat(${BUTTON_VARIANT_OPTIONS.length}, minmax(76px, max-content))`,
      } as CSSProperties;
      return (
        <div className={`di-library-preview-matrix di-library-preview-matrix--button${matrixModeClass}`} aria-hidden="true" style={gridStyle}>
          <div className="di-library-preview-matrix-head">
            <span>尺寸</span>
            {BUTTON_VARIANT_OPTIONS.map(variant => <span key={variant.key}>{variant.label}</span>)}
          </div>
          {BUTTON_SIZE_OPTIONS.map(size => (
            <div className="di-library-preview-matrix-row" key={size.key}>
              <span className="di-library-preview-matrix-label">{size.label}</span>
              {BUTTON_VARIANT_OPTIONS.map(variant => (
                <span
                  key={`${size.key}-${variant.key}`}
                  className={`di-library-preview-button di-library-preview-button--${variant.key}`}
                  style={{ minHeight: size.minHeight, padding: size.padding, fontSize: size.fontSize }}
                >
                  {variant.label}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    }
    if (normalizedType.includes('badge') || normalizedType.includes('tag') || item.category === 'feedback') {
      const gridStyle = {
        '--di-library-matrix-columns': `34px repeat(${BADGE_STATUS_OPTIONS.length}, minmax(58px, max-content))`,
      } as CSSProperties;
      return (
        <div className={`di-library-preview-matrix di-library-preview-matrix--badge${matrixModeClass}`} aria-hidden="true" style={gridStyle}>
          <div className="di-library-preview-matrix-head">
            <span>尺寸</span>
            {BADGE_STATUS_OPTIONS.map(status => <span key={status.key}>{status.label}</span>)}
          </div>
          {BADGE_SIZE_OPTIONS.map(size => (
            <div className="di-library-preview-matrix-row" key={size.key}>
              <span className="di-library-preview-matrix-label">{size.label}</span>
              {BADGE_STATUS_OPTIONS.map(status => (
                <span
                  key={`${size.key}-${status.key}`}
                  className={`di-library-preview-badge di-library-preview-badge--${status.key}`}
                  style={{ minHeight: size.minHeight, padding: size.padding, fontSize: size.fontSize }}
                >
                  {status.label}
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    }
    if (normalizedType.includes('card') || item.category === 'display') {
      return (
        <div className={`di-library-preview-card-gallery${mode === 'detail' ? ' di-library-preview-card-gallery--detail' : ''}`} aria-hidden="true">
          {CARD_VARIANT_OPTIONS.map(variant => (
            <div className={`di-library-preview-card-sample di-library-preview-card-sample--${variant.key}`} key={variant.key}>
              <span>{variant.label}</span>
              <strong>任务标题</strong>
              <p>{variant.key === 'compact' ? '紧凑信息层级。' : '这是一段示例描述文字，用于展示卡片内容层级。'}</p>
            </div>
          ))}
        </div>
      );
    }
    if (normalizedType.includes('form') || normalizedType.includes('input') || item.category === 'form') {
      return (
        <div className="di-library-preview-form-sample" aria-hidden="true">
          <span>门店名称</span>
          <div>例如：西湖旗舰店</div>
          <strong>提交</strong>
        </div>
      );
    }
    if (normalizedType.includes('icon') || item.category === 'icon') {
      const gridStyle = {
        '--di-library-matrix-columns': `34px repeat(${ICON_COLOR_OPTIONS.length}, minmax(44px, 1fr))`,
      } as CSSProperties;
      return (
        <div className={`di-library-preview-matrix di-library-preview-matrix--icon${matrixModeClass}`} aria-hidden="true" style={gridStyle}>
          <div className="di-library-preview-matrix-head">
            <span>尺寸</span>
            {ICON_COLOR_OPTIONS.map(color => <span key={color.key}>{color.label}</span>)}
          </div>
          {ICON_SIZE_OPTIONS.map(size => (
            <div className="di-library-preview-matrix-row" key={size.key}>
              <span className="di-library-preview-matrix-label">{size.label}</span>
              {ICON_COLOR_OPTIONS.map(color => (
                <span className="di-library-preview-icon-cell" key={`${size.key}-${color.key}`}>
                  <ComponentIcon size={Number.parseFloat(size.size)} strokeWidth={2.2} style={{ color: color.value }} />
                </span>
              ))}
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className="di-library-preview-generic" aria-hidden="true">
        <ComponentIcon size={22} strokeWidth={2.2} />
        <strong>{item.label}</strong>
        <span>{item.selector}</span>
      </div>
    );
  }

  function renderLibraryComponentSpecPreview(spec: LibraryComponentSpecDetail) {
    return (
      <div className="di-library-spec-preview">
        <div className="di-library-spec-preview-slot">
          {spec.variant.render()}
        </div>
        <div className="di-library-spec-preview-meta">
          <span>{spec.variant.label}</span>
          {spec.variant.propsLabel ? <small>{spec.variant.propsLabel}</small> : null}
        </div>
      </div>
    );
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
          className={`di-panel${componentCreateOpen || libraryOpen ? ' di-panel--drawer-open' : ''}${libraryWorkbenchOpen ? ' di-panel--workbench-open' : ''}`}
          data-di-panel-role="primary"
          style={{ top: panelPos.top, left: panelPos.left }}
        >

          {/* 顶部 */}
          <div className="di-head" onMouseDown={onDragStart}>
            <div className="di-head-left">
              <span className="di-title">{panelTitle}</span>
              <span className="di-badge-dev" title="开发环境工具">DEV</span>
              <button
                type="button"
                className={`di-library-trigger${libraryOpen ? ' di-library-trigger--on' : ''}`}
                onClick={() => {
                  setLibraryOpen(v => !v);
                  setComponentCreateOpen(false);
                  setComponentCreateContainerMenuOpen(false);
                  setComponentCreateTypeMenuOpen(false);
                }}
                title="打开设计库"
                aria-label="打开设计库"
                aria-expanded={libraryOpen}
              >
                <LibraryIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                Library
              </button>
              <button
                className="di-head-icon-btn"
                title="选中父层"
                disabled={!selected.parentElement || selected.parentElement === document.body}
                onClick={() => { if (selected.parentElement && selected.parentElement !== document.body) selectEl(selected.parentElement); }}
              >
                <ArrowUp size={15} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                className="di-head-icon-btn"
                title="选中第一个子层"
                disabled={!selected.firstElementChild}
                onClick={() => { if (selected.firstElementChild) selectEl(selected.firstElementChild); }}
              >
                <ArrowDown size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <div className="di-head-right">
              <button className="di-head-icon-btn" onClick={handleClose} title="关闭面板" aria-label="关闭面板">
                <X size={15} strokeWidth={2.2} aria-hidden="true" />
              </button>
            </div>
          </div>

          {libraryOpen && (
            <div className="di-library-layer" role="presentation">
              <div className="di-library-drawer" role="dialog" aria-modal="true" aria-label="设计库">
                <div className="di-library-head">
                  <div className="di-library-title">
                    <LibraryIcon size={15} strokeWidth={2.2} aria-hidden="true" />
                    Library
                    <span>设计库</span>
                  </div>
                  <div className="di-library-head-actions">
                    <button
                      type="button"
                      className="di-library-workbench-trigger"
                      onClick={() => {
                        setLibraryWorkbenchOpen(true);
                        setLibraryOpen(false);
                        setComponentCreateOpen(false);
                      }}
                    >
                      完整设计库
                    </button>
                    <button
                      type="button"
                      className="di-head-icon-btn"
                      onClick={() => setLibraryOpen(false)}
                      title="关闭设计库"
                      aria-label="关闭设计库"
                    >
                      <X size={15} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="di-library-tabs" role="tablist" aria-label="设计库分类">
                  <button
                    type="button"
                    className={`di-library-tab${libraryTab === 'tokens' ? ' di-library-tab--active' : ''}`}
                    onClick={() => setLibraryTab('tokens')}
                    role="tab"
                    aria-selected={libraryTab === 'tokens'}
                  >
                    Tokens
                  </button>
                  <button
                    type="button"
                    className={`di-library-tab${libraryTab === 'components' ? ' di-library-tab--active' : ''}`}
                    onClick={() => setLibraryTab('components')}
                    role="tab"
                    aria-selected={libraryTab === 'components'}
                  >
                    Components
                  </button>
                </div>

                {libraryTab === 'tokens' ? (
                  <div className="di-library-content" role="tabpanel" aria-label="Tokens">
                    <div className="di-library-tools">
                      <label className="di-library-search">
                        <span>搜索</span>
                        <input
                          value={librarySearch}
                          onChange={event => setLibrarySearch(event.currentTarget.value)}
                          placeholder="名称、值、用途"
                        />
                      </label>
                      <div className="di-library-categories" aria-label="Token 分类">
                        {LIBRARY_TOKEN_CATEGORIES.map(category => (
                          <button
                            type="button"
                            key={category.key}
                            className={`di-library-category${libraryTokenCategory === category.key ? ' di-library-category--active' : ''}`}
                            onClick={() => setLibraryTokenCategory(category.key)}
                          >
                            {category.label}
                            <span className="di-library-category-count">{libraryTokenCategoryCounts[category.key] ?? 0}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="di-library-summary">
                      <strong>{filteredLibraryTokenItems.length}</strong>
                      <span>个 token</span>
                      <small>统一查看、筛选和定位使用情况</small>
                    </div>

                    <div className="di-library-list">
                      {visibleLibraryTokenItems.map(item => {
                        const usageCount = countLibraryTokenUsage(item);
                        const previewValue = item.previewValue || item.rawValue;
                        const previewStyle = previewValue
                          ? ({ '--di-library-preview': previewValue } as CSSProperties)
                          : undefined;
                        return (
                          <div className="di-library-token-row" key={item.id}>
                            <span
                              className={`di-library-token-preview di-library-token-preview--${item.preview}`}
                              style={previewStyle}
                              aria-hidden="true"
                            />
                            <div className="di-library-token-main">
                              <div className="di-library-token-name">{item.name}</div>
                              <div className="di-library-token-meta">
                                <span>{item.categoryLabel}</span>
                                <span>{item.usage}</span>
                              </div>
                            </div>
                            <div className="di-library-token-side">
                              <code>{item.value}</code>
                              <span>{item.status}</span>
                            </div>
                            <button
                              type="button"
                              className="di-library-token-usage"
                              onClick={() => focusLibraryTokenUsage(item)}
                              title={usageCount === null ? '无法统计使用情况' : usageCount > 0 ? '定位第一个使用处' : '当前页面未使用'}
                            >
                              <strong>{usageCount === null ? '—' : usageCount}</strong>
                              <span>使用</span>
                            </button>
                          </div>
                        );
                      })}
                      {!visibleLibraryTokenItems.length ? (
                        <div className="di-library-empty">没有匹配的 token</div>
                      ) : null}
                      {filteredLibraryTokenItems.length > visibleLibraryTokenItems.length ? (
                        <div className="di-library-more">仅展示前 {visibleLibraryTokenItems.length} 个结果</div>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="di-library-content" role="tabpanel" aria-label="Components">
                    <div className="di-library-note">
                      Components 在轻入口展示当前识别能力概览；增删改查进入完整设计库，以设计库草稿形式进入修改内容。
                    </div>
                    <div className="di-library-list">
                      {componentLibraryItems.map(item => (
                        <div className="di-library-component-row" key={item.id}>
                          <div className="di-library-component-icon" aria-hidden="true">
                            <ComponentIcon size={15} strokeWidth={2.2} />
                          </div>
                          <div className="di-library-component-main">
                            <div className="di-library-component-title">
                              {item.label}
                              <span>{item.type}</span>
                            </div>
                            <div className="di-library-component-summary">{item.summary}</div>
                          </div>
                          <span className="di-library-component-status">{item.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {libraryWorkbenchOpen && (
            <div className="di-library-workbench-layer" role="presentation">
              <div className="di-library-workbench" role="dialog" aria-modal="true" aria-label="完整设计库">
                <div className="di-library-workbench-head">
                  <div className="di-library-workbench-title">
                    <LibraryIcon size={18} strokeWidth={2.2} aria-hidden="true" />
                    <div>
                      <strong>Library</strong>
                      <span>完整设计库管理页</span>
                    </div>
                  </div>
                  <div className="di-library-workbench-head-actions">
                    <button
                      type="button"
                      className="di-library-workbench-soft-btn"
                      onClick={() => setLibraryOpen(true)}
                    >
                      回到面板入口
                    </button>
                    <button
                      type="button"
                      className="di-head-icon-btn"
                      onClick={() => {
                        setLibraryWorkbenchOpen(false);
                        setLibraryTokenForm(null);
                        setLibraryComponentForm(null);
                      }}
                      title="关闭完整设计库"
                      aria-label="关闭完整设计库"
                    >
                      <X size={15} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="di-library-workbench-grid">
                  <aside className="di-library-workbench-nav">
                    <div className="di-library-workbench-brand">
                      <strong>Design Library</strong>
                      <span>可视化资源管理</span>
                    </div>
                    <div className="di-library-workbench-tabs" role="tablist" aria-label="设计库资源">
                      {libraryNavItems.map(item => (
                        <button
                          type="button"
                          key={item.key}
                          className={`di-library-workbench-tab${libraryTab === item.key ? ' di-library-workbench-tab--active' : ''}`}
                          onClick={() => {
                            setLibraryTab(item.key);
                            setLibraryTokenForm(null);
                            setLibraryComponentForm(null);
                          }}
                          role="tab"
                          aria-selected={libraryTab === item.key}
                        >
                          <span>
                            {item.label}
                            <small>{item.hint}</small>
                          </span>
                          <strong>{item.count}</strong>
                        </button>
                      ))}
                    </div>

                    {(libraryTab === 'tokens' || libraryTab === 'components') && (
                      <label className="di-library-workbench-search">
                        <span>搜索</span>
                        <input
                          value={librarySearch}
                          onChange={event => setLibrarySearch(event.currentTarget.value)}
                          placeholder="名称、值、用途、selector"
                        />
                      </label>
                    )}

                    {libraryTab === 'tokens' ? (
                      <>
                        <div className="di-library-workbench-nav-title">分类</div>
                        <div className="di-library-workbench-filter-list">
                          {LIBRARY_TOKEN_CATEGORIES.map(category => (
                            <button
                              type="button"
                              key={category.key}
                              className={`di-library-workbench-filter${libraryTokenCategory === category.key ? ' di-library-workbench-filter--active' : ''}`}
                              onClick={() => setLibraryTokenCategory(category.key)}
                            >
                              <span>{category.label}</span>
                              <strong>{libraryTokenCategoryCounts[category.key] ?? 0}</strong>
                            </button>
                          ))}
                        </div>
                        <div className="di-library-workbench-nav-title">使用情况</div>
                        <div className="di-library-workbench-filter-list">
                          {([
                            ['all', '全部'],
                            ['used', '已使用'],
                            ['unused', '未使用'],
                            ['unknown', '无法统计'],
                          ] as const).map(([key, label]) => (
                            <button
                              type="button"
                              key={key}
                              className={`di-library-workbench-filter${libraryTokenUsageFilter === key ? ' di-library-workbench-filter--active' : ''}`}
                              onClick={() => setLibraryTokenUsageFilter(key)}
                            >
                              <span>{label}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    ) : libraryTab === 'components' ? (
                      <>
                        <div className="di-library-workbench-nav-title">组件分类</div>
                        <div className="di-library-workbench-filter-list">
                          {LIBRARY_COMPONENT_CATEGORIES.map(category => (
                            <button
                              type="button"
                              key={category.key}
                              className={`di-library-workbench-filter${libraryComponentCategory === category.key ? ' di-library-workbench-filter--active' : ''}`}
                              onClick={() => setLibraryComponentCategory(category.key)}
                            >
                              <span>{category.label}</span>
                              <strong>{libraryComponentCategoryCounts[category.key] ?? 0}</strong>
                            </button>
                          ))}
                        </div>
                        <div className="di-library-workbench-note">
                          中间展示真实组件预览；新增、编辑、删除仍只进入设计库草稿，不直接改源码组件。
                        </div>
                      </>
                    ) : libraryTab === 'changes' ? (
                      <div className="di-library-workbench-note">
                        Changes 是发送给 AI 前的复核区。这里展示所有设计库和样式草稿，不直接写源码。
                      </div>
                    ) : (
                      <div className="di-library-workbench-note">
                        Usage 用于删除或替换前的影响检查。点击使用次数会回到页面定位第一个命中元素。
                      </div>
                    )}
                  </aside>

                  <main className="di-library-workbench-main">
                    {libraryTab === 'tokens' ? (
                      <>
                        <div className="di-library-workbench-toolbar">
                          <div>
                            <strong>{filteredLibraryTokenItems.length}</strong>
                            <span>个 token</span>
                          </div>
                          <button type="button" className="di-btn-save" onClick={openLibraryTokenCreate}>
                            + Token
                          </button>
                        </div>
                        <div className="di-library-workbench-table" role="table" aria-label="Token 列表">
                          <div className="di-library-workbench-table-head" role="row">
                            <span>Token</span>
                            <span>值 / 用途</span>
                            <span>状态</span>
                            <span>使用</span>
                            <span>操作</span>
                          </div>
                          {visibleLibraryTokenItems.map(item => {
                            const usageCount = countLibraryTokenUsage(item);
                            const isSelected = selectedLibraryToken?.id === item.id;
                            return (
                              <div
                                className={`di-library-workbench-row${isSelected ? ' di-library-workbench-row--selected' : ''}`}
                                role="row"
                                key={item.id}
                                onClick={() => {
                                  setSelectedLibraryTokenId(item.id);
                                  setLibraryTokenForm(null);
                                }}
                              >
                                <div className="di-library-workbench-token-cell">
                                  <span
                                    className={`di-library-token-preview di-library-token-preview--${item.preview}`}
                                    style={item.previewValue ? ({ '--di-library-preview': item.previewValue } as CSSProperties) : undefined}
                                    aria-hidden="true"
                                  />
                                  <div>
                                    <strong>{item.name}</strong>
                                    <small>{item.categoryLabel}</small>
                                  </div>
                                </div>
                                <div className="di-library-workbench-copy-cell">
                                  <code>{item.value}</code>
                                  <span>{item.usage}</span>
                                </div>
                                <span className="di-library-workbench-status">{libraryDeletedTokenIds[item.id] || item.status}</span>
                                <button
                                  type="button"
                                  className="di-library-workbench-count"
                                  onClick={event => {
                                    event.stopPropagation();
                                    focusLibraryTokenUsage(item);
                                  }}
                                  title={usageCount === null ? '无法统计使用情况' : usageCount > 0 ? '定位第一个使用处' : '当前页面未使用'}
                                >
                                  {usageCount === null ? '—' : usageCount}
                                </button>
                                <div className="di-library-workbench-actions">
                                  <button type="button" onClick={event => { event.stopPropagation(); copyTextToClipboard(item.name); }}>复制名</button>
                                  <button type="button" onClick={event => { event.stopPropagation(); openLibraryTokenEdit(item); }}>编辑</button>
                                  <button type="button" onClick={event => { event.stopPropagation(); deleteLibraryToken(item); }}>删除</button>
                                </div>
                              </div>
                            );
                          })}
                          {!visibleLibraryTokenItems.length ? (
                            <div className="di-library-workbench-empty">没有匹配的 token</div>
                          ) : null}
                        </div>
                      </>
                    ) : libraryTab === 'components' ? (
                      <>
                        <div className="di-library-workbench-toolbar">
                          <div>
                            <strong>{filteredLibraryComponentItems.length}</strong>
                            <span>个组件 / {filteredLibraryComponentSpecCount} 个规格</span>
                          </div>
                          <button type="button" className="di-btn-save" onClick={openLibraryComponentCreate}>
                            + 组件规格
                          </button>
                        </div>
                        <div className="di-library-component-preview-grid" role="list" aria-label="组件真实预览">
                          {filteredLibraryComponentItems.map(item => {
                            const isSelected = selectedLibraryComponent?.id === item.id;
                            return (
                              <div
                                className={`di-library-component-preview-card${isSelected ? ' di-library-component-preview-card--selected' : ''}`}
                                role="listitem"
                                tabIndex={0}
                                aria-current={isSelected ? 'true' : undefined}
                                key={item.id}
                                onClick={() => {
                                  setSelectedLibraryComponentId(item.id);
                                  setSelectedLibraryComponentVariantId(item.preview?.variants[0]
                                    ? getLibraryComponentVariantKey(item.id, item.preview.variants[0].id)
                                    : '');
                                  setLibraryComponentForm(null);
                                }}
                                onKeyDown={event => {
                                  if (event.key !== 'Enter' && event.key !== ' ') return;
                                  event.preventDefault();
                                  setSelectedLibraryComponentId(item.id);
                                  setSelectedLibraryComponentVariantId(item.preview?.variants[0]
                                    ? getLibraryComponentVariantKey(item.id, item.preview.variants[0].id)
                                    : '');
                                  setLibraryComponentForm(null);
                                }}
                              >
                                <div className="di-library-component-preview-head">
                                  <div>
                                    <span>{item.categoryLabel}</span>
                                    <strong>{item.label}</strong>
                                  </div>
                                  <small>{libraryDeletedComponentIds[item.id] || item.status}</small>
                                </div>
                                <div className="di-library-component-preview-stage">
                                  {renderLibraryComponentPreview(item)}
                                </div>
                                <div className="di-library-component-preview-copy">
                                  <span>{item.type}</span>
                                  <p>{item.summary}</p>
                                  <code>{item.selector}</code>
                                </div>
                                <div className="di-library-component-preview-actions">
                                  <button type="button" onClick={event => { event.stopPropagation(); copyTextToClipboard(item.selector); }}>复制 selector</button>
                                  <button type="button" onClick={event => { event.stopPropagation(); openLibraryComponentEdit(item); }}>编辑</button>
                                  <button type="button" onClick={event => { event.stopPropagation(); deleteLibraryComponent(item); }}>删除</button>
                                </div>
                              </div>
                            );
                          })}
                          {!filteredLibraryComponentItems.length ? (
                            <div className="di-library-workbench-empty">没有匹配的组件规格</div>
                          ) : null}
                        </div>
                      </>
                    ) : libraryTab === 'changes' ? (
                      <>
                        <div className="di-library-workbench-toolbar">
                          <div>
                            <strong>{localDraftChangeCount}</strong>
                            <span>条待处理修改</span>
                          </div>
                          <button
                            type="button"
                            className="di-btn-save"
                            disabled={localDraftChangeCount === 0}
                            onClick={handleSubmitToAi}
                          >
                            {submitMsg || '发送给AI'}
                          </button>
                        </div>
                        <div className="di-library-workbench-table" role="table" aria-label="修改篮列表">
                          <div className="di-library-workbench-table-head di-library-workbench-table-head--changes" role="row">
                            <span>对象</span>
                            <span>修改内容</span>
                            <span>范围</span>
                            <span>操作</span>
                          </div>
                          {libraryDraftChangeRows.map(({ entry, change, index }) => (
                            <div
                              className="di-library-workbench-row di-library-workbench-row--changes"
                              role="row"
                              key={`${entry.key}-${change.prop}-${index}`}
                            >
                              <div className="di-library-workbench-token-cell">
                                <span className="di-library-change-index">{index + 1}</span>
                                <div>
                                  <strong>{entry.targetLabel}</strong>
                                  <small>{entry.selector}</small>
                                </div>
                              </div>
                              <div className="di-library-workbench-copy-cell">
                                <code>{getChangeLabel(change.prop)}</code>
                                <span>{formatStoredChangeRecordValue(change.prop, change.from)} → {formatStoredChangeRecordValue(change.prop, change.val)}</span>
                              </div>
                              <span className="di-library-workbench-status">{entry.scopeLabel}</span>
                              <div className="di-library-workbench-actions">
                                <button type="button" onClick={() => handleResetLocalDraftChange(entry.key, change.prop)}>移除</button>
                                <button type="button" onClick={() => handleDeleteLocalDraft(entry.key)}>删除对象</button>
                              </div>
                            </div>
                          ))}
                          {!libraryDraftChangeRows.length ? (
                            <div className="di-library-workbench-empty">修改篮为空</div>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="di-library-workbench-toolbar">
                          <div>
                            <strong>{libraryUsageItems.length}</strong>
                            <span>个可统计资源</span>
                          </div>
                          <button
                            type="button"
                            className="di-library-workbench-soft-btn"
                            onClick={() => setLibraryTab('tokens')}
                          >
                            返回 Tokens
                          </button>
                        </div>
                        <div className="di-library-workbench-table" role="table" aria-label="使用治理列表">
                          <div className="di-library-workbench-table-head di-library-workbench-table-head--usage" role="row">
                            <span>Token</span>
                            <span>用途</span>
                            <span>使用</span>
                            <span>治理动作</span>
                          </div>
                          {libraryUsageItems.map(({ item, usageCount }) => (
                            <div
                              className="di-library-workbench-row di-library-workbench-row--usage"
                              role="row"
                              key={`usage-${item.id}`}
                              onClick={() => {
                                setSelectedLibraryTokenId(item.id);
                                setLibraryTokenForm(null);
                              }}
                            >
                              <div className="di-library-workbench-token-cell">
                                <span
                                  className={`di-library-token-preview di-library-token-preview--${item.preview}`}
                                  style={item.previewValue ? ({ '--di-library-preview': item.previewValue } as CSSProperties) : undefined}
                                  aria-hidden="true"
                                />
                                <div>
                                  <strong>{item.name}</strong>
                                  <small>{item.categoryLabel}</small>
                                </div>
                              </div>
                              <div className="di-library-workbench-copy-cell">
                                <code>{item.value}</code>
                                <span>{item.usage}</span>
                              </div>
                              <button
                                type="button"
                                className="di-library-workbench-count"
                                onClick={event => {
                                  event.stopPropagation();
                                  focusLibraryTokenUsage(item);
                                }}
                              >
                                {usageCount}
                              </button>
                              <div className="di-library-workbench-actions">
                                <button type="button" onClick={event => { event.stopPropagation(); focusLibraryTokenUsage(item); }}>定位</button>
                                <button type="button" onClick={event => { event.stopPropagation(); openLibraryTokenEdit(item); }}>替换草稿</button>
                                <button type="button" onClick={event => { event.stopPropagation(); deleteLibraryToken(item); }}>删除草稿</button>
                              </div>
                            </div>
                          ))}
                          {!libraryUsageItems.length ? (
                            <div className="di-library-workbench-empty">当前没有可统计使用情况的 token</div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </main>

                  <aside className="di-library-workbench-detail">
                    {libraryTab === 'tokens' ? (
                      libraryTokenForm ? (
                        <div className="di-library-edit-panel">
                          <div className="di-library-edit-head">
                            <strong>{libraryTokenForm.mode === 'create' ? '新增 Token' : '编辑 Token'}</strong>
                            <button type="button" className="di-head-icon-btn" onClick={() => setLibraryTokenForm(null)} aria-label="关闭 token 表单">
                              <X size={15} strokeWidth={2.2} aria-hidden="true" />
                            </button>
                          </div>
                          <label>
                            <span>名称</span>
                            <input value={libraryTokenForm.name} onChange={event => setLibraryTokenForm(prev => prev ? { ...prev, name: event.currentTarget.value } : prev)} />
                          </label>
                          <label>
                            <span>分类</span>
                            <select value={libraryTokenForm.category} onChange={event => setLibraryTokenForm(prev => prev ? { ...prev, category: event.currentTarget.value as LibraryTokenItemCategory } : prev)}>
                              {LIBRARY_TOKEN_CATEGORIES.filter(item => item.key !== 'all').map(item => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>值</span>
                            <input value={libraryTokenForm.value} onChange={event => setLibraryTokenForm(prev => prev ? { ...prev, value: event.currentTarget.value } : prev)} />
                          </label>
                          <label>
                            <span>用途</span>
                            <input value={libraryTokenForm.usage} onChange={event => setLibraryTokenForm(prev => prev ? { ...prev, usage: event.currentTarget.value } : prev)} />
                          </label>
                          <label>
                            <span>状态</span>
                            <input value={libraryTokenForm.status} onChange={event => setLibraryTokenForm(prev => prev ? { ...prev, status: event.currentTarget.value } : prev)} />
                          </label>
                          <button type="button" className="di-btn-save" onClick={submitLibraryTokenForm}>保存到修改内容</button>
                        </div>
                      ) : selectedLibraryToken ? (
                        <div className="di-library-detail-card">
                          <div className="di-library-detail-kicker">{selectedLibraryToken.categoryLabel}</div>
                          <h3>{selectedLibraryToken.name}</h3>
                          <div className="di-library-detail-preview">
                            <span
                              className={`di-library-token-preview di-library-token-preview--${selectedLibraryToken.preview}`}
                              style={selectedLibraryToken.previewValue ? ({ '--di-library-preview': selectedLibraryToken.previewValue } as CSSProperties) : undefined}
                              aria-hidden="true"
                            />
                            <code>{selectedLibraryToken.value}</code>
                          </div>
                          <dl>
                            <div><dt>用途</dt><dd>{selectedLibraryToken.usage}</dd></div>
                            <div><dt>来源</dt><dd>{selectedLibraryToken.status}</dd></div>
                            <div><dt>使用</dt><dd>{countLibraryTokenUsage(selectedLibraryToken) ?? '无法统计'}</dd></div>
                            <div><dt>CSS var</dt><dd>{selectedLibraryToken.name.startsWith('--') ? `var(${selectedLibraryToken.name})` : selectedLibraryToken.name}</dd></div>
                          </dl>
                          <div className="di-library-detail-actions">
                            <button type="button" onClick={() => copyTextToClipboard(selectedLibraryToken.name)}>复制名称</button>
                            <button type="button" onClick={() => copyTextToClipboard(selectedLibraryToken.value)}>复制值</button>
                            <button type="button" onClick={() => copyTextToClipboard(selectedLibraryToken.name.startsWith('--') ? `var(${selectedLibraryToken.name})` : selectedLibraryToken.name)}>复制 var</button>
                            <button type="button" onClick={() => focusLibraryTokenUsage(selectedLibraryToken)}>定位使用</button>
                            <button type="button" onClick={() => openLibraryTokenEdit(selectedLibraryToken)}>编辑</button>
                          </div>
                        </div>
                      ) : (
                        <div className="di-library-workbench-empty">选择一个 token 查看详情</div>
                      )
                    ) : libraryTab === 'components' ? (
                      libraryComponentForm ? (
                        <div className="di-library-edit-panel">
                          <div className="di-library-edit-head">
                            <strong>{libraryComponentForm.mode === 'create' ? '新增组件规格' : '编辑组件规格'}</strong>
                            <button type="button" className="di-head-icon-btn" onClick={() => setLibraryComponentForm(null)} aria-label="关闭组件规格表单">
                              <X size={15} strokeWidth={2.2} aria-hidden="true" />
                            </button>
                          </div>
                          <label>
                            <span>分类</span>
                            <select value={libraryComponentForm.category} onChange={event => setLibraryComponentForm(prev => prev ? { ...prev, category: event.currentTarget.value as LibraryComponentItemCategory } : prev)}>
                              {LIBRARY_COMPONENT_CATEGORIES.filter(item => item.key !== 'all').map(item => (
                                <option key={item.key} value={item.key}>{item.label}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            <span>类型</span>
                            <input value={libraryComponentForm.type} onChange={event => setLibraryComponentForm(prev => prev ? { ...prev, type: event.currentTarget.value } : prev)} />
                          </label>
                          <label>
                            <span>名称</span>
                            <input value={libraryComponentForm.label} onChange={event => setLibraryComponentForm(prev => prev ? { ...prev, label: event.currentTarget.value } : prev)} />
                          </label>
                          <label>
                            <span>能力</span>
                            <input value={libraryComponentForm.summary} onChange={event => setLibraryComponentForm(prev => prev ? { ...prev, summary: event.currentTarget.value } : prev)} />
                          </label>
                          <label>
                            <span>Selector</span>
                            <input value={libraryComponentForm.selector} onChange={event => setLibraryComponentForm(prev => prev ? { ...prev, selector: event.currentTarget.value } : prev)} />
                          </label>
                          <label>
                            <span>状态</span>
                            <input value={libraryComponentForm.status} onChange={event => setLibraryComponentForm(prev => prev ? { ...prev, status: event.currentTarget.value } : prev)} />
                          </label>
                          <button type="button" className="di-btn-save" onClick={submitLibraryComponentForm}>保存到修改内容</button>
                        </div>
                      ) : selectedLibraryComponentSpec ? (
                        <div className="di-library-detail-card">
                          <div className="di-library-detail-kicker">{selectedLibraryComponentSpec.component.categoryLabel} / 具体规格</div>
                          <h3>{selectedLibraryComponentSpec.component.label} / {selectedLibraryComponentSpec.variant.label}</h3>
                          <div className="di-library-detail-preview di-library-detail-preview--component">
                            {renderLibraryComponentSpecPreview(selectedLibraryComponentSpec)}
                          </div>
                          <div className="di-library-spec-pills" aria-label="组件规格能力">
                            {selectedLibraryComponentSpec.capabilities.map(capability => (
                              <span key={capability}>{capability}</span>
                            ))}
                          </div>
                          <dl>
                            <div><dt>组件族</dt><dd>{selectedLibraryComponentSpec.component.type}</dd></div>
                            <div><dt>用途</dt><dd>{selectedLibraryComponentSpec.purpose}</dd></div>
                            <div><dt>Props</dt><dd>{selectedLibraryComponentSpec.variant.propsLabel || '默认 props'}</dd></div>
                            <div><dt>使用</dt><dd>{selectedLibraryComponentSpec.usageCount === null ? '无法统计' : `${selectedLibraryComponentSpec.usageCount} 次`}</dd></div>
                            <div><dt>Selector</dt><dd>{selectedLibraryComponentSpec.selector}</dd></div>
                            <div><dt>Token 绑定</dt><dd>{selectedLibraryComponentSpec.tokenRefs.length ? selectedLibraryComponentSpec.tokenRefs.join(' / ') : '未登记'}</dd></div>
                            <div><dt>状态</dt><dd>{selectedLibraryComponentSpec.variant.status || selectedLibraryComponentSpec.component.status}</dd></div>
                          </dl>
                          <div className="di-library-detail-actions">
                            <button type="button" onClick={() => copyTextToClipboard(selectedLibraryComponentSpec.selector)}>复制 selector</button>
                            <button type="button" onClick={() => copyTextToClipboard(selectedLibraryComponentSpec.variant.propsLabel || '')}>复制 props</button>
                            <button type="button" onClick={() => openLibraryComponentEdit(selectedLibraryComponentSpec.component)}>编辑组件</button>
                            <button type="button" onClick={() => deleteLibraryComponent(selectedLibraryComponentSpec.component)}>删除草稿</button>
                          </div>
                        </div>
                      ) : selectedLibraryComponent ? (
                        <div className="di-library-detail-card">
                          <div className="di-library-detail-kicker">{selectedLibraryComponent.categoryLabel}</div>
                          <h3>{selectedLibraryComponent.label}</h3>
                          <div className="di-library-detail-preview di-library-detail-preview--component">
                            <div className="di-library-component-preview-stage">
                              {renderLibraryComponentPreview(selectedLibraryComponent, 'detail')}
                            </div>
                          </div>
                          <dl>
                            <div><dt>类型</dt><dd>{selectedLibraryComponent.type}</dd></div>
                            <div><dt>分类</dt><dd>{selectedLibraryComponent.categoryLabel}</dd></div>
                            <div><dt>能力</dt><dd>{selectedLibraryComponent.summary}</dd></div>
                            <div><dt>Selector</dt><dd>{selectedLibraryComponent.selector}</dd></div>
                            <div><dt>状态</dt><dd>{selectedLibraryComponent.status}</dd></div>
                          </dl>
                          <div className="di-library-detail-actions">
                            <button type="button" onClick={() => copyTextToClipboard(selectedLibraryComponent.selector)}>复制 selector</button>
                            <button type="button" onClick={() => openLibraryComponentEdit(selectedLibraryComponent)}>编辑</button>
                            <button type="button" onClick={() => deleteLibraryComponent(selectedLibraryComponent)}>删除</button>
                          </div>
                        </div>
                      ) : (
                        <div className="di-library-workbench-empty">选择一个组件规格查看详情</div>
                      )
                    ) : libraryTab === 'changes' ? (
                      <div className="di-library-detail-card">
                        <div className="di-library-detail-kicker">Changes</div>
                        <h3>修改篮</h3>
                        <dl>
                          <div><dt>对象</dt><dd>{localDraftEntries.length}</dd></div>
                          <div><dt>修改</dt><dd>{localDraftChangeCount}</dd></div>
                          <div><dt>链路</dt><dd>只生成 AI 任务，不直接写源码</dd></div>
                        </dl>
                        <div className="di-library-detail-actions">
                          <button type="button" onClick={handleSubmitToAi} disabled={localDraftChangeCount === 0}>{submitMsg || '发送给AI'}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="di-library-detail-card">
                        <div className="di-library-detail-kicker">Usage</div>
                        <h3>使用治理</h3>
                        <dl>
                          <div><dt>可统计资源</dt><dd>{libraryUsageItems.length}</dd></div>
                          <div><dt>删除规则</dt><dd>已使用 token 只能生成“先替换再删除”的任务</dd></div>
                          <div><dt>定位规则</dt><dd>点击使用次数回到页面选中第一个命中元素</dd></div>
                        </dl>
                      </div>
                    )}
                    <div className="di-library-basket-card">
                      <div>
                        <span>修改篮</span>
                        <strong>{localDraftChangeCount}</strong>
                      </div>
                      <p>{localDraftChangeCount > 0 ? '发送给 AI 前统一复核' : '暂无设计库或样式草稿'}</p>
                      <button
                        type="button"
                        className="di-btn-save"
                        disabled={localDraftChangeCount === 0}
                        onClick={handleSubmitToAi}
                      >
                        {submitMsg || '发送给AI'}
                      </button>
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          )}

          {componentCreateOpen && (
            <div className="di-component-create-layer" role="presentation">
              <div className="di-component-create-drawer" role="dialog" aria-modal="true" aria-label="创建组件规范">
                <div className="di-component-create-head">
                  <div className="di-component-create-title">
                    <ComponentIcon size={15} strokeWidth={2.2} aria-hidden="true" />
                    创建组件
                  </div>
                  <button
                    type="button"
                    className="di-head-icon-btn"
                    onClick={() => {
                      setComponentCreateOpen(false);
                      setComponentCreateContainerMenuOpen(false);
                      setComponentCreateTypeMenuOpen(false);
                    }}
                    title="关闭创建组件"
                    aria-label="关闭创建组件"
                  >
                    <X size={15} strokeWidth={2.2} aria-hidden="true" />
                  </button>
                </div>

                <div className="di-component-create-scroll">
                  <div className="di-component-create-summary">
                    <div>
                      <span>当前元素</span>
                      <strong>{componentCreateTargetLabel}</strong>
                    </div>
                    <code title={componentCreateSelector}>{componentCreateSelector}</code>
                    {componentCreateDefaultText ? (
                      <p title={componentCreateDefaultText}>{componentCreateDefaultText}</p>
                    ) : null}
                  </div>

                  <div className="di-component-create-form">
                    <div className="di-component-create-field di-component-create-field--wide">
                      <span>容器</span>
                      <div className="di-component-type-combobox">
                        <button
                          type="button"
                          className="di-component-type-trigger"
                          onClick={() => {
                            setComponentCreateContainerMenuOpen(v => !v);
                            setComponentCreateTypeMenuOpen(false);
                          }}
                          aria-label="选择所属容器"
                          aria-expanded={componentCreateContainerMenuOpen}
                          aria-haspopup="listbox"
                        >
                          <span className="di-component-type-trigger-value">{componentCreateContainerOption.label}</span>
                          <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                        {componentCreateContainerMenuOpen && (
                          <div className="di-component-type-menu" role="listbox">
                            <div className="di-component-type-menu-head">
                              先确定这个元素服务于哪个结构
                            </div>
                            {COMPONENT_CONTAINER_OPTIONS.map(option => (
                              <button
                                type="button"
                                key={option.key}
                                className={`di-component-type-option${option.key === componentCreateContainer ? ' di-component-type-option--active' : ''}`}
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => applyComponentCreateContainer(option.key)}
                                role="option"
                                aria-selected={option.key === componentCreateContainer}
                              >
                                <strong>{option.label}</strong>
                                <span>{option.hint}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="di-component-create-field di-component-create-field--wide">
                      <span>用途</span>
                      <div className="di-component-type-combobox">
                        <button
                          type="button"
                          className="di-component-type-trigger"
                          onClick={() => {
                            setComponentCreateTypeMenuOpen(v => !v);
                            setComponentCreateContainerMenuOpen(false);
                          }}
                          aria-label="选择元素用途"
                          aria-expanded={componentCreateTypeMenuOpen}
                          aria-haspopup="listbox"
                        >
                          <span className="di-component-type-trigger-value">{componentCreateType || '选择用途'}</span>
                          <ChevronDown size={14} strokeWidth={2.2} aria-hidden="true" />
                        </button>
                        {componentCreateTypeMenuOpen && (
                          <div className="di-component-type-menu" role="listbox">
                            <div className="di-component-type-menu-head">
                              再确定它在容器里的职责
                            </div>
                            {componentCreateTypeOptions.map(option => (
                              <button
                                type="button"
                                key={option.label}
                                className={`di-component-type-option${normalizeComponentType(option.label) === componentCreateTypeQuery ? ' di-component-type-option--active' : ''}`}
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => applyComponentCreateType(option.label)}
                                role="option"
                                aria-selected={normalizeComponentType(option.label) === componentCreateTypeQuery}
                              >
                                <strong>{option.label}</strong>
                                <span>{option.hint}</span>
                              </button>
                            ))}
                            {!componentCreateTypeOptions.length ? (
                              <div className="di-component-type-empty">没有匹配用途</div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                    <label className="di-component-create-field di-component-create-field--wide">
                      <span>名称</span>
                      <input
                        value={componentSpecDraft.componentName}
                        onChange={event => {
                          setComponentCreateNameTouched(true);
                          syncComponentSpecDraft({ componentName: event.currentTarget.value });
                        }}
                        placeholder="page-title"
                      />
                    </label>
                    {componentCreateExistingMatch ? (
                      <div className="di-component-create-existing">
                        <div className="di-component-create-existing-copy">
                          <span>已有同类</span>
                          <strong>{componentCreateExistingMatch.componentName}</strong>
                          <small>{componentCreateExistingMatch.usage || componentCreateExistingMatch.targetLabel}</small>
                        </div>
                        <div className="di-component-create-existing-actions">
                          <button
                            type="button"
                            className={componentCreateResolution === 'reuse' ? 'di-segment-pill di-segment-pill--active' : 'di-segment-pill'}
                            onClick={() => {
                              setComponentCreateResolution('reuse');
                              setComponentCreateNameTouched(false);
                              syncComponentSpecDraft({
                                sourceMode: '复用已有组件',
                                action: '复用组件',
                                componentName: componentCreateExistingMatch.componentName,
                              });
                            }}
                          >
                            复用已有组件
                          </button>
                          <button
                            type="button"
                            className={componentCreateResolution === 'new' ? 'di-segment-pill di-segment-pill--active' : 'di-segment-pill'}
                            onClick={() => {
                              const nextName = getUniqueComponentName(getComponentNameByType(componentCreateType, selected, componentCreateContainer));
                              setComponentCreateResolution('new');
                              setComponentCreateNameTouched(false);
                              syncComponentSpecDraft({
                                sourceMode: '新建同类组件',
                                action: '创建组件',
                                componentName: nextName,
                              });
                            }}
                          >
                            新建同类组件
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <label className="di-component-create-field di-component-create-field--wide">
                      <span>使用场景</span>
                      <input
                        value={componentCreatePurpose}
                        onChange={event => {
                          const { value } = event.currentTarget;
                          setComponentCreatePurpose(value);
                          syncComponentSpecDraft({ usage: value });
                        }}
                        placeholder="用于页面顶部主标题展示"
                      />
                    </label>
                  </div>

                  <div className="di-component-create-rules">
                    <div className="di-component-create-rules-title">组件规则</div>
                    <ul>
                      {componentCreateRulePreview.map(rule => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="di-component-create-actions">
                  <button type="button" className="di-btn-save" onClick={handleSendComponentCreateToAi}>
                    发送给AI
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className={`di-body${activePlugin === 'component-maker' ? ' di-body--plugin-page' : ''}`}>

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

            {activePlugin === 'component-maker' && (
              <div className="di-section di-plugin-section di-plugin-section--page">
                <div className="di-plugin-page-head">
                  <button
                    type="button"
                    className="di-plugin-back"
                    onClick={() => setActivePlugin(null)}
                  >
                    <ArrowLeft size={14} strokeWidth={2.1} aria-hidden="true" />
                    样式面板
                  </button>
                  <div className="di-plugin-page-title">
                    <ComponentIcon size={14} strokeWidth={2.2} aria-hidden="true" />
                    组件制作
                  </div>
                  {pluginMsg && <span className="di-plugin-msg">{pluginMsg}</span>}
                </div>
                <div className="di-plugin-panel di-plugin-panel--maker">
                  {isRecognizedComponentVariantFlow ? (
                    <div className="di-plugin-maker-compact di-plugin-maker-compact--variant">
                      <div className="di-plugin-control-row">
                        <span className="di-plugin-label">组件</span>
                        <div className="di-plugin-component-main">
                          <strong>{componentMakerActiveComponentName}</strong>
                          <span>{componentMakerActiveComponentType}</span>
                        </div>
                      </div>
                      <div className="di-plugin-control-row">
                        <span className="di-plugin-label">新增</span>
                        <div className="di-plugin-action-tiles" role="group" aria-label="新增组件变体">
                          {componentMakerVariantActionOptions.map(option => (
                            <button
                              key={option.key}
                              type="button"
                              className={`di-plugin-action-tile${componentMakerAction === option.key ? ' di-plugin-action-tile--on' : ''}`}
                              onClick={() => updateComponentMakerAction(option.key)}
                              title={option.hint}
                            >
                              {option.key === 'create-current-variant' ? '当前变体' : '其他变体'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="di-plugin-maker-compact">
                      <div className="di-plugin-control-row">
                        <span className="di-plugin-label">组件</span>
                        <div className="di-plugin-component-main">
                          <strong>{componentMakerActiveComponentName}</strong>
                          <span>{componentMakerActiveComponentType}</span>
                        </div>
                      </div>
                      <div className="di-plugin-control-row">
                        <span className="di-plugin-label">归属</span>
                        <div className="di-plugin-source-toggle" role="group" aria-label="归属组件来源">
                          <button
                            type="button"
                            className={`di-plugin-choice${componentMakerSourceMode === 'existing' ? ' di-plugin-choice--on' : ''}`}
                            disabled={componentMakerComponentOptions.length === 0}
                            onClick={() => {
                              const fallback = selectedComponentOption?.name ?? componentMakerComponentOptions[0]?.name ?? componentSpecDraft.componentName;
                              updateComponentMakerSourceMode('existing', fallback);
                            }}
                          >
                            已有组件
                          </button>
                          <button
                            type="button"
                            className={`di-plugin-choice${componentMakerSourceMode === 'new' ? ' di-plugin-choice--on' : ''}`}
                            onClick={() => updateComponentMakerSourceMode('new', componentSpecDraft.componentName || getElementDisplayName(selected))}
                          >
                            新建组件
                          </button>
                        </div>
                      </div>
                      <div className="di-plugin-control-row di-plugin-control-row--input">
                        <span className="di-plugin-label">{componentMakerSourceMode === 'existing' ? '选择' : '命名'}</span>
                        {componentMakerSourceMode === 'existing' ? (
                          componentMakerComponentOptions.length > 0 ? (
                            <select
                              className="di-plugin-inline-input"
                              value={selectedComponentOption?.name ?? componentMakerComponentOptions[0]?.name ?? ''}
                              onChange={event => {
                                const { value } = event.currentTarget;
                                syncComponentSpecDraft({
                                  sourceMode: '已有组件',
                                  componentName: value,
                                });
                              }}
                            >
                              {componentMakerComponentOptions.map(option => (
                                <option key={option.name} value={option.name}>
                                  {option.name} · {option.type} · {option.count}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="di-plugin-empty-note">未识别到已有组件，请新建</span>
                          )
                        ) : (
                          <input
                            className="di-plugin-inline-input"
                            value={componentSpecDraft.componentName}
                            placeholder="page-title / card-task"
                            onChange={event => {
                              const { value } = event.currentTarget;
                              syncComponentSpecDraft({
                                sourceMode: '新建组件',
                                componentName: value,
                              });
                            }}
                          />
                        )}
                      </div>
                      <div className="di-plugin-control-row">
                        <span className="di-plugin-label">任务</span>
                        <div className="di-plugin-action-tiles" role="group" aria-label="组件制作动作">
                          {componentMakerActions.map(option => (
                            <button
                              key={option.key}
                              type="button"
                              className={`di-plugin-action-tile${componentMakerAction === option.key ? ' di-plugin-action-tile--on' : ''}`}
                              onClick={() => updateComponentMakerAction(option.key)}
                              title={option.hint}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={`di-plugin-control-card${isRecognizedComponentVariantFlow ? ' di-plugin-control-card--variant-flow' : ''}`}>
                    {isRecognizedComponentVariantFlow ? (
                      <div className="di-plugin-variant-workflow">
                        <label className="di-plugin-control-row di-plugin-control-row--input">
                          <span className="di-plugin-label">代码名</span>
                          <input
                            className="di-plugin-inline-input di-plugin-code-name-input"
                            value={componentMakerVariantCodeName}
                            onChange={event => setComponentVariantDraft(prev => ({ ...prev, name: event.currentTarget.value }))}
                          />
                        </label>

                        <div className="di-plugin-sandbox-controls di-plugin-sandbox-controls--single">
                          {componentMakerVariantGroups.map(([dimension, items]) => (
                            <div className="di-plugin-sandbox-row" key={dimension}>
                              <span className="di-plugin-label">{getComponentMakerDimensionDisplayName(dimension)}</span>
                              <div className="di-plugin-sandbox-options">
                                {items.map(item => {
                                  const isPreview = activeComponentMakerVariantPreview?.id === item.id;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className={`di-plugin-sandbox-option${isPreview ? ' di-plugin-sandbox-option--on di-plugin-sandbox-option--preview' : ''}`}
                                      aria-pressed={isPreview}
                                      onClick={() => setComponentVariantPreviewId(item.id)}
                                      onMouseEnter={() => setComponentVariantPreviewId(item.id)}
                                      title={item.rules}
                                    >
                                      {item.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className={`di-plugin-live-preview di-plugin-live-preview--${activeComponentMakerVariantPreview?.visual ?? 'neutral'}`}>
                          <div className="di-plugin-live-preview-head">
                            <span className="di-plugin-label">真实预览</span>
                            <span className="di-plugin-variant-count">{activeComponentMakerVariantPreview?.description ?? '当前组件'}</span>
                          </div>
                          <div className="di-plugin-real-preview-frame">
                            <div
                              className="di-plugin-real-preview-inner"
                              dangerouslySetInnerHTML={{ __html: componentMakerLivePreviewHtml }}
                            />
                          </div>
                          <div className="di-plugin-preview-meta">
                            <strong>{activeComponentMakerVariantPreview?.label ?? '当前'}</strong>
                            <span>{getComponentMakerDimensionDisplayName(activeComponentMakerVariantPreview?.dimension ?? '变体')}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        {!isComponentMakerVariantAction && (
                          <div className="di-plugin-control-row">
                            <span className="di-plugin-label">规格</span>
                            <span className="di-plugin-value">{COMPONENT_MAKER_ACTION_LABELS[componentMakerAction]}</span>
                          </div>
                        )}
                        {isComponentMakerVariantAction ? (
                      <div className="di-plugin-variant-sandbox">
                        {componentMakerComponentOptions.length > 0 && (
                          <div className="di-plugin-library-row">
                            <span className="di-plugin-label">组件库</span>
                            <div className="di-plugin-library-pills" aria-label="页面组件库">
                              {componentMakerComponentOptions.slice(0, 5).map(option => {
                                const isCurrent = option.name === (selectedComponentOption?.name ?? componentSpecDraft.componentName);
                                return (
                                  <button
                                    key={option.name}
                                    type="button"
                                    className={`di-plugin-library-pill${isCurrent ? ' di-plugin-library-pill--on' : ''}`}
                                    onClick={() => {
                                      updateComponentMakerSourceMode('existing', option.name);
                                      setComponentVariantPreviewId('');
                                    }}
                                    title={`${option.name} · ${option.type} · ${option.count}`}
                                  >
                                    {option.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className={`di-plugin-live-preview di-plugin-live-preview--${activeComponentMakerVariantPreview?.visual ?? 'neutral'}`}>
                          <div className="di-plugin-live-preview-head">
                            <span className="di-plugin-label">真实预览</span>
                            <span className="di-plugin-variant-count">
                              {selectedComponentMakerVariantSuggestions.length} / {componentMakerVariantSuggestions.length}
                            </span>
                          </div>
                          <div className="di-plugin-real-preview-frame">
                            <div
                              className="di-plugin-real-preview-inner"
                              dangerouslySetInnerHTML={{ __html: componentMakerLivePreviewHtml }}
                            />
                          </div>
                          <div className="di-plugin-preview-meta">
                            <strong>{activeComponentMakerVariantPreview?.label ?? '当前'}</strong>
                            <span>{activeComponentMakerVariantPreview?.dimension ?? '变体'}</span>
                          </div>
                        </div>

                        <div className="di-plugin-sandbox-controls">
                          {componentMakerVariantGroups.map(([dimension, items]) => (
                            <div className="di-plugin-sandbox-row" key={dimension}>
                              <span className="di-plugin-label">{dimension}</span>
                              <div className="di-plugin-sandbox-options">
                                {items.map(item => {
                                  const isSelected = !componentVariantExcludedIds.includes(item.id);
                                  const isPreview = activeComponentMakerVariantPreview?.id === item.id;
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      className={`di-plugin-sandbox-option${isSelected ? ' di-plugin-sandbox-option--on' : ''}${isPreview ? ' di-plugin-sandbox-option--preview' : ''}`}
                                      aria-pressed={isSelected}
                                      onClick={() => toggleComponentMakerVariantSuggestion(item.id)}
                                      onMouseEnter={() => setComponentVariantPreviewId(item.id)}
                                      title={item.rules}
                                    >
                                      {item.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="di-plugin-selected-variants">
                          <span className="di-plugin-label">已选</span>
                          <div className="di-plugin-selected-chip-row">
                            {selectedComponentMakerVariantSuggestions.length > 0 ? (
                              selectedComponentMakerVariantSuggestions.map(item => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className="di-plugin-selected-chip"
                                  onClick={() => toggleComponentMakerVariantSuggestion(item.id)}
                                  title="点击移除"
                                >
                                  {item.label}
                                </button>
                              ))
                            ) : (
                              <span className="di-plugin-empty-note">至少选择一个变体</span>
                            )}
                          </div>
                          <div className="di-plugin-variant-tools">
                            <button type="button" onClick={() => setComponentVariantExcludedIds([])}>全选</button>
                            <button
                              type="button"
                              onClick={() => setComponentVariantExcludedIds(componentMakerVariantSuggestions.map(item => item.id))}
                            >
                              清空
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="di-plugin-spec-grid">
                        <label className="di-plugin-spec-field">
                          <span>可改内容</span>
                          <input
                            value={componentSpecDraft.slots}
                            onChange={event => {
                              const { value } = event.currentTarget;
                              syncComponentSpecDraft({ slots: value });
                            }}
                          />
                        </label>
                        <label className="di-plugin-spec-field">
                          <span>状态/变体</span>
                          <input
                            value={componentSpecDraft.variants}
                            onChange={event => {
                              const { value } = event.currentTarget;
                              syncComponentSpecDraft({ variants: value });
                            }}
                          />
                        </label>
                        <label className="di-plugin-spec-field di-plugin-spec-field--wide">
                          <span>规则</span>
                          <textarea
                            value={componentSpecDraft.styleRules}
                            onChange={event => {
                              const { value } = event.currentTarget;
                              syncComponentSpecDraft({ styleRules: value });
                            }}
                          />
                        </label>
                      </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="di-plugin-actions">
                    <button
                      type="button"
                      className="di-plugin-action"
                      onClick={() => {
                        if (isComponentMakerVariantAction) handleRecordComponentVariantDraft();
                        else handleRecordComponentSpecDraft();
                      }}
                    >
                      {isComponentMakerVariantAction ? '记录变体组' : '记录组件规格'}
                    </button>
                    <button
                      type="button"
                      className="di-plugin-action di-plugin-action--secondary"
                      onClick={() => copyPluginPrompt(buildComponentMakerPrompt(componentMakerContext), '组件任务已复制 ✓')}
                    >
                      复制组件任务
                    </button>
                  </div>
                </div>
              </div>
            )}

            {componentMeta && (
              <div className="di-section">
                <div className="di-section-title">组件</div>
                <div className="di-component-card">
                  <div className="di-component-head">
                    <div className="di-component-main">
                      <span className="di-component-name">{componentDisplayName}</span>
                    </div>
                  </div>
                  <div className="di-component-meta-row">
                    {showComponentVariantMeta && (
                      <span>{componentCapability?.variantKind === 'card' ? '展示' : '变体'}：{componentCapability?.variantKind === 'card' ? getCardDisplayLabel(componentMeta.variant) : componentMeta.variant}</span>
                    )}
                    <span>状态：{getComponentStateLabel(componentMeta.state)}</span>
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
                          <span>展示</span>
                          <div className="di-component-segment" role="group" aria-label="卡片展示方式">
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
                      {componentCapability.statusKind === 'badge' && (
                        <div className="di-component-field">
                          <span>状态</span>
                          <div className="di-component-segment di-component-segment--tone" role="group" aria-label="标签状态">
                            {BADGE_STATUS_OPTIONS.map(option => (
                              <button
                                key={option.key}
                                type="button"
                                className={`di-component-segment-btn${activeBadgeStatus === option.key ? ' di-component-segment-btn--on' : ''}`}
                                onClick={() => updateBadgeStatus(option.key)}
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
              <div className="di-section di-layout-section">
                <div className="di-section-title-row di-section-title-row--action">
                  <div className="di-section-title">外部布局</div>
                  {renderSectionReset('layout', '外部布局')}
                </div>
                <div className="di-layout-grid">
                  <div className="di-layout-card di-layout-card--position">
                    <div className="di-layout-card-title">位置</div>
                    <div className="di-position-fields" aria-label="移动组件">
                      {([
                        { key: 'x', label: 'X', value: getDisplayPosition(pendingTranslate ?? translateVal).x },
                        { key: 'y', label: 'Y', value: getDisplayPosition(pendingTranslate ?? translateVal).y },
                      ] as const).map(item => (
                        <div className="di-position-row" key={item.key}>
                          <AxisNumberInput
                            label={item.label}
                            value={formatLengthControlValue(`${Math.round(item.value)}px`)}
                            ariaLabel={`${item.label} 位置`}
                            inputClassName="di-position-value"
                            onChangeValue={next => setTranslateAxis(item.key, next)}
                            onStep={delta => stepTranslateAxis(item.key, delta)}
                          />
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
                      const inputVal = formatLengthControlValue(sizeDraft[item.key] ?? cur);
                      const activeMode = item.pendingMode ?? item.mode;
                      return (
                        <div className="di-size-row" key={item.key}>
                          <div className="di-size-field">
                            <AxisNumberInput
                              label={item.label}
                              value={inputVal}
                              ariaLabel={`${item.label} 自定义尺寸`}
                              inputClassName="di-size-value"
                              onChangeValue={next => {
                                setSizeDraft(prev => ({ ...prev, [item.key]: next }));
                                setSize(item.key, next, 'fixed');
                              }}
                              onFocusValue={() => setSizeDraft(prev => ({ ...prev, [item.key]: cur }))}
                              onBlur={() => setSizeDraft(prev => {
                                const next = { ...prev };
                                delete next[item.key];
                                return next;
                              })}
                              onStep={delta => stepSize(item.key, inputVal, delta)}
                              onEnter={event => event.currentTarget.blur()}
                            />
                            <select
                              className="di-size-mode-select"
                              value={activeMode}
                              aria-label={`${item.label} 尺寸模式`}
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
            {!hideTextStyleSection && (
            <div className="di-section di-text-section">
              <div className="di-section-title-row di-section-title-row--action">
                <div className="di-section-title">文字</div>
                {renderSectionReset('text', '文字')}
              </div>
              <div className="di-text-card">
              {/* 文字样式：组件化预设 + 单项覆盖 */}
              <div className="di-text-field-row di-text-field-row--style">
                <span className="di-text-field-label">样式</span>
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
                const chevron = (
                  <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden="true">
                    <path d="M1 1l3 3 3-3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                );

                return (
                  <>
                    <div className={`di-typography-toolbar${showTypographyCustomControls ? ' di-typography-toolbar--custom' : ''}`}>
                      {!showTypographyCustomControls && (
                        <div className="di-typography-control-wrap">
                          <button
                            className="di-typography-control di-typography-control--style-compact"
                            type="button"
                            title="文字样式"
                            onClick={e => {
                              const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                              setDropPos(calcDropPos(r));
                              setShowFontSizeDrop(false);
                              setShowWeightDrop(false);
                              setExpandedTextColor(false);
                              setShowTypographyStyleDrop(v=>!v);
                            }}
                          >
                            <span className="di-token-name">{curStyle?.label}</span>
                            {chevron}
                          </button>
                        </div>
                      )}

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
                          setFontSizeCustomDraft(curSize === '—' ? '' : formatLengthControlValue(curSize));
                          setShowFontSizeDrop(v=>!v);
                        }}
                      >
                        {curSizeOpt && <span className="di-border-style-label">{curSizeOpt.label}</span>}
                        <span className="di-typography-control-value">{formatFontSizeControlValue(curSize)}</span>
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
                                <span className="di-border-style-name">{formatLengthControlValue(opt.value)}</span>
                              </button>
                            ))}
                            <div className="di-dropdown-custom">
                              <input
                                className="di-dropdown-custom-input"
                                value={fontSizeCustomDraft}
                                placeholder="13"
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
                      <ColorSelectButton
                        className="di-typography-control di-typography-control--color"
                        value={curColor}
                        label={tcLabel}
                        sub={tcSub}
                        isHardcoded={tcHard}
                        title="颜色"
                        onClick={e => {
                          const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                          setDropPos(calcDropPos(r));
                          setShowTypographyStyleDrop(false);
                          setShowFontSizeDrop(false);
                          setShowWeightDrop(false);
                          setExpandedTextColor(v=>!v);
                        }}
                      />
                      {expandedTextColor && (
                        <ColorDropdown value={curColor} pos={dropPos} colorPalette={colorPalette}
                          onChange={c=>{ setTypographyCustomMode(true); setPendingTextColor(c); liveApply('color',c); }}
                          onClose={()=>setExpandedTextColor(false)}
                          onAddToken={v=>handleAddToken(v,'color')}
                        />
                      )}
                    </div>
                    {typographyStyles.length > 0 && (
                      <SourcePickerButton
                        className="di-source-action--field"
                        title="选择文字样式 token"
                        onClick={event => {
                          const r = event.currentTarget.getBoundingClientRect();
                          setDropPos(calcDropPos(r));
                          setShowFontSizeDrop(false);
                          setShowWeightDrop(false);
                          setExpandedTextColor(false);
                          setShowTypographyStyleDrop(v => !v);
                        }}
                      />
                    )}
                      </>
                    ) : null}
                  </div>
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
                                <span className="di-border-style-name">{`${formatLengthControlValue(style.value)} / ${style.fontWeight}`}</span>
                                <span className="di-shadow-drop-value">{style.colorVar || style.color}</span>
                              </span>
                            </button>
                          ))}
                          {showTypographyCustomControls ? (
                            <div className="di-typography-custom-note">
                              <span className="di-border-style-label">自定义模式</span>
                              <span className="di-shadow-drop-value">当前已展开字号 / 字重 / 颜色单项调整</span>
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
                  </>
                );
              })()}
              </div>
              {/* 文字内容 */}
              {textContent !== null && (
                <div className="di-text-field-row">
                  <span className="di-text-field-label">内容</span>
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
                </div>
              )}
              </div>
            </div>
            )}

            {/* 外观区 */}
            {!isTextOnlyTarget && (
            <div className="di-section di-appearance-section">
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
                const backgroundIsEmpty = isTransparentColor(curBackgroundColor);
                const borderColorIsEmpty = isTransparentColor(curBorderColor);
                const hasVisibleBorder = !isZeroLengthValue(curBorderWidth)
                  && curBorderStyleValue !== 'none'
                  && !borderColorIsEmpty;
                const isAppearanceEmpty = backgroundIsEmpty
                  && !hasVisibleBorder
                  && isZeroLengthValue(curBorderRadius);
                const borderSummary = `${formatLengthControlValue(curBorderWidth)} / ${curLineOpt.title} / ${formatLengthControlValue(curBorderRadius)}`;
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

                if (isAppearanceEmpty && !containerCustomMode) {
                  return (
                    <div className="di-section-title-row di-section-title-row--action di-section-title-row--empty">
                      <div className="di-section-title">外观</div>
                      <button
                        type="button"
                        className="di-section-icon-action"
                        onClick={() => setContainerCustomMode(true)}
                        title="添加外观"
                        aria-label="添加外观"
                      >
                        <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    </div>
                  );
                }

                return (
                  <>
                  <div className="di-section-title">外观</div>
                  <div className={`di-container-toolbar di-appearance-toolbar${showContainerCustomControls ? ' di-container-toolbar--custom di-appearance-toolbar--custom' : ''}`}>
                    <div className="di-typography-control-wrap di-appearance-field">
                      {showContainerCustomControls && <span className="di-appearance-field-label">样式</span>}
                      {showContainerCustomControls ? (
                        <CustomSelectButton
                          title="自定义容器样式"
                          onClick={e => {
                            const r=(e.currentTarget as HTMLElement).getBoundingClientRect();
                            setDropPos(calcDropPos(r));
                            setExpandedBorderColor(false);
                            setShowBorderWidthDrop(false);
                            setShowStyleDrop(false);
                            setShowRadiusDrop(false);
                            setShowContainerStyleDrop(v=>!v);
                          }}
                        />
                      ) : (
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
                          <span className="di-token-name">{curContainerPreset?.label}</span>
                          {chevron}
                        </button>
                      )}
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
                                  <span className="di-border-style-name">{`${style.backgroundVar || style.backgroundColor} / ${formatLengthControlValue(style.borderWidth)} ${BORDER_STYLE_OPTIONS.find(o => o.value === style.borderStyle)?.title ?? style.borderStyle} / ${formatLengthControlValue(style.borderRadius)}`}</span>
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
                        <div className="di-typography-control-wrap di-appearance-field">
                          <span className="di-appearance-field-label">背景</span>
                          <ColorSelectButton
                            className="di-typography-control di-typography-control--color"
                            value={backgroundIsEmpty ? 'transparent' : curBackgroundColor}
                            label={backgroundIsEmpty ? '无' : backgroundLabel}
                            sub={backgroundSub}
                            isHardcoded={backgroundHard || backgroundIsEmpty}
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
                          />
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

                        <div className="di-typography-control-wrap di-appearance-field">
                          <span className="di-appearance-field-label">边框</span>
                          <ColorSelectButton
                            className="di-typography-control di-typography-control--color"
                            value={borderColorIsEmpty ? 'transparent' : curBorderColor}
                            label={borderColorIsEmpty ? '无' : borderColorLabel}
                            sub={borderColorSub}
                            isHardcoded={borderColorHard || borderColorIsEmpty}
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
                          />
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

                        <div className="di-typography-control-wrap di-appearance-field">
                          <span className="di-appearance-field-label">粗细</span>
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
                            <span className="di-typography-control-value">{formatLengthControlValue(curBorderWidth)}</span>
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
                                    <span className="di-border-style-name">{formatLengthControlValue(step)}</span>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="di-typography-control-wrap di-appearance-field">
                          <span className="di-appearance-field-label">线条</span>
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

                        <div className="di-typography-control-wrap di-appearance-field">
                          <span className="di-appearance-field-label">圆角</span>
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
                              setCustomRadius(curBorderRadius === '0px' ? '' : formatLengthControlValue(curBorderRadius));
                              setShowRadiusDrop(v=>!v);
                            }}
                          >
                            {curRadiusPreset && <span className="di-border-style-label">{curRadiusPreset.label}</span>}
                            <span className="di-typography-control-value">{formatLengthControlValue(curBorderRadius)}</span>
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
                                    {opt.sub && <span className="di-border-style-name">{formatLengthControlValue(opt.sub)}</span>}
                                  </button>
                                ))}
                                <div className="di-dropdown-custom">
                                  <input
                                    className="di-dropdown-custom-input"
                                    value={customRadius}
                                    placeholder="12"
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
                  </>
                );
              })()}
            </div>
            )}

            {/* 布局区 */}
            {!componentMeta && (
            <div className="di-section di-layout-section">
              <div className="di-section-title-row di-section-title-row--action">
                <div className="di-section-title">布局</div>
                {renderSectionReset('layout', '布局')}
              </div>
              <div className="di-layout-grid">
                <div className="di-layout-card di-layout-card--position">
                  <div className="di-layout-card-title">位置</div>
                  <div className="di-position-fields" aria-label="移动元素">
                    {([
                      { key: 'x', label: 'X', value: getDisplayPosition(pendingTranslate ?? translateVal).x },
                      { key: 'y', label: 'Y', value: getDisplayPosition(pendingTranslate ?? translateVal).y },
                    ] as const).map(item => (
                      <div className="di-position-row" key={item.key}>
                        <AxisNumberInput
                          label={item.label}
                          value={formatLengthControlValue(`${Math.round(item.value)}px`)}
                          ariaLabel={`${item.label} 位置`}
                          inputClassName="di-position-value"
                          onChangeValue={next => setTranslateAxis(item.key, next)}
                          onStep={delta => stepTranslateAxis(item.key, delta)}
                        />
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
                    const inputVal = formatLengthControlValue(sizeDraft[item.key] ?? cur);
                    const activeMode = item.pendingMode ?? item.mode;
                    return (
                      <div className="di-size-row" key={item.key}>
                        <div className="di-size-field">
                          <AxisNumberInput
                            label={item.label}
                            value={inputVal}
                            ariaLabel={`${item.label} 自定义尺寸`}
                            inputClassName="di-size-value"
                            onChangeValue={next => {
                              setSizeDraft(prev => ({ ...prev, [item.key]: next }));
                              setSize(item.key, next, 'fixed');
                            }}
                            onFocusValue={() => setSizeDraft(prev => ({ ...prev, [item.key]: cur }))}
                            onBlur={() => setSizeDraft(prev => {
                              const next = { ...prev };
                              delete next[item.key];
                              return next;
                            })}
                            onStep={delta => stepSize(item.key, inputVal, delta)}
                            onEnter={event => event.currentTarget.blur()}
                          />
                          <select
                            className="di-size-mode-select"
                            value={activeMode}
                            aria-label={`${item.label} 尺寸模式`}
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
                      </div>
                    );
                  })}
                </div>

                {canAlignChildren && (
                <div className="di-layout-card di-layout-card--alignment">
                  <div className="di-layout-card-title">对齐</div>
                  <div className="di-alignment-fields">
                    {([
                      {
                        prop: 'justify-content',
                        label: '水平',
                        value: pendingJustifyContent || justifyVal || 'normal',
                        options: JUSTIFY_OPTIONS,
                      },
                      {
                        prop: 'align-items',
                        label: '垂直',
                        value: pendingAlignItems || alignItemsVal || 'normal',
                        options: ALIGN_ITEMS_OPTIONS,
                      },
                    ] as const).map(item => {
                      const selectValue = item.options.some(option => option.value === item.value) ? item.value : 'normal';
                      return (
                        <label className="di-alignment-field" key={item.prop}>
                          <span className="di-alignment-label">{item.label}</span>
                          <select
                            className="di-alignment-select"
                            value={selectValue}
                            aria-label={`${item.label}对齐`}
                            onChange={event => setAlignment(item.prop, event.currentTarget.value)}
                          >
                            {item.options.map(option => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </div>
                )}
              </div>
            </div>
            )}

            {/* 阴影区 */}
            <div className="di-section di-shadow-section">
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
                  const { label: shadowColorLabel, sub: shadowColorSub, isHardcoded: shadowColorHard } = getDisplayLabel(shadowParts.color, tokenMap, colorPalette, tokenLabels);
                  const shadowControlLabel = isShadowCustom ? '自定义' : activeOption.label;
                  const isShadowEmpty = !isShadowCustom && activeShadow === 'none';
                  const hasShadowSourceOptions = shadowOptions.some(option => Boolean(option.cssVar));
                  const openShadowMenu = (trigger: HTMLElement) => {
                    const r = trigger.getBoundingClientRect();
                    setDropPos(calcDropPos(r));
                    setShowShadowDrop(v => !v);
                  };
                  const addCustomShadow = () => {
                    const value = buildShadowValue(EMPTY_CUSTOM_SHADOW_PARTS);
                    setPendingShadow(value);
                    setShadowCustomMode(true);
                    liveApply('box-shadow', value);
                    setShowShadowDrop(false);
                  };
                  const shadowDrop = showShadowDrop ? (
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
                  ) : null;
                  return (
                    <>
                      {isShadowEmpty ? (
                        <div className="di-section-title-row di-section-title-row--action di-section-title-row--empty">
                          <div className="di-section-title">阴影</div>
                          <button
                            type="button"
                            className="di-section-icon-action"
                            onClick={addCustomShadow}
                            title="添加阴影"
                            aria-label="添加阴影"
                          >
                            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="di-section-title-row di-section-title-row--action">
                            <div className="di-section-title">阴影</div>
                            {renderSectionReset('shadow', '阴影')}
                          </div>
                          <div className={`di-shadow-card${hasSectionChanges('shadow') ? ' di-shadow-card--with-reset' : ''}`}>
                            <div className="di-shadow-field-row">
                              <span className="di-text-field-label">样式</span>
                            {isShadowCustom ? (
                              <div className="di-shadow-custom-toolbar">
                                <ColorSelectButton
                                  className="di-color-select--fill"
                                  value={shadowParts.color}
                                  label={shadowColorLabel}
                                  sub={shadowColorSub}
                                  isHardcoded={shadowColorHard}
                                  title="阴影颜色"
                                  onClick={event => {
                                    const r = (event.currentTarget as HTMLElement).getBoundingClientRect();
                                    setDropPos(calcDropPos(r));
                                    setShowShadowColorDrop(v => !v);
                                  }}
                                />
                                {hasShadowSourceOptions && (
                                  <SourcePickerButton
                                    className="di-source-action--field"
                                    title="选择阴影 token"
                                    onClick={event => openShadowMenu(event.currentTarget)}
                                  />
                                )}
                              </div>
                            ) : (
                              <div className="di-shadow-toolbar">
                                <ColorSelectButton
                                  className="di-color-select--fill di-color-select--shadow"
                                  value="#ffffff"
                                  label={shadowControlLabel}
                                  sub={shadowDisplay.sub}
                                  isHardcoded={!activeOption.cssVar}
                                  title="阴影"
                                  swatchClassName="di-color-select-swatch--shadow"
                                  swatchStyle={{ boxShadow: activeShadow }}
                                  onClick={event => openShadowMenu(event.currentTarget)}
                                />
                              </div>
                            )}
                            </div>
                            {isShadowCustom && (
                              <div className="di-shadow-field-row di-shadow-field-row--params">
                                <span className="di-text-field-label">参数</span>
                                <div className="di-shadow-custom-grid">
                                  {([
                                    { key: 'x', label: 'X', value: shadowParts.x },
                                    { key: 'y', label: 'Y', value: shadowParts.y },
                                    { key: 'blur', label: '模糊', value: shadowParts.blur },
                                    { key: 'spread', label: '扩散', value: shadowParts.spread },
                                  ] as const).map(item => (
                                    <div className="di-shadow-custom-row" key={item.key}>
                                      <AxisNumberInput
                                        label={item.label}
                                        value={formatLengthControlValue(item.value)}
                                        ariaLabel={`阴影${item.label}`}
                                        inputClassName="di-shadow-custom-input"
                                        wideLabel={item.key === 'blur' || item.key === 'spread'}
                                        onChangeValue={next => setCustomShadowPart(item.key, next)}
                                        onStep={delta => stepCustomShadowPart(item.key, delta)}
                                      />
                                    </div>
                                  ))}
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
                          </div>
                        </>
                      )}
                      {shadowDrop}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* 间距区 */}
            <div className="di-section di-space-section">
              <div className="di-section-title-row di-section-title-row--action">
                <div className="di-section-title">间距</div>
                {renderSectionReset('space', '间距')}
              </div>
              <div className="di-space-row">
                <SpaceCard
                  title="内边距" variant="padding"
                  value={activePaddingValue}
                  spaceSteps={spaceSteps}
                  custom={shouldUseCustomSpaceControls('padding', activePaddingValue)}
                  onCustomChange={v => {
                    setSpaceCustomModes(prev => ({ ...prev, padding: v }));
                  }}
                  onChange={v => { setPendingPadding(v); liveApply('padding', v); }}
                />
                <SpaceCard
                  title="外边距" variant="margin"
                  value={activeMarginValue}
                  spaceSteps={spaceSteps}
                  custom={shouldUseCustomSpaceControls('margin', activeMarginValue)}
                  onCustomChange={v => {
                    setSpaceCustomModes(prev => ({ ...prev, margin: v }));
                  }}
                  onChange={v => { setPendingMargin(v); liveApply('margin', v); }}
                />
                {showElementGapControl && (
                  <SpaceCard
                    title="元素间距" variant="gap"
                    value={activeGapValue}
                    spaceSteps={spaceSteps}
                    custom={shouldUseCustomSpaceControls('gap', activeGapValue)}
                    onCustomChange={v => {
                      setSpaceCustomModes(prev => ({ ...prev, gap: v }));
                    }}
                    onChange={v => { setPendingGap(v); liveApply('gap', v); }}
                  />
                )}
              </div>
            </div>
              </>
            )}

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
                                {idx + 1}. {getChangeLabel(change.prop)}：{formatStoredChangeRecordValue(change.prop, change.from)} → {formatStoredChangeRecordValue(change.prop, change.val)}
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
                                {idx + 1}. {getChangeLabel(change.prop)}：{change.from ? `${formatStoredChangeRecordValue(change.prop, change.from)} → ` : ''}{formatStoredChangeRecordValue(change.prop, change.val)}
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

          </div>

          {/* 底部操作 */}
          {(() => {
            const hasPending = localDraftChangeCount > 0 || currentPendingChangeCount > 0 || !!note;
            return (
          <div className={`di-foot${canCreateComponent ? ' di-foot--with-maker' : ' di-foot--without-maker'}`}>
            <div className="di-foot-secondary-actions">
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
                  [pendingJustifyContent ? 'justify-content' : '', pendingJustifyContent],
                  [pendingAlignItems ? 'align-items' : '', pendingAlignItems],
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
              {canCreateComponent && (
                <button
                  className="di-btn-cancel di-btn-maker"
                  onClick={openComponentCreateDrawer}
                  title="把当前普通元素沉淀为新组件规范"
                >
                  创建组件
                </button>
              )}
            </div>
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
                  else if (prop === 'justify-content') setPendingJustifyContent(val);
                  else if (prop === 'align-items')     setPendingAlignItems(val);
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
  const [viewportTick, setViewportTick] = useState(0);
  const modalOpenRef = useRef(false);

  useEffect(() => { setTokenMap(scanTokenMap()); }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && e.altKey && e.code === 'KeyI' && !isTextEntryTarget(e.target)) {
        e.preventDefault();
        setActive(v => {
          if (v) setPanels([]);
          return !v;
        });
      }
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

  useEffect(() => {
    if (!active) return undefined;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setViewportTick(tick => tick + 1));
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [active]);

  const primaryEl = panels[0]?.el;
  const triggerTooltip = active
    ? `退出编辑（${EXIT_SHORTCUT_LABEL}）`
    : `进入编辑（${EDIT_SHORTCUT_LABEL}）`;

  return (
    <>
      <DownloadButton />

      <button
        className={`di-trigger${active ? ' di-trigger--on' : ''}`}
        onClick={() => { setActive(v => !v); if (active) setPanels([]); }}
        title={triggerTooltip}
        aria-label={triggerTooltip}
        data-tooltip={triggerTooltip}
      >
        {active ? '退出' : '编辑'}
      </button>

      {/* 已选中标签 */}
      {active && primaryEl && (() => {
        void viewportTick;
        const rect = primaryEl.getBoundingClientRect();
        const labelText = `已选中 ${getElementDisplayName(primaryEl)}`;
        const labelPos = calcSelectionLabelPos(rect, labelText);
        return (
          <div
            className={`di-label di-label--${labelPos.placement}`}
            style={{ top: labelPos.top, left: labelPos.left }}
          >
            {labelText}
          </div>
        );
      })()}

      {panels.map((p) => (
        <InspectorPanel
          key={p.id}
          targetEl={p.el}
          tokenMap={tokenMap}
          onTokenMapUpdate={updates => setTokenMap(prev => ({ ...prev, ...updates }))}
          onTargetChange={el => setPanels(prev => prev.map(item => item.id === p.id ? { ...item, el } : item))}
          onClose={() => setPanels(prev => prev.filter(x => x.id !== p.id))}
        />
      ))}
    </>
  );
}

// ─── 类型 ────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import inspectorTypography from './tokens/typography.json';

export type PaletteColor = { label: string; val: string; token: string };
export type PaletteGroup = { group: string; colors: PaletteColor[] };

export type DevInspectorComponentPreviewCategory = 'action' | 'display' | 'feedback' | 'container' | 'form' | 'icon' | 'custom';

export type DevInspectorComponentPreviewVariant = {
  id: string;
  label: string;
  group?: string;
  propsLabel?: string;
  selector?: string;
  usage?: string;
  capabilities?: string[];
  tokenRefs?: string[];
  status?: string;
  render: () => ReactNode;
};

export type DevInspectorComponentPreview = {
  type: string;
  label: string;
  category?: DevInspectorComponentPreviewCategory;
  summary?: string;
  selector?: string;
  status?: string;
  variants: DevInspectorComponentPreviewVariant[];
};

export type ShadowToken = {
  cssVar: string;
  value: string;
  label: string;
  usage: string;
};

export type TypographyToken = {
  key: string;
  label: string;
  fontSizeVar: string;
  fontWeightVar: string;
  colorVar: string;
  fontSize: string;
  fontWeight: string;
  color: string;
  usage: string;
};

export type InspectorTypographyLevel = {
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
};

export type InspectorTypographyTokens = {
  title: InspectorTypographyLevel;
  sectionLabel: InspectorTypographyLevel;
  body: InspectorTypographyLevel;
  meta: InspectorTypographyLevel;
  tinyBadge: InspectorTypographyLevel;
};

export type RadiusPreset = {
  label: string;
  sub: string;
  value: string;
  token: string;
};

export type SpaceStep = {
  label: string;
  size: string;
  val: string;
};

export type TypographyStyleOption = {
  key: string;
  label: string;
  value: string;
  fontWeight: string;
  color: string;
  colorVar: string;
  usage: string;
};

export type FontSizeOption = {
  label: string;
  value: string;
  token?: string;
};

export type FontWeightOption = { label: string; value: string };

export type ContainerStyleOption = {
  key: string;
  label: string;
  backgroundColor: string;
  backgroundVar: string;
  borderColor: string;
  colorVar: string;
  borderWidth: string;
  borderStyle: string;
  borderRadius: string;
  radiusVar?: string;
  usage: string;
};

export type BorderStyleOption = ContainerStyleOption;

export type DevInspectorEndpoints = {
  applyCss: string;
  submitStyleIntent: string;
  styleIntents: string;
  deleteStyleIntent: string;
  handoff: string;
  reveal: string;
};

export type DevInspectorTokenConfig = {
  colorPalette: PaletteGroup[];
  tokenLabels: Record<string, string>;
  inspectorTypography: InspectorTypographyTokens;
  radiusPresets: RadiusPreset[];
  spaceSteps: SpaceStep[];
  borderWidthSteps: string[];
  containerStyles?: ContainerStyleOption[];
  borderStyles?: BorderStyleOption[];
  typographyStyles?: TypographyStyleOption[];
  fontSizeOptions?: FontSizeOption[];
  fontWeightOptions: FontWeightOption[];
  shadowTokens: ShadowToken[];
  typographyTokens: TypographyToken[];
};

export type DevInspectorConfig = {
  rootId: string;
  endpoints: DevInspectorEndpoints;
  tokens: DevInspectorTokenConfig;
  componentPreviews: DevInspectorComponentPreview[];
};

export type DevInspectorConfigOverrides = Omit<Partial<DevInspectorConfig>, 'endpoints' | 'tokens'> & {
  endpoints?: Partial<DevInspectorEndpoints>;
  tokens?: Partial<DevInspectorTokenConfig>;
};

// ─── 内置最小默认值（项目侧可通过 Provider 覆盖） ───────────────

const FALLBACK_TYPOGRAPHY_STYLES: TypographyStyleOption[] = [
  {
    key: 'card-title',
    label: '卡片标题',
    value: '14px',
    fontWeight: '700',
    color: '#111827',
    colorVar: '--color-text-strong',
    usage: '卡片、模块、表单区块标题',
  },
  {
    key: 'card-body',
    label: '卡片正文',
    value: '13px',
    fontWeight: '400',
    color: '#374151',
    colorVar: '--color-text-default',
    usage: '卡片描述、正文说明',
  },
  {
    key: 'helper-text',
    label: '辅助文字',
    value: '12px',
    fontWeight: '400',
    color: '#64748b',
    colorVar: '--color-text-muted',
    usage: '提示、说明、次要信息',
  },
];

const FALLBACK_FONT_SIZE_OPTIONS: FontSizeOption[] = [
  { label: 'XS', value: '11px', token: '--font-size-xs' },
  { label: 'S', value: '12px', token: '--font-size-s' },
  { label: 'M', value: '14px', token: '--font-size-m' },
  { label: 'L', value: '16px', token: '--font-size-l' },
  { label: 'XL', value: '20px', token: '--font-size-xl' },
  { label: 'XXL', value: '24px', token: '--font-size-xxl' },
];

const FALLBACK_CONTAINER_STYLES: ContainerStyleOption[] = [
  {
    key: 'plain-surface',
    label: '纯色容器',
    backgroundColor: '#ffffff',
    backgroundVar: '--color-surface',
    borderColor: 'transparent',
    colorVar: 'transparent',
    borderWidth: '0px',
    borderStyle: 'none',
    borderRadius: '0px',
    usage: '无描边普通容器',
  },
  {
    key: 'surface-card',
    label: '容器边框',
    backgroundColor: '#ffffff',
    backgroundVar: '--color-surface',
    borderColor: '#e5e7eb',
    colorVar: '--color-border-default',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '8px',
    usage: '普通卡片、表单容器',
  },
  {
    key: 'focus-card',
    label: '强调边框',
    backgroundColor: '#ffffff',
    backgroundVar: '--color-surface',
    borderColor: '#7c3aed',
    colorVar: '--color-brand-primary',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: '8px',
    usage: '选中态、强调容器',
  },
];

const FALLBACK_SHADOW_TOKENS: ShadowToken[] = [
  {
    cssVar: '--shadow-soft',
    value: '0 14px 42px rgba(15,23,42,0.08)',
    label: '柔和',
    usage: '普通卡片、表单容器',
  },
  {
    cssVar: '--shadow-floating',
    value: '0 22px 56px rgba(15,23,42,0.14)',
    label: '浮起',
    usage: '浮层、Popover、悬浮卡片',
  },
  {
    cssVar: '--shadow-emphasis',
    value: '0 24px 72px rgba(109,93,252,0.18)',
    label: '强调',
    usage: '品牌强调、选中态',
  },
];

const FALLBACK_TOKENS: DevInspectorTokenConfig = {
  colorPalette: [],
  tokenLabels: {},
  inspectorTypography: inspectorTypography as InspectorTypographyTokens,
  radiusPresets: [
    { label: '无',  sub: '',     value: '0px',  token: '' },
    { label: 'S',   sub: '4px',  value: '4px',  token: '' },
    { label: 'M',   sub: '8px',  value: '8px',  token: '' },
    { label: 'L',   sub: '12px', value: '12px', token: '' },
    { label: 'XL',  sub: '16px', value: '16px', token: '' },
    { label: 'XXL', sub: '24px', value: '24px', token: '' },
  ],
  spaceSteps: [
    { label: '无',  size: '',     val: '0px'  },
    { label: 'S',   size: '4px',  val: '4px'  },
    { label: 'M',   size: '8px',  val: '8px'  },
    { label: 'L',   size: '12px', val: '12px' },
    { label: 'XL',  size: '16px', val: '16px' },
    { label: 'XXL', size: '24px', val: '24px' },
  ],
  borderWidthSteps: ['0px', '1px', '2px', '4px'],
  containerStyles: FALLBACK_CONTAINER_STYLES,
  typographyStyles: FALLBACK_TYPOGRAPHY_STYLES,
  fontSizeOptions: FALLBACK_FONT_SIZE_OPTIONS,
  fontWeightOptions: [
    { label: '常', value: '400' },
    { label: '中', value: '500' },
    { label: '粗', value: '600' },
    { label: '黑', value: '700' },
  ],
  shadowTokens: FALLBACK_SHADOW_TOKENS,
  typographyTokens: [],
};

export const defaultDevInspectorConfig: DevInspectorConfig = {
  rootId: 'dev-inspector-root',
  endpoints: {
    applyCss: '/__dev/apply-css',
    submitStyleIntent: '/__dev/submit-style-intent',
    styleIntents: '/__dev/style-intents',
    deleteStyleIntent: '/__dev/style-intents/delete',
    handoff: '/__dev/handoff',
    reveal: '/__dev/reveal',
  },
  tokens: FALLBACK_TOKENS,
  componentPreviews: [],
};

export function mergeDevInspectorConfig(
  overrides?: DevInspectorConfigOverrides,
): DevInspectorConfig {
  return {
    ...defaultDevInspectorConfig,
    ...overrides,
    endpoints: {
      ...defaultDevInspectorConfig.endpoints,
      ...overrides?.endpoints,
    },
    tokens: {
      ...defaultDevInspectorConfig.tokens,
      ...overrides?.tokens,
    },
  };
}

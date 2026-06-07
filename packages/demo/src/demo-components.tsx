import { useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import type { DevInspectorComponentPreview } from '@lijinmei-810/dev-inspector';

type DemoSize = 's' | 'm' | 'l';
type DemoButtonVariant = 'primary' | 'secondary' | 'ghost' | 'text';
type DemoBadgeStatus = 'default' | 'progress' | 'success' | 'warning' | 'danger';
type DemoCardVariant = 'default' | 'compact' | 'floating' | 'emphasis';
type DemoIconTone = 'default' | 'muted' | 'brand' | 'success' | 'warning' | 'danger';

const buttonVariants: { key: DemoButtonVariant; label: string; className: string }[] = [
  { key: 'primary', label: '主按钮', className: 'primary-btn' },
  { key: 'secondary', label: '次按钮', className: 'secondary-button' },
  { key: 'ghost', label: '幽灵', className: 'ghost-button' },
  { key: 'text', label: '文字', className: 'text-button' },
];

const sizes: { key: DemoSize; label: string; buttonStyle: CSSProperties; badgeStyle: CSSProperties; iconSize: number }[] = [
  { key: 's', label: 'S', buttonStyle: { minHeight: 34, padding: '0 16px', fontSize: 13 }, badgeStyle: { minHeight: 20, padding: '0 8px', fontSize: 11 }, iconSize: 16 },
  { key: 'm', label: 'M', buttonStyle: { minHeight: 42, padding: '0 24px', fontSize: 14 }, badgeStyle: { minHeight: 24, padding: '0 12px', fontSize: 12 }, iconSize: 20 },
  { key: 'l', label: 'L', buttonStyle: { minHeight: 48, padding: '0 28px', fontSize: 15 }, badgeStyle: { minHeight: 28, padding: '0 14px', fontSize: 13 }, iconSize: 24 },
];

const badgeStatuses: { key: DemoBadgeStatus; label: string; className: string }[] = [
  { key: 'default', label: '默认', className: '' },
  { key: 'progress', label: '进行中', className: 'status-badge--progress' },
  { key: 'success', label: '成功', className: 'status-badge--done' },
  { key: 'warning', label: '警告', className: 'status-badge--warning' },
  { key: 'danger', label: '危险', className: 'status-badge--danger' },
];

const cardVariants: { key: DemoCardVariant; label: string; className: string }[] = [
  { key: 'default', label: '默认', className: '' },
  { key: 'compact', label: '紧凑', className: 'task-card--compact' },
  { key: 'floating', label: '浮起', className: 'task-card--floating' },
  { key: 'emphasis', label: '强调', className: 'task-card--emphasis' },
];

const iconTones: { key: DemoIconTone; label: string; color: string }[] = [
  { key: 'default', label: '默认', color: 'var(--color-text-default)' },
  { key: 'muted', label: '弱化', color: 'var(--color-text-muted)' },
  { key: 'brand', label: '品牌', color: 'var(--color-brand-primary)' },
  { key: 'success', label: '成功', color: '#10a56f' },
  { key: 'warning', label: '警告', color: '#d97706' },
  { key: 'danger', label: '危险', color: '#dc2626' },
];

const buttonCapabilityItems = ['点击', 'hover', 'focus-visible', '文案', '变体', '尺寸', 'disabled 待接入'];
const badgeCapabilityItems = ['状态', '尺寸', '文案'];
const cardCapabilityItems = ['展示变体', '标题', '说明文', '状态标签'];
const formCapabilityItems = ['输入', '提交', '按钮组'];
const iconCapabilityItems = ['点击', '颜色', '尺寸', 'focus-visible'];

function stopPreviewEvent(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function DemoButton({
  children,
  onPreviewClick,
  size = 'm',
  variant = 'primary',
}: {
  children?: ReactNode;
  onPreviewClick?: () => void;
  size?: DemoSize;
  variant?: DemoButtonVariant;
}) {
  const [pressed, setPressed] = useState(false);
  const variantDef = buttonVariants.find(item => item.key === variant) ?? buttonVariants[0];
  const sizeDef = sizes.find(item => item.key === size) ?? sizes[1];
  return (
    <button
      type="button"
      className={variantDef.className}
      data-component="Button"
      data-variant={variant}
      data-size={size}
      data-preview-state={pressed ? 'clicked' : 'idle'}
      style={sizeDef.buttonStyle}
      onClick={(event) => {
        stopPreviewEvent(event);
        setPressed(value => !value);
        onPreviewClick?.();
      }}
    >
      {pressed ? '已点击' : children ?? variantDef.label}
    </button>
  );
}

export function DemoBadge({
  size = 'm',
  status = 'default',
}: {
  size?: DemoSize;
  status?: DemoBadgeStatus;
}) {
  const statusDef = badgeStatuses.find(item => item.key === status) ?? badgeStatuses[0];
  const sizeDef = sizes.find(item => item.key === size) ?? sizes[1];
  return (
    <span
      className={`status-badge${statusDef.className ? ` ${statusDef.className}` : ''}`}
      data-component="Badge"
      data-status={status}
      data-size={size}
      style={sizeDef.badgeStyle}
    >
      {statusDef.label}
    </span>
  );
}

export function DemoTaskCard({
  selected = false,
  status = 'progress',
  title = '任务标题',
  variant = 'default',
}: {
  selected?: boolean;
  status?: DemoBadgeStatus;
  title?: string;
  variant?: DemoCardVariant;
}) {
  const [active, setActive] = useState(selected);
  const variantDef = cardVariants.find(item => item.key === variant) ?? cardVariants[0];
  return (
    <article
      className={`task-card${variantDef.className ? ` ${variantDef.className}` : ''}${active ? ' is-selected' : ''}`}
      data-component="Card"
      data-variant={variant}
      onClick={(event) => {
        stopPreviewEvent(event);
        setActive(value => !value);
      }}
    >
      <DemoBadge status={status} />
      <h2 className="task-title">{title}</h2>
      <p className="card-desc">这是一段示例描述文字，用于展示卡片布局效果。</p>
    </article>
  );
}

export function DemoIcon({
  size = 'm',
  tone = 'default',
}: {
  size?: DemoSize;
  tone?: DemoIconTone;
}) {
  const [active, setActive] = useState(false);
  const sizeDef = sizes.find(item => item.key === size) ?? sizes[1];
  const toneDef = iconTones.find(item => item.key === tone) ?? iconTones[0];
  return (
    <button
      type="button"
      className={`demo-icon-button${active ? ' is-active' : ''}`}
      data-component="Icon"
      data-tone={tone}
      data-size={size}
      style={{ color: toneDef.color }}
      onClick={(event) => {
        stopPreviewEvent(event);
        setActive(value => !value);
      }}
      aria-label={`${toneDef.label}图标`}
    >
      <svg width={sizeDef.iconSize} height={sizeDef.iconSize} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9 5.5-.8L12 3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

export function DemoForm() {
  const [submitted, setSubmitted] = useState(false);
  return (
    <form
      className="demo-form demo-form--preview"
      data-component="Form"
      data-variant="default"
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(true);
      }}
      onClick={event => event.stopPropagation()}
    >
      <input className="demo-input" placeholder="请输入任务名称" />
      <textarea className="demo-textarea" placeholder="填写补充说明" />
      <div className="demo-form-actions">
        <DemoButton variant="ghost">取消</DemoButton>
        <DemoButton variant="primary" onPreviewClick={() => setSubmitted(true)}>{submitted ? '已提交' : '提交'}</DemoButton>
      </div>
    </form>
  );
}

export const demoComponentPreviews: DevInspectorComponentPreview[] = [
  {
    type: 'Button',
    label: '按钮',
    category: 'action',
    summary: '真实 DemoButton：文案 / 变体 / 尺寸',
    selector: '.primary-btn, .secondary-button, .ghost-button, .text-button',
    status: '真实组件',
    variants: sizes.flatMap(size => buttonVariants.map(variant => ({
      id: `button:${size.key}:${variant.key}`,
      label: variant.label,
      group: `${size.label} 尺寸`,
      propsLabel: `variant=${variant.key} / size=${size.key}`,
      selector: `[data-component="Button"][data-variant="${variant.key}"][data-size="${size.key}"]`,
      usage: variant.key === 'primary'
        ? '主行动、关键提交、确认操作'
        : variant.key === 'secondary'
          ? '次级操作、辅助确认、备用入口'
          : variant.key === 'ghost'
            ? '低强调操作、工具区动作、弱边界按钮'
            : '轻量文本操作、链接式动作、局部补充入口',
      capabilities: buttonCapabilityItems,
      tokenRefs: [
        variant.key === 'primary' || variant.key === 'text' ? '--color-brand-primary' : '--color-border-default',
        size.key === 's' ? '--font-size-s' : size.key === 'l' ? '--font-size-l' : '--font-size-m',
        '--radius-control',
      ],
      status: '真实规格',
      render: () => <DemoButton variant={variant.key} size={size.key} />,
    }))),
  },
  {
    type: 'Badge',
    label: '标签',
    category: 'feedback',
    summary: '真实 DemoBadge：状态 / 尺寸',
    selector: '.status-badge',
    status: '真实组件',
    variants: sizes.flatMap(size => badgeStatuses.map(status => ({
      id: `badge:${size.key}:${status.key}`,
      label: status.label,
      group: `${size.label} 尺寸`,
      propsLabel: `status=${status.key} / size=${size.key}`,
      selector: `[data-component="Badge"][data-status="${status.key}"][data-size="${size.key}"]`,
      usage: '状态提示、分类标记和结果反馈',
      capabilities: badgeCapabilityItems,
      tokenRefs: [
        '--radius-pill',
        size.key === 's' ? '--font-size-xs' : '--font-size-s',
      ],
      status: '真实规格',
      render: () => <DemoBadge status={status.key} size={size.key} />,
    }))),
  },
  {
    type: 'Card',
    label: '卡片',
    category: 'display',
    summary: '真实 DemoTaskCard：展示变体 / 子组件',
    selector: '.task-card',
    status: '真实组件',
    variants: cardVariants.map(variant => ({
      id: `card:${variant.key}`,
      label: variant.label,
      group: '展示变体',
      propsLabel: `variant=${variant.key}`,
      selector: `[data-component="Card"][data-variant="${variant.key}"]`,
      usage: '信息分组、任务展示和内容承载',
      capabilities: cardCapabilityItems,
      tokenRefs: ['--color-surface', '--color-border-default', '--shadow-card'],
      status: '真实规格',
      render: () => <DemoTaskCard variant={variant.key} title={`${variant.label}任务`} status={variant.key === 'emphasis' ? 'success' : 'progress'} />,
    })),
  },
  {
    type: 'Form',
    label: '表单',
    category: 'form',
    summary: '真实 DemoForm：输入 / 说明 / 操作按钮',
    selector: '.demo-form',
    status: '真实组件',
    variants: [
      {
        id: 'form:default',
        label: '默认表单',
        group: '默认',
        propsLabel: 'interactive=true',
        selector: '[data-component="Form"][data-variant="default"]',
        usage: '信息录入、编辑和提交',
        capabilities: formCapabilityItems,
        tokenRefs: ['--color-surface', '--color-border-default', '--radius-control'],
        status: '真实规格',
        render: () => <DemoForm />,
      },
    ],
  },
  {
    type: 'Icon',
    label: '图标',
    category: 'icon',
    summary: '真实 DemoIcon：颜色 / 尺寸',
    selector: '.demo-icon-button',
    status: '真实组件',
    variants: sizes.flatMap(size => iconTones.map(tone => ({
      id: `icon:${size.key}:${tone.key}`,
      label: tone.label,
      group: `${size.label} 尺寸`,
      propsLabel: `tone=${tone.key} / size=${size.key}`,
      selector: `[data-component="Icon"][data-tone="${tone.key}"][data-size="${size.key}"]`,
      usage: '图形化操作入口或状态表达',
      capabilities: iconCapabilityItems,
      tokenRefs: [
        tone.key === 'brand' ? '--color-brand-primary' : '--color-icon-default',
        size.key === 's' ? '--icon-size-s' : size.key === 'l' ? '--icon-size-l' : '--icon-size-m',
      ],
      status: '真实规格',
      render: () => <DemoIcon tone={tone.key} size={size.key} />,
    }))),
  },
];

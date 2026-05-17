import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { mountDevInspector } from '@lijinmei-810/dev-inspector';
import '@lijinmei-810/dev-inspector/style.css';
import './demo.css';

function DemoApp() {
  useEffect(() => {
    mountDevInspector({
      tokens: {
        colorPalette: [
          {
            group: 'color',
            colors: [
              { label: 'surface', val: '#ffffff', token: '--color-surface' },
            ],
          },
          {
            group: 'text',
            colors: [
              { label: 'strong', val: '#0f172a', token: '--color-text-strong' },
              { label: 'default', val: '#334155', token: '--color-text-default' },
              { label: 'muted', val: '#64748b', token: '--color-text-muted' },
            ],
          },
          {
            group: 'brand',
            colors: [
              { label: 'primary', val: '#6d5dfc', token: '--color-brand-primary' },
              { label: 'soft', val: '#ede9fe', token: '--color-brand-soft' },
              { label: 'success', val: '#b7f7d2', token: '--color-success-soft' },
            ],
          },
          {
            group: 'border',
            colors: [
              { label: 'default', val: '#eef2f7', token: '--color-border-default' },
              { label: 'control', val: '#dbe3ef', token: '--color-border-control' },
              { label: 'focus', val: '#6d5dfc', token: '--color-brand-primary' },
            ],
          },
        ],
        tokenLabels: {
          '--color-text-strong': 'color-text-strong',
          '--color-text-default': 'color-text-default',
          '--color-text-muted': 'color-text-muted',
          '--color-brand-primary': 'color-brand-primary',
          '--color-brand-soft': 'color-brand-soft',
          '--color-success-soft': 'color-success-soft',
          '--color-surface': 'color-surface',
          '--color-border-default': 'color-border-default',
          '--color-border-control': 'color-border-control',
        },
        containerStyles: [
          {
            key: 'card-container',
            label: '卡片容器',
            backgroundColor: '#ffffff',
            backgroundVar: '--color-surface',
            borderColor: '#eef2f7',
            colorVar: '--color-border-default',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '8px',
            usage: '任务卡片、表单容器',
          },
          {
            key: 'control-container',
            label: '控件容器',
            backgroundColor: '#ffffff',
            backgroundVar: '--color-surface',
            borderColor: '#dbe3ef',
            colorVar: '--color-border-control',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderRadius: '8px',
            usage: '输入框、次级按钮',
          },
          {
            key: 'primary-action',
            label: '主操作容器',
            backgroundColor: '#6d5dfc',
            backgroundVar: '--color-brand-primary',
            borderColor: 'transparent',
            colorVar: 'transparent',
            borderWidth: '0px',
            borderStyle: 'none',
            borderRadius: '8px',
            usage: '主按钮、文字按钮',
          },
        ],
        typographyStyles: [
          {
            key: 'task-title',
            label: '任务标题',
            value: '17px',
            fontWeight: '700',
            color: '#0f172a',
            colorVar: '--color-text-strong',
            usage: '任务卡片标题',
          },
          {
            key: 'card-title',
            label: '卡片标题',
            value: '15px',
            fontWeight: '600',
            color: '#0f172a',
            colorVar: '--color-text-strong',
            usage: '卡片、模块标题',
          },
          {
            key: 'card-desc',
            label: '卡片正文',
            value: '13px',
            fontWeight: '400',
            color: '#64748b',
            colorVar: '--color-text-muted',
            usage: '卡片描述、正文说明',
          },
          {
            key: 'button-text',
            label: '按钮文字',
            value: '14px',
            fontWeight: '600',
            color: '#ffffff',
            colorVar: '--color-white',
            usage: '主操作按钮文字',
          },
        ],
        shadowTokens: [
          {
            cssVar: '--shadow-card',
            value: '0 14px 42px rgba(15, 23, 42, 0.08)',
            label: '柔和',
            usage: '任务卡片、表单容器',
          },
          {
            cssVar: '--shadow-floating',
            value: '0 26px 58px rgba(15, 23, 42, 0.15)',
            label: '浮起',
            usage: '浮层、悬浮卡片',
          },
          {
            cssVar: '--shadow-emphasis',
            value: '0 18px 48px rgba(109, 93, 252, 0.16)',
            label: '强调',
            usage: '选中态、品牌强调',
          },
        ],
      },
    });
  }, []);

  return (
    <main className="demo-shell">
      <section className="demo-hero">
        <div>
          <p className="demo-eyebrow">Local demo</p>
          <h1>Dev Inspector</h1>
          <p className="demo-subtitle">点击右下角「编辑」，再点任意元素查看样式。</p>
        </div>
        <button className="primary-btn">主按钮</button>
      </section>

      <section className="demo-actions">
        <button className="text-button">文字按钮</button>
        <button className="ghost-button">次按钮</button>
      </section>

      <section className="task-grid">
        <article className="task-card is-selected">
          <span className="status-badge status-badge--progress">进行中</span>
          <h2 className="task-title">任务标题 1</h2>
          <p className="card-desc">这是一段示例描述文字，用于展示卡片布局效果。</p>
        </article>
        <article className="task-card">
          <span className="status-badge">待处理</span>
          <h2 className="task-title">任务标题 2</h2>
          <p className="card-desc">这是一段示例描述文字，用于展示卡片布局效果。</p>
        </article>
        <article className="task-card">
          <span className="status-badge status-badge--done">已完成</span>
          <h2 className="task-title">任务标题 3</h2>
          <p className="card-desc">这是一段示例描述文字，用于展示卡片布局效果。</p>
        </article>
      </section>

      <form className="demo-form">
        <input className="demo-input" placeholder="请输入任务名称" />
        <textarea className="demo-textarea" placeholder="填写补充说明" />
        <div className="demo-form-actions">
          <button className="ghost-button" type="button">取消</button>
          <button className="primary-btn" type="button">提交</button>
        </div>
      </form>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);

import { useAppStore } from '../stores/useAppStore';

export default function Welcome() {
  const start = useAppStore((s) => s.start);
  const runMode = useAppStore((s) => s.runMode);

  return (
    <div className="welcome">
      <div className="welcome__glow welcome__glow--a" />
      <div className="welcome__glow welcome__glow--b" />
      <div className="welcome__inner">
        <div className="welcome__logo">J</div>
        <h1 className="welcome__title">JobPilot</h1>
        <p className="welcome__subtitle">你的 AI 求职助手</p>
        <button className="welcome__cta" onClick={() => void start()}>
          点击开始
        </button>
        <div className="welcome__foot">
          {runMode === 'TEST' ? '测试模式 · 仅本地模拟数据' : 'JobPilot v0.1'}
        </div>
      </div>
    </div>
  );
}

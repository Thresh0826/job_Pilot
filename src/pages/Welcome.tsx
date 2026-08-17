import { useAppStore } from '../stores/useAppStore';

export default function Welcome() {
  const start = useAppStore((s) => s.start);
  const runMode = useAppStore((s) => s.runMode);

  return (
    <div className="welcome">
      <div className="welcome__glow welcome__glow--a" />
      <div className="welcome__glow welcome__glow--b" />

      <div className="welcome__inner">
        <div className="welcome__brand">
          <h1 className="welcome__title">JobPilot</h1>
          <span className="welcome__signal" aria-hidden />
        </div>
        <p className="welcome__subtitle">你的 AI 求职助手</p>
        <button className="welcome__cta" onClick={() => void start()}>
          点击开始
        </button>
      </div>

      <div className="welcome__foot">
        Local · Private · Intelligent{runMode === 'TEST' ? ' · 测试模式' : ''}
      </div>
    </div>
  );
}

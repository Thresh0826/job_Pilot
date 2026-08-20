import { useEffect, useState } from 'react';
import { Button, Input, useToast } from '../ui';

/** V0.4-D AI 模型配置（DeepSeek API；Key 仅存本机，不入 Git）。 */
export function AiModelConfigForm() {
  const toast = useToast();
  const [provider, setProvider] = useState('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('deepseek-chat');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void window.api
      .getAiModelConfig()
      .then((cfg) => {
        setProvider(cfg.provider || 'deepseek');
        setApiKey(cfg.apiKey);
        setModel(cfg.model || 'deepseek-chat');
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await window.api.saveAiModelConfig({ provider, apiKey: apiKey.trim(), model: model.trim() });
      toast('模型配置已保存');
    } catch (err) {
      toast(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="field">
        <span className="field__label">模型服务商</span>
        <Input value="DeepSeek" disabled />
        <span className="hint">当前仅支持 DeepSeek（OpenAI 兼容接口）。</span>
      </div>

      <div className="field">
        <span className="field__label">模型</span>
        <Input
          value={model}
          placeholder="deepseek-chat"
          onChange={(e) => setModel(e.target.value)}
        />
        <span className="hint">deepseek-chat（非思考）为默认；也可填 deepseek-reasoner。</span>
      </div>

      <div className="field">
        <span className="field__label">API Key</span>
        <Input
          type="password"
          value={apiKey}
          placeholder="sk-..."
          onChange={(e) => setApiKey(e.target.value)}
        />
        <span className="hint">
          仅保存在本机数据目录，不会上传到 JobPilot 之外；请勿提交到 Git。
        </span>
      </div>

      <div
        className="ai-recommendation"
        style={{ background: 'var(--jp-attention-soft)', border: '1px solid rgb(217 148 50 / 25%)' }}
      >
        <div className="small secondary">
          配置后，岗位决策的语义判断（方向 / 技能 / 风险 / 理由）将由 DeepSeek 完成；
          你的简历资料与岗位 JD 会发送给 DeepSeek 服务商。
          你的明确求职规则（城市 / 薪资 / 外包 / 单休 / 排除词等）仍由本地强制优先。
          未配置 Key 时自动回退本地规则引擎。
        </div>
      </div>

      <div className="settings__save">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? '保存中…' : '保存配置'}
        </Button>
      </div>
    </div>
  );
}

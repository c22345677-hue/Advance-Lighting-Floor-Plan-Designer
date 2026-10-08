import { useMemo, useState } from 'react';
import {
  listTemplates,
  repeatItemLabel,
  resolveOptions,
  type ScalarOption,
  type ScalarValue,
  type ScalarValues,
  type TemplateDefinition,
  type TemplateValues,
} from '../templates';

interface Props {
  onAdd: (template: TemplateDefinition, values: TemplateValues) => void;
}

export function TemplatePanel({ onAdd }: Props) {
  const templates = listTemplates();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [input, setInput] = useState<Record<string, Partial<TemplateValues>>>({});
  const template = templates.find((t) => t.id === templateId);
  const values = useMemo(
    () => (template ? resolveOptions(template.options, input[template.id]) : {}),
    [template, input],
  );

  if (!template) return null;

  const set = (key: string, v: ScalarValue | ScalarValues[]) =>
    setInput((all) => ({ ...all, [template.id]: { ...values, [key]: v } }));

  return (
    <div className="panel-body">
      <div className="template-list" role="tablist" aria-label="Templates">
        {templates.map((t) => (
          <button
            key={t.id}
            id={`tpl-${t.id}`}
            role="tab"
            aria-selected={t.id === template.id}
            className="template-tab"
            onClick={() => setTemplateId(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>

      <p className="template-desc">{template.description}</p>
      {template.placeholder && (
        <p className="draft-note">
          <span className="chip">Draft layout</span> Positions are placeholders until this template is defined.
        </p>
      )}

      <div className="options">
        {template.options.map((o) => {
          if (o.type !== 'repeat') {
            return (
              <OptionField
                key={o.key}
                id={`${template.id}-${o.key}`}
                option={o}
                value={values[o.key] as ScalarValue}
                onChange={(v) => set(o.key, v)}
              />
            );
          }
          const group = (values[o.key] as ScalarValues[]) ?? [];
          return (
            <fieldset key={o.key} className="repeat">
              <legend>{o.label}</legend>
              {group.map((g, i) => (
                <div key={i} className="repeat-item">
                  <div className="repeat-label">{repeatItemLabel(o.itemLabel, i)}</div>
                  {o.options.map((io) => (
                    <OptionField
                      key={io.key}
                      id={`${template.id}-${o.key}-${i}-${io.key}`}
                      option={io}
                      value={g[io.key] as ScalarValue}
                      compact
                      onChange={(v) => set(o.key, group.map((x, j) => (j === i ? { ...x, [io.key]: v } : x)))}
                    />
                  ))}
                </div>
              ))}
            </fieldset>
          );
        })}
      </div>

      <button id="add-template" className="primary" onClick={() => onAdd(template, values)}>
        Add {template.name.toLowerCase()} to plan
      </button>
    </div>
  );
}

function OptionField({
  id,
  option,
  value,
  onChange,
  compact,
}: {
  id: string;
  option: ScalarOption;
  value: ScalarValue;
  onChange: (v: ScalarValue) => void;
  compact?: boolean;
}) {
  const label = compact ? null : (
    <span className="field-label" id={`${id}-label`}>
      {option.label}
    </span>
  );
  switch (option.type) {
    case 'number': {
      const n = value as number;
      const step = option.step ?? 1;
      return (
        <div className="field">
          {label}
          <div className="stepper" role="group" aria-labelledby={`${id}-label`}>
            <button id={`${id}-dec`} aria-label={`Fewer ${option.label}`} disabled={n <= option.min} onClick={() => onChange(n - step)}>
              −
            </button>
            <output id={id}>
              {n}
              {option.unit ? ` ${option.unit}` : ''}
            </output>
            <button id={`${id}-inc`} aria-label={`More ${option.label}`} disabled={n >= option.max} onClick={() => onChange(n + step)}>
              +
            </button>
          </div>
        </div>
      );
    }
    case 'select':
      return (
        <div className="field">
          {label}
          <div className="segmented" role="radiogroup" aria-label={option.label}>
            {option.choices.map((c) => (
              <button
                key={c.value}
                id={`${id}-${c.value}`}
                role="radio"
                aria-checked={value === c.value}
                onClick={() => onChange(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      );
    case 'boolean':
      return (
        <label className="field toggle" htmlFor={id}>
          {label}
          <input id={id} type="checkbox" checked={value as boolean} onChange={(e) => onChange(e.target.checked)} />
        </label>
      );
  }
}

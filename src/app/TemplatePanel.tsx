import { useMemo, useState } from 'react';
import type { ProjectKind } from '../model/project';
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
  kind: ProjectKind;
  onKind: (kind: ProjectKind) => void;
  onAdd: (template: TemplateDefinition, values: TemplateValues) => void;
  /** Where the template goes, for the button text. */
  sceneName: string;
}

const KINDS: { id: ProjectKind; label: string; hint: string }[] = [
  { id: 'narrative', label: 'Narrative', hint: 'People are actors.' },
  { id: 'doc', label: 'Doc', hint: 'People are interviewees and interviewers.' },
];

export function TemplatePanel({ kind, onKind, onAdd, sceneName }: Props) {
  const templates = listTemplates().filter((t) => t.kinds.includes(kind));
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [input, setInput] = useState<Record<string, Partial<TemplateValues>>>({});
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const values = useMemo(
    () => (template ? resolveOptions(template.options, input[template.id]) : {}),
    [template, input],
  );

  const kindPicker = (
    <section className="section">
      <h3 className="section-title">1 · Production type</h3>
      <div className="segmented wide" role="radiogroup" aria-label="Production type">
        {KINDS.map((k) => (
          <button key={k.id} id={`kind-${k.id}`} role="radio" aria-checked={kind === k.id} onClick={() => onKind(k.id)}>
            {k.label}
          </button>
        ))}
      </div>
      <p className="hint-text">{KINDS.find((k) => k.id === kind)!.hint}</p>
    </section>
  );

  if (!template) return <div className="stack-lg">{kindPicker}</div>;

  const set = (key: string, v: ScalarValue | ScalarValues[]) =>
    setInput((all) => ({ ...all, [template.id]: { ...values, [key]: v } }));

  return (
    <div className="stack-lg">
      {kindPicker}
      <section className="section">
      <h3 className="section-title">2 · Template</h3>
      <div className="chip-tabs" role="tablist" aria-label="Templates">
        {templates.map((t) => (
          <button
            key={t.id}
            id={`tpl-${t.id}`}
            role="tab"
            aria-selected={t.id === template.id}
            onClick={() => setTemplateId(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>

      <p className="hint-text">{template.description}</p>
      {template.placeholder && (
        <p className="hint-text">
          <span className="chip">Draft layout</span> Positions are placeholders until this template is defined.
        </p>
      )}

      </section>

      <section className="section">
      <h3 className="section-title">3 · Options</h3>
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
      </section>

      <button id="add-template" className="btn primary big" onClick={() => onAdd(template, values)}>
        Add {template.name.toLowerCase()} to {sceneName}
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

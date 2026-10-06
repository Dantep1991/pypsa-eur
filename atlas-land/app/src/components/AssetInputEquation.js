import React, { useRef } from 'react';
import { inputPropertyToken } from '../modelWorkspace/inputEquation';

export default function AssetInputEquation({ property, expression, onChange }) {
  const inputRef = useRef(null);
  const insert = text => {
    const field = inputRef.current, start = field?.selectionStart ?? expression.length, end = field?.selectionEnd ?? start;
    onChange(expression.slice(0, start) + text + expression.slice(end));
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + text.length, start + text.length); });
  };
  const percent = () => {
    const field = inputRef.current, selected = expression.slice(field?.selectionStart, field?.selectionEnd);
    if (selected) onChange(expression.slice(0, field.selectionStart) + `percent(${selected})` + expression.slice(field.selectionEnd));
    else onChange(`percent(${expression || inputPropertyToken(property)})`);
  };
  return <div className="model-assets-equation">
    <label>Equation<textarea ref={inputRef} value={expression} rows={3} spellCheck={false}
      placeholder={property ? `${inputPropertyToken(property)} * 1.1` : 'Choose an input property'}
      onChange={event => onChange(event.target.value)} /></label>
    <div className="model-assets-operators" aria-label="Equation operators">
      <button type="button" disabled={!property} onClick={() => insert(inputPropertyToken(property))}>Insert property</button>
      {[['+', 'Add'], ['-', 'Subtract'], ['*', 'Multiply'], ['/', 'Divide'], ['(', 'Open bracket'], [')', 'Close bracket']].map(([symbol, title]) =>
        <button type="button" key={symbol} aria-label={title} title={title} onClick={() => insert(symbol)}>{symbol === '*' ? '×' : symbol === '/' ? '÷' : symbol}</button>)}
      <button type="button" disabled={!property && !expression} onClick={percent}>Percent of total</button>
    </div>
  </div>;
}

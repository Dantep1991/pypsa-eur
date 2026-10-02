import React from 'react';

export default function LolaNearCapacityToggle({checked=false,disabled=false,onChange,title}) {
  return <label title={title}><input aria-label="Near capacity" type="checkbox" checked={checked}
    disabled={disabled} onChange={event=>onChange?.(event.target.checked)}/>Near capacity</label>;
}

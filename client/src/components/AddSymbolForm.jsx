import { useState } from 'react';

export function AddSymbolForm({ onAdd }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const symbol = value.trim().toUpperCase();
    if (!symbol) return;
    setBusy(true);
    try {
      await onAdd(symbol);
      setValue('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={handleSubmit}>
      <input
        className="text-input"
        placeholder="Add symbol (e.g. NFLX)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={8}
      />
      <button className="btn btn-primary" type="submit" disabled={busy || !value.trim()}>
        Add
      </button>
    </form>
  );
}

/* Clean schema compatibility: clients has no remaining_budget column. */
(() => {
  const originalFrom = window.supabaseClient.from.bind(window.supabaseClient);
  window.supabaseClient.from = (table) => {
    const builder = originalFrom(table);
    if (table !== 'clients') return builder;
    const originalInsert = builder.insert.bind(builder);
    const originalUpdate = builder.update.bind(builder);
    builder.insert = (values, options) => {
      const clean = Array.isArray(values)
        ? values.map(row => { const copy = {...row}; delete copy.remaining_budget; return copy; })
        : (() => { const copy = {...values}; delete copy.remaining_budget; return copy; })();
      return originalInsert(clean, options);
    };
    builder.update = (values, options) => {
      const copy = {...values};
      delete copy.remaining_budget;
      return originalUpdate(copy, options);
    };
    return builder;
  };
})();
export function createPlaceholderActionSlot() {
  let current = null;

  function set(action, { dismiss = false } = {}) {
    current = typeof action === 'function' ? { action, dismiss: Boolean(dismiss) } : null;
  }

  function clear() {
    current = null;
  }

  function activate(...args) {
    if (!current) return { handled: false, dismiss: false, result: undefined };
    return {
      handled: true,
      dismiss: current.dismiss,
      result: current.action(...args),
    };
  }

  return { set, clear, activate };
}

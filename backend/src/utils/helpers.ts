export const today = () => new Date().toISOString().slice(0, 10);

export const code = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

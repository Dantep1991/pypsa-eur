// The Nohm chart series from src/user_interfaces/Nohm/src/design/chartColors.js.
// Plotting needs concrete colours; controls/surfaces still use live theme tokens.
export const RESULT_SERIES_COLORS = ['#1C7293', '#0A2540', '#F2A65A', '#6CB4D0', '#3D5A80', '#F5C08D', '#9AD1E6', '#64748B', '#BCDBE6', '#94A3B8'];

export const COMPARISON_COLORS = { favourable: '#22c55e', unfavourable: '#ef4444', neutral: '#a3a3a3' };
// Blue is independent of red/green desirability; light maps use darker Nohm teal.
export const flowReversalColor = theme => theme === 'dark' ? '#6CB4D0' : '#1C7293';

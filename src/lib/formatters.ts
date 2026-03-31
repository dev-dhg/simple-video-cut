export const formatTimeCode = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
};

export const parseTimeCode = (tc: string): number => {
  const parts = tc.split(':');
  let seconds = 0;
  if (parts.length === 3) {
    seconds += parseInt(parts[0] || '0', 10) * 3600;
    seconds += parseInt(parts[1] || '0', 10) * 60;
    seconds += parseFloat(parts[2] || '0');
  } else if (parts.length === 2) {
    seconds += parseInt(parts[0] || '0', 10) * 60;
    seconds += parseFloat(parts[1] || '0');
  } else if (parts.length === 1) {
    seconds += parseFloat(parts[0] || '0');
  }
  return isNaN(seconds) ? 0 : seconds;
};

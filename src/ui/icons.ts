/** 统一的海洋主题图形；鱼类与进化插图另以真实鱼体/专用图画呈现。 */
const paths: Record<string, string> = {
  wave: '<path d="M3 14c4-9 8 7 12-2s7-1 8-3M3 20c4-8 8 6 12-2s7-1 8-3M5 7c3-4 6 3 9 0"/>',
  fin: '<path d="M3 19C7 5 15 3 22 5c-2 10-8 16-19 14Z"/><path d="m4 19 13-9M10 15l-1-5m5 2 5 1"/>',
  bolt: '<path d="m15 2-11 13h8l-2 9 12-14h-8l1-8Z"/>',
  shield: '<path d="m12 2 9 4v7c0 5-9 10-9 10S3 18 3 13V6l9-4Z"/><path d="m8 12 3 3 6-7"/>',
  ink: '<path d="M7 13C1 7 5 2 10 4c5-5 12 0 9 5 6 5 1 12-4 10-6 6-14-1-8-6Z"/><circle cx="20" cy="22" r="1"/>',
  heart: '<path d="M12 21 3 12C-3 4 8-1 12 6c5-7 15-1 9 6l-9 9Z"/>',
  star: '<path d="m12 2 3 7 8 3-8 3-3 8-3-8-8-3 8-3 3-7Z"/>',
  leaf: '<path d="M4 21C-1 4 12 1 22 3c0 14-6 21-18 18Z"/><path d="M4 21 17 8m-8 8-1-6m5 2h5"/>',
  eye: '<path d="M1 13S5 5 12 5s11 8 11 8-4 7-11 7S1 13 1 13Z"/><circle cx="12" cy="12.5" r="3"/>',
  reach:
    '<path d="M2 12h7m-4-4 4 4-4 4m17-4h-7m4-4-4 4 4 4"/><path d="M11 4c7-4 12 0 12 0M1 22s5 3 12-1"/>',
  fang: '<path d="M3 6c7 4 13 4 19 0l-4 15-5-10-5 10L3 6Z"/>',
  school:
    '<path d="M4 8c6-7 12-3 15 0-3 4-9 7-15 0Zm0 0L1 5v6l3-3Zm5 10c6-6 11-3 14 0-4 5-10 5-14 0Zm0 0-4-3v6l4-3Z"/>',
  pulse:
    '<circle cx="12" cy="12" r="3"/><path d="M7 5a8 8 0 0 0 0 14m10 0a8 8 0 0 0 0-14M3 1a14 14 0 0 0 0 22m18 0a14 14 0 0 0 0-22"/>',
  pause: '<path d="M8 5v16M17 5v16"/>',
  play: '<path d="m7 4 15 9-15 9V4Z"/>',
  arrow: '<path d="M3 13h19m-7-7 7 7-7 7"/>',
  close: '<path d="m6 6 14 14M20 6 6 20"/>',
  book: '<path d="M12 6C7 2 2 4 2 4v17s5-2 10 2c5-4 10-2 10-2V4s-5-2-10 2Zm0 0v17"/>',
  gear: '<path d="m10 2 4 0 1 4 4-1 3 4-3 3 3 3-3 4-4-1-1 4h-4l-1-4-4 1-3-4 3-3-3-3 3-4 4 1 1-4Z"/><circle cx="12" cy="12" r="4"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16 6-2 8-8 4 4-8 6-4Z"/>',
  fish: '<path d="M22 12C15 3 7 6 5 10L1 6v12l4-4c6 6 12 4 17-2Z"/><circle cx="17" cy="10" r=".8"/>',
  shell: '<path d="M3 16C-2 3 9-2 12 6c4-8 15-2 10 10l-7 6H9l-6-6Zm9-10v16M7 7l3 15m7-15-3 15"/>',
  flag: '<path d="M6 24V2c7-5 8 6 16 1v13c-8 4-9-5-16-1"/>',
  reset: '<path d="M4 10a9 9 0 1 1 0 8M4 3v7h7"/>',
};
export function icon(name: string, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.star}</svg>`;
}
export function evolutionArt(symbol: string, color: string) {
  return `<div class="evo-art" style="--art:${color}"><span class="art-orbit"></span><span class="art-orbit second"></span>${icon(symbol)}</div>`;
}

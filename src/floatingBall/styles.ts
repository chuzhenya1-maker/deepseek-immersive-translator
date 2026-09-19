export const FLOATING_UI_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 999999;
  pointer-events: none;
  color-scheme: light dark;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; }

.ds-ball {
  position: fixed;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255,255,255,.38);
  border-radius: 999px;
  color: #fff;
  background: conic-gradient(#4f7cff var(--ds-progress), #202a44 0);
  box-shadow: 0 8px 24px rgba(0,0,0,.28);
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  transition: box-shadow 160ms ease, transform 160ms ease;
}
.ds-ball:hover { transform: scale(1.04); box-shadow: 0 10px 28px rgba(0,0,0,.34); }
.ds-ball:focus-visible { outline: 3px solid rgba(86,147,255,.55); outline-offset: 3px; }
.ds-ball > span {
  display: grid;
  place-items: center;
  width: calc(100% - 7px);
  height: calc(100% - 7px);
  border-radius: inherit;
  background: #315fd1;
  font-size: 14px;
  font-weight: 700;
}
.ds-ball--paused > span { background: #a36a00; }
.ds-ball--completed > span { background: #147a51; }
.ds-ball--error > span { background: #b53b45; }
.ds-ball--stopped > span { background: #596273; }

.ds-menu {
  position: fixed;
  width: 280px;
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: 14px;
  border: 1px solid rgba(128,128,128,.25);
  border-radius: 14px;
  color: #182033;
  background: rgba(255,255,255,.98);
  box-shadow: 0 16px 48px rgba(0,0,0,.25);
  pointer-events: auto;
  user-select: none;
}
.ds-menu header { display: grid; gap: 5px; margin-bottom: 12px; }
.ds-menu header strong { font-size: 16px; }
.ds-status { color: #5e6879; font-size: 12px; line-height: 1.4; }
.ds-status--error { color: #a72d38; }
.ds-progress { display: grid; gap: 6px; margin-bottom: 12px; }
.ds-progress__track { height: 7px; overflow: hidden; border-radius: 99px; background: #e6eaf0; }
.ds-progress__track span { display: block; height: 100%; border-radius: inherit; background: #315fd1; transition: width 180ms ease; }
.ds-progress__text { display: flex; justify-content: space-between; color: #596273; font-size: 12px; }
.ds-progress small { color: #a36a00; }
.ds-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 13px; }
.ds-actions button, .ds-settings, .ds-segmented button {
  border: 1px solid transparent;
  border-radius: 9px;
  cursor: pointer;
}
.ds-actions button { min-height: 36px; padding: 7px 10px; color: #fff; background: #315fd1; }
.ds-actions .ds-button--secondary { color: #273147; border-color: #d6dbe5; background: #f6f7f9; }
.ds-actions .ds-button--danger { background: #b53b45; }
.ds-field { display: grid; gap: 7px; padding-top: 12px; border-top: 1px solid #e5e8ed; }
.ds-field > span { color: #596273; font-size: 12px; }
.ds-segmented { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; padding: 3px; border-radius: 10px; background: #eef1f5; }
.ds-segmented button { padding: 6px 3px; color: #4f596b; background: transparent; font-size: 12px; }
.ds-segmented button.is-active { color: #1d4fbd; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.ds-settings { display: flex; justify-content: space-between; width: 100%; margin-top: 11px; padding: 9px 2px 1px; color: #4f596b; background: transparent; font-size: 12px; }
.ds-toast { position: fixed; left: 50%; bottom: 28px; max-width: min(360px, calc(100vw - 32px)); transform: translateX(-50%); padding: 10px 14px; border-radius: 10px; color: #fff; background: rgba(25,31,44,.94); box-shadow: 0 8px 28px rgba(0,0,0,.3); pointer-events: none; font-size: 13px; }

.ds-selection-action {
  position: fixed;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid rgba(255,255,255,.5);
  border-radius: 9px;
  color: #fff;
  background: #315fd1;
  box-shadow: 0 7px 20px rgba(0,0,0,.28);
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
  animation: ds-selection-enter 130ms ease-out;
}
.ds-selection-action:hover { background: #254eaf; transform: scale(1.04); }
.ds-selection-action:focus-visible { outline: 3px solid rgba(86,147,255,.55); outline-offset: 2px; }

.ds-selection-popup {
  position: fixed;
  z-index: 4;
  width: min(400px, calc(100vw - 16px));
  max-height: min(400px, calc(100vh - 16px));
  overflow: auto;
  padding: 15px;
  border: 1px solid rgba(128,128,128,.28);
  border-radius: 14px;
  color: #182033;
  background: rgba(255,255,255,.99);
  box-shadow: 0 18px 52px rgba(0,0,0,.3);
  pointer-events: auto;
  user-select: text;
}
.ds-selection-popup--corner { right: 20px; bottom: 80px; left: auto; top: auto; }
.ds-selection-popup header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.ds-selection-popup header > div { display: grid; gap: 3px; }
.ds-selection-popup header strong { font-size: 15px; }
.ds-selection-popup header small, .ds-selection-copy > span { color: #687284; font-size: 11px; }
.ds-selection-popup header button { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; color: #596273; background: transparent; cursor: pointer; user-select: none; }
.ds-selection-popup header button:hover { background: #eef1f5; }
.ds-selection-copy { display: grid; gap: 5px; }
.ds-selection-copy p { margin: 0; color: inherit; font-size: 13px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
.ds-selection-divider { height: 1px; margin: 12px 0; background: #e5e8ed; }
.ds-selection-loading { display: flex; align-items: center; gap: 9px; min-height: 44px; color: #596273; font-size: 13px; }
.ds-selection-loading span { width: 16px; height: 16px; border: 2px solid #cbd3df; border-top-color: #315fd1; border-radius: 50%; animation: ds-selection-spin 700ms linear infinite; }
.ds-selection-error { padding: 10px; border-radius: 9px; color: #9d2631; background: #fff0f1; font-size: 13px; white-space: pre-wrap; overflow-wrap: anywhere; }
.ds-selection-popup footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; user-select: none; }
.ds-selection-popup footer button { min-height: 32px; padding: 6px 10px; border: 1px solid #d6dbe5; border-radius: 8px; color: #384257; background: #f7f8fa; cursor: pointer; }
.ds-selection-popup footer .ds-selection-primary { color: #fff; border-color: #315fd1; background: #315fd1; }

@keyframes ds-selection-enter { from { opacity: 0; transform: scale(.9); } to { opacity: 1; transform: scale(1); } }
@keyframes ds-selection-spin { to { transform: rotate(360deg); } }

@media (prefers-color-scheme: dark) {
  .ds-menu { color: #edf1f7; background: rgba(28,33,43,.98); border-color: #4a5260; }
  .ds-status, .ds-progress__text, .ds-field > span, .ds-settings { color: #b4bdca; }
  .ds-progress__track, .ds-segmented { background: #3b4350; }
  .ds-actions .ds-button--secondary { color: #e7ebf2; border-color: #515a68; background: #353d49; }
  .ds-field { border-color: #454d59; }
  .ds-segmented button { color: #c2cad5; }
  .ds-segmented button.is-active { color: #8bb0ff; background: #252c36; }
  .ds-selection-popup { color: #edf1f7; background: rgba(28,33,43,.99); border-color: #4a5260; }
  .ds-selection-popup header small, .ds-selection-copy > span, .ds-selection-loading { color: #b4bdca; }
  .ds-selection-popup header button { color: #c2cad5; }
  .ds-selection-popup header button:hover { background: #353d49; }
  .ds-selection-divider { background: #454d59; }
  .ds-selection-error { color: #ffb5bc; background: #4a252b; }
  .ds-selection-popup footer button { color: #e7ebf2; border-color: #515a68; background: #353d49; }
  .ds-selection-popup footer .ds-selection-primary { color: #fff; border-color: #537fe6; background: #315fd1; }
}
`;

/**
 * 生产离线缓存独立于游戏循环。隐藏状态只供验收读取，安装失败不阻断联网游玩。
 * 显式跳过 HTTP 缓存检查 SW 更新，避免连续本地构建仍停留在旧资源清单。
 */
export function initOffline() {
  const output = document.createElement('output');
  output.id = 'offline-diagnostics';
  output.hidden = true;
  output.setAttribute('aria-hidden', 'true');
  document.body.append(output);
  const report = (state: string, detail: unknown = null) => {
    output.textContent = JSON.stringify({ state, detail });
  };
  if (!('serviceWorker' in navigator)) {
    report('unsupported');
    return;
  }
  report('waiting-for-load');
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none',
      });
      report('registered', {
        active: registration.active?.state,
        installing: registration.installing?.state,
      });
      const inspect = async () => {
        const keys = (await caches.keys()).filter((key) => key.startsWith('deep-blue-offline-'));
        const files = await Promise.all(
          keys.map(async (key) => ({ key, count: (await (await caches.open(key)).keys()).length })),
        );
        report('ready', { controlled: !!navigator.serviceWorker.controller, files });
      };
      navigator.serviceWorker.addEventListener('controllerchange', () => void inspect());
      await navigator.serviceWorker.ready;
      await inspect();
      await registration.update();
    } catch (error) {
      report('unavailable', String(error));
    }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}

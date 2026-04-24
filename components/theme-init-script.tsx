/**
 * Inline blocking script placed in <head> to prevent flash-of-unstyled-content
 * when switching between light/dark on first load. Runs before CSS paints.
 */
export function ThemeInitScript() {
  const script = `(function(){try{
    var s = localStorage.getItem('theme') || 'system';
    var m = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var t = s === 'system' ? (m ? 'dark' : 'light') : s;
    document.documentElement.dataset.theme = t;
  }catch(e){document.documentElement.dataset.theme='dark';}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

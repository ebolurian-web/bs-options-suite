/**
 * Inline blocking script placed in <head> to prevent flash-of-unstyled-content
 * when theme is first applied. Defaults to dark; light only if the user has
 * explicitly opted in via localStorage.
 */
export function ThemeInitScript() {
  const script = `(function(){try{
    var s = localStorage.getItem('theme');
    document.documentElement.dataset.theme = s === 'light' ? 'light' : 'dark';
  }catch(e){document.documentElement.dataset.theme='dark';}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

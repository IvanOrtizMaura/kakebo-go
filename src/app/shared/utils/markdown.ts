export function renderInlineMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  html = html.replace(/((?:^[•\-\*] .+\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const itemText = line.replace(/^[•\-\*] /, '').trim();
        return `<li>${itemText}</li>`;
      })
      .join('');
    return `<ul>${items}</ul>`;
  });

  html = html.replace(/\n/g, '<br>');

  return html;
}

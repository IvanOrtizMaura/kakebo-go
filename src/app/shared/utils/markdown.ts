export function renderInlineMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Unordered lists: •, -, *
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

  // Ordered lists: 1. 2. 3.
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
    const items = block
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const itemText = line.replace(/^\d+\. /, '').trim();
        return `<li>${itemText}</li>`;
      })
      .join('');
    return `<ol>${items}</ol>`;
  });

  html = html.replace(/\n/g, '<br>');

  return html;
}

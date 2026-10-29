import { DEFAULT_PREAMBLE } from './preferences.mjs';
import { compilePreamble } from './preamble.mjs';
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Text and math are parsed separately. User input is always escaped; KaTeX's
// trusted HTML/URL commands remain disabled, including in imported workspaces.
export function renderLatex(value, { inline = false, preamble = DEFAULT_PREAMBLE } = {}) {
  const compiled = compilePreamble(preamble);
  const errors = [...compiled.errors];
  const source = String(value ?? '').replace(/\r\n?/g, '\n');
  const math = (tex, display) => {
    if (!globalThis.katex) {
      errors.push('The mathematics renderer could not load. Reload the page to try again.');
      return `<code class="latex-error">${escapeHTML(tex)}</code>`;
    }
    try {
      return globalThis.katex.renderToString(tex, {
        displayMode: display && !inline, throwOnError: true, trust: false,
        strict: 'ignore', maxExpand: 1000, maxSize: 20,
        macros: { ...compiled.macros }
      });
    } catch (error) {
      errors.push(String(error.message).replace(/^KaTeX parse error:\s*/, ''));
      return `<code class="latex-error">${escapeHTML(tex)}</code>`;
    }
  };
  const group = (s, start) => {
    let depth = 1, p = start + 1;
    for (; p < s.length; p++) {
      if (s[p] === '\\') { p++; continue; }
      if (s[p] === '{') depth++;
      if (s[p] === '}' && --depth === 0) return { text: s.slice(start + 1, p), end: p + 1 };
    }
    errors.push('An opening brace is missing its closing brace.');
    return { text: s.slice(start + 1), end: s.length };
  };
  const closing = (s, start, delimiter) => {
    let p = start;
    while ((p = s.indexOf(delimiter, p)) !== -1) {
      let backslashes = 0;
      for (let q = p - 1; q >= 0 && s[q] === '\\'; q--) backslashes++;
      if (backslashes % 2 === 0) return p;
      p += delimiter.length;
    }
    return -1;
  };
  const environment = (s, start, name) => {
    const re = /\\(begin|end)\{([^}]+)\}/g;
    re.lastIndex = start;
    let depth = 1, match;
    while ((match = re.exec(s))) {
      if (match[2] !== name) continue;
      depth += match[1] === 'begin' ? 1 : -1;
      if (depth === 0) return { text: s.slice(start, match.index), end: re.lastIndex };
    }
    errors.push(`Missing \\end{${name}}.`);
    return { text: s.slice(start), end: s.length };
  };
  function parse(s) {
    let out = '', i = 0;
    while (i < s.length) {
      if (s[i] === '%') { const end = s.indexOf('\n', i); i = end === -1 ? s.length : end; continue; }
      let opener = s.startsWith('$$', i) ? '$$' : s[i] === '$' ? '$' : s.startsWith('\\[', i) ? '\\[' : s.startsWith('\\(', i) ? '\\(' : null;
      if (opener) {
        const closer = ({'\\[':'\\]', '\\(':'\\)'})[opener] ?? opener;
        const end = closing(s, i + opener.length, closer);
        if (end === -1) { errors.push(`Missing closing ${closer} delimiter.`); out += `<code class="latex-error">${escapeHTML(s.slice(i))}</code>`; break; }
        out += math(s.slice(i + opener.length, end), opener === '$$' || opener === '\\[');
        i = end + closer.length; continue;
      }
      const begin = s.slice(i).match(/^\\begin\{([^}]+)\}/);
      if (begin) {
        const name = begin[1], env = environment(s, i + begin[0].length, name);
        if (/^(equation\*?|align\*?|gather\*?|alignat\*?|multline\*?|displaymath)$/.test(name)) {
          const body = env.text.replace(/\\label\{[^}]*\}/g, '');
          const wrapped = /^(align|gather|alignat)/.test(name) ? `\\begin{${name.startsWith('alignat') ? 'alignedat' : name.startsWith('align') ? 'aligned' : 'gathered'}}${body}\\end{${name.startsWith('alignat') ? 'alignedat' : name.startsWith('align') ? 'aligned' : 'gathered'}}` : body;
          out += math(wrapped, true);
        } else if (name === 'itemize' || name === 'enumerate') {
          const items = []; let depth = 0, cursor = 0, last = -1;
          const tokens = /\\(begin|end)\{[^}]+\}|\\item(?:\[([^\]]*)\])?/g; let token;
          while ((token = tokens.exec(env.text))) {
            if (token[1] === 'begin') depth++;
            else if (token[1] === 'end') depth--;
            else if (depth === 0) { if (last >= 0) items.push(env.text.slice(last, token.index)); last = tokens.lastIndex; cursor++; }
          }
          if (last >= 0) items.push(env.text.slice(last));
          if (!cursor) items.push(env.text);
          const tag = name === 'itemize' ? 'ul' : 'ol';
          out += `<${tag}>${items.map(item => `<li>${parse(item)}</li>`).join('')}</${tag}>`;
        } else if (/^(proof|theorem|lemma|definition|remark|corollary|proposition)$/.test(name)) {
          out += `<div class="latex-environment"><em>${escapeHTML(name[0].toUpperCase() + name.slice(1))}.</em> ${parse(env.text)}</div>`;
        } else if (name === 'center') out += `<div class="latex-center">${parse(env.text)}</div>`;
        else { errors.push(`The ${name} text environment is not supported. Use math delimiters for mathematical environments.`); out += parse(env.text); }
        i = env.end; continue;
      }
      if (s.startsWith('\\\\', i)) { out += '<br>'; i += 2; continue; }
      if (s[i] === '\\') {
        const symbol = s[i + 1];
        if (symbol && '%$&#_{} '.includes(symbol)) { out += escapeHTML(symbol); i += 2; continue; }
        const command = s.slice(i).match(/^\\([a-zA-Z]+)\*?/);
        if (command) {
          const name = command[1]; let p = i + command[0].length;
          while (s[p] === ' ' || s[p] === '\n') p++;
          const tags = {textbf:'strong', emph:'em', textit:'em', texttt:'code', underline:'u', textrm:'span', textnormal:'span', text:'span', section:'h3', subsection:'h4', subsubsection:'h4', paragraph:'h4'};
          if ((tags[name] || name === 'label') && s[p] === '{') {
            const g = group(s, p);
            if (name !== 'label') out += `<${tags[name]}>${parse(g.text)}</${tags[name]}>`;
            i = g.end; continue;
          }
          const simple = {par:'<div class="paragraph-gap"></div>', newline:'<br>', linebreak:'<br>', quad:'&emsp;', qquad:'&emsp;&emsp;', hfill:'<span class="latex-hfill"></span>', LaTeX:'<span class="latex-logo">L<span>a</span>T<span>e</span>X</span>', TeX:'TeX', ldots:'…', dots:'…', noindent:'', smallskip:'<div class="paragraph-gap small"></div>', medskip:'<div class="paragraph-gap"></div>', bigskip:'<div class="paragraph-gap"></div>'};
          if (Object.hasOwn(simple, name)) { out += simple[name]; i = i + command[0].length; continue; }
          errors.push(`\\${name} is not a supported text command. Put mathematical commands inside $...$ or \\[...\\].`);
          out += `<code class="latex-error">${escapeHTML(command[0])}</code>`;
          i += command[0].length; continue;
        }
      }
      if (s[i] === '\n') {
        if (/^\n\s*\n/.test(s.slice(i))) { const match = s.slice(i).match(/^\n(?:\s*\n)+/); out += '<div class="paragraph-gap"></div>'; i += match[0].length; }
        else { out += ' '; i++; }
        continue;
      }
      out += escapeHTML(s[i]); i++;
    }
    return out;
  }
  return { html: parse(source), errors: [...new Set(errors)] };
}

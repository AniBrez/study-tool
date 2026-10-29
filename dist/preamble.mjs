import { DEFAULT_PREAMBLE } from './preferences.mjs';

function withoutComments(source) {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\' && i + 1 < source.length) {out += source[i] + source[++i];continue;}
    if (source[i] === '%') {while (i < source.length && source[i] !== '\n') i++;out += '\n';}
    else out += source[i];
  }
  return out;
}

// A definitions-only script. Translate amsmath's DeclareMathOperator to
// KaTeX's operatorname form, with required arguments supported up to #9.
export function parsePreamble(value) {
  if (typeof value !== 'string' || value.length > 32000) throw new Error('Use at most 32,000 characters for shared definitions.');
  const source = withoutComments(value.replace(/\r\n?/g,'\n'));
  let i = 0, count = 0; const definitions = [];
  const skip = () => {while (i < source.length && /\s/.test(source[i])) i++;};
  const group = () => {
    skip();if (source[i] !== '{') throw new Error('Expected a braced definition, such as {\\mathbb{R}}.');
    let depth = 1, start = ++i;
    while (i < source.length) {
      if (source[i] === '\\') {i += 2;continue;}
      if (source[i] === '{') depth++;
      if (source[i] === '}' && --depth === 0) return source.slice(start,i++);
      i++;
    }
    throw new Error('A definition has an opening brace without a closing brace.');
  };
  const name = () => {
    skip();let result;
    if (source[i] === '{') result = group().trim();
    else {const match = source.slice(i).match(/^\\[A-Za-z]+/);if(match){result=match[0];i += result.length;}}
    if (!result || !/^\\[A-Za-z]+$/.test(result)) throw new Error('Use a command name such as \\R or {\\myOperator}.');
    return result;
  };
  while (true) {
    skip();if(i >= source.length)break;
    const match = source.slice(i).match(/^\\(newcommand|renewcommand|providecommand|DeclareMathOperator|gdef|def)(?![A-Za-z])/);
    if (!match) throw new Error('Use \\newcommand, \\renewcommand, \\providecommand, \\def, or \\DeclareMathOperator in the definitions script.');
    if (++count > 256) throw new Error('Use at most 256 shared definitions.');
    const command = match[1];i += match[0].length;skip();
    const starred = source[i] === '*';if(starred)i++;
    if (starred && ['def','gdef'].includes(command)) throw new Error('Use \\def without a star.');
    const macro = name();skip();let args = '';
    if (['def','gdef'].includes(command)) {
      let expected = 1;
      while(source[i] === '#') {
        if (source[i+1] !== String(expected) || expected > 9) throw new Error('Macro parameters must be numbered #1, #2, and so on.');
        args += `#${expected++}`;i += 2;skip();
      }
    } else if (command !== 'DeclareMathOperator' && source[i] === '[') {
      const argMatch = source.slice(i).match(/^\[([0-9])\]/);
      if (!argMatch) throw new Error('Use an argument count such as [1] or [2].');
      args = argMatch[0];i += args.length;
    }
    const body = group();
    definitions.push(command === 'DeclareMathOperator' ? `\\def${macro}{\\operatorname${starred ? '*' : ''}{${body}}}` : ['def','gdef'].includes(command) ? `\\${command}${macro}${args}{${body}}` : `\\${command}{${macro}}${args}{${body}}`);
  }
  return definitions.join('\n');
}

let cached;
export function compilePreamble(source = DEFAULT_PREAMBLE) {
  if (cached?.source === source && cached.engine === globalThis.katex) return cached.result;
  const macros = {}, errors = [];
  try {
    const definitions = parsePreamble(source);
    if (!globalThis.katex) throw new Error('The mathematics renderer could not load.');
    globalThis.katex.renderToString(definitions,{macros,globalGroup:true,throwOnError:true,trust:false,strict:'ignore',maxExpand:1000,maxSize:20});
  } catch(error) {errors.push(String(error.message).replace(/^KaTeX parse error:\s*/,''));}
  const result = {macros:errors.length ? {} : macros, errors};
  if (globalThis.katex) cached = {source,engine:globalThis.katex,result};
  return result;
}

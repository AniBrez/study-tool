export const DEFAULT_PREAMBLE = String.raw`% Shared definitions for every title, statement and proof.
% Edit these definitions, or add your own below.
\def\R{\mathbb{R}}
\def\N{\mathbb{N}}
\def\Z{\mathbb{Z}}
\def\C{\mathbb{C}}
\def\E{\mathbb{E}}
\def\P{\mathbb{P}}
\newcommand{\norm}[1]{\left\lVert#1\right\rVert}
\newcommand{\abs}[1]{\left|#1\right|}

% Examples (remove the % to enable):
% \newcommand{\eps}{\varepsilon}
% \DeclareMathOperator{\supp}{supp}
% \DeclareMathOperator*{\argmin}{arg\,min}
`;
export const defaultSettings = () => ({grid:{visible:true,snap:true,spacing:20},latexPreamble:DEFAULT_PREAMBLE});
export function validateSettings(raw) {
  if (!raw || typeof raw !== 'object' || !raw.grid || typeof raw.grid.visible !== 'boolean' || typeof raw.grid.snap !== 'boolean' || !Number.isInteger(raw.grid.spacing) || raw.grid.spacing < 8 || raw.grid.spacing > 80) throw new Error('Grid settings must use a spacing from 8 to 80.');
  if (typeof raw.latexPreamble !== 'string' || raw.latexPreamble.length > 32000) throw new Error('The LaTeX definitions script must contain at most 32,000 characters.');
  return {grid:{visible:raw.grid.visible,snap:raw.grid.snap,spacing:raw.grid.spacing},latexPreamble:raw.latexPreamble};
}

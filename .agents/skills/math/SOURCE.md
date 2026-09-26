# Upstream source

Installed from [pmndrs/math](https://github.com/pmndrs/math/tree/983a607676026c5f1b950f876bc688988de824e5/skills/math)
on 2026-09-25, commit `983a607676026c5f1b950f876bc688988de824e5`. `SKILL.md` is an unmodified copy;
`LICENSE` carries the upstream MIT license. The repo's `.claude/skills` symlink
also exposes this installation to Claude. No npm dependency was installed.

## API caveat

The upstream skill describes `math/three`, but the [package export map at this
commit](https://github.com/pmndrs/math/blob/983a607676026c5f1b950f876bc688988de824e5/package.json)
does not export it. Treat the installed package's exports and source as the
API authority. Do not introduce imports based only on the skill examples.

For evaluation and adoption decisions, see the
[optimization spec](../../../specs/done/math-optimization/README.md).

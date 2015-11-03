# Circular Rhythm Tools
** PLEASE INSTALL babel-cli MODULE AS GLOBAL **

`$ npm install -g babel-cli`

## Asset converter
`$ bin/cr-asset <arguments> <bmson>`

arguments:
- `-o <dir>`: output directory (default: same location as bmson)
- `-s <size>`: fragment size (default: 2097152)

## Music list creator
`$ bin/cr-list <basedir> <command> [...target]`
- `basedir: Base directory of music server`
- `command: add | remove | list | arrange`
- `target: <music directory>:<bmson file> or <music directory>`

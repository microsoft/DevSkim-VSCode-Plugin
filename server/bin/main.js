#!/usr/bin/env node
const server = require('../out/index');
const pkg = require('../package');

const args = process.argv;
const start = args.find(s => s === 'start');
const version = args.find(s => s === '-v' || s === '--version');
const help = args.find(s => s === '-h' || s === '--help');

console.log(`main: starting args(${args})`);

if (start) {
    server.listen()
} else if (version) {
    console.log(`Version is ${pkg.version}`)
} else if (help) {
    console.log(`
Usage:
  devskim-language-server start
  devskim-language-server -h | --help
  devskim-language-server -v | --version
  `)
} else {
    const command = args.join(' ')
    console.error(`Unknown command '${command}'. Run with -h for help.`)
}
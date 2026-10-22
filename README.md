# App Store Connect MCP

![Status: Early Development](https://img.shields.io/badge/status-early%20development-orange)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js: 20+](https://img.shields.io/badge/Node.js-20%2B-5FA04E?logo=nodedotjs&logoColor=white)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A TypeScript project for a read-only [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for Apple App Store Connect.

## Status

Early development. The repository contains the project scaffold and dependencies; the server and MCP tools are not implemented yet.

See the [tool roadmap and MVP](docs/tools.md) for proposed tools, API mappings, read-only boundaries, and implementation priorities.

## Development

Requires **Node.js 20+** and **npm**. Install dependencies with:

```sh
npm ci
```

Source code lives in `src/`. Check types, compile to `build/`, and run the compiled entry point with:

```sh
npm run typecheck
npm run build
npm start
```

Run `npm run build` again after changing source files. The entry point is currently empty, so `npm start` exits without starting an MCP server. `npm test` remains a failing placeholder.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

## License

[MIT](LICENSE)

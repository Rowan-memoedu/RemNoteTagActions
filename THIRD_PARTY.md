# Dependencies and API references

- `@modelcontextprotocol/sdk` 1.29.0, MIT: the maintained MCP client and Streamable HTTP transport. [Source](https://github.com/modelcontextprotocol/typescript-sdk).
- Codex CLI is the installed OpenAI runtime, invoked through its documented non-interactive interface. [Structured output and saved authentication](https://learn.chatgpt.com/docs/non-interactive-mode).
- The existing RemNote MCP server is used through its local endpoint; its source and runtime are not copied or modified. [Upstream](https://github.com/robert7/remnote-mcp-server).
- MCP read tools are explicitly allowed for the child process; all RemNote writes remain in the bounded workflow executor. [Official MCP configuration](https://learn.chatgpt.com/docs/extend/mcp).

Local artifacts and credentials are outside this repository. Documentation links are implementation references, not a claim that upstream supports this custom workflow.

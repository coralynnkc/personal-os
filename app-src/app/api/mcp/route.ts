import { NextResponse } from 'next/server'
import { secretsEqual } from '@/lib/auth'
import { TOOLS } from '@/lib/mcp/tools'
import { ToolError, asArgs } from '@/lib/mcp/validate'

// Streamable-HTTP MCP endpoint. Every response here is a single JSON body
// rather than an SSE stream: the transport allows it, nothing we expose is
// long-running, and it keeps the handler inside one Vercel function invocation.

const SERVER_INFO = { name: 'personal-os', version: '0.1.0' }
const LATEST_PROTOCOL = '2025-06-18'
const SUPPORTED_PROTOCOLS = [LATEST_PROTOCOL, '2025-03-26', '2024-11-05']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version',
}

type Id = string | number | null

function result(id: Id, value: unknown) {
  return { jsonrpc: '2.0' as const, id, result: value }
}

function error(id: Id, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } }
}

// A tool that failed is a normal result carrying isError, not a JSON-RPC error:
// the protocol reserves the error channel for the call itself going wrong, and
// only the result form gets shown back to the model so it can retry.
function toolFailure(id: Id, message: string) {
  return result(id, { content: [{ type: 'text', text: `Error: ${message}` }], isError: true })
}

async function authorized(req: Request): Promise<boolean> {
  const expected = process.env.MCP_SECRET
  if (!expected) return false // fail closed: an unset secret rejects everything

  const header = req.headers.get('authorization') ?? ''
  const bearer = header.slice(0, 7).toLowerCase() === 'bearer ' ? header.slice(7).trim() : ''
  // claude.ai's custom-connector form has no field for a static header, so the
  // secret may instead ride on the connector URL as ?key=. Same comparison,
  // but it does end up in request logs — see the README note.
  const query = new URL(req.url).searchParams.get('key') ?? ''

  const presented = bearer || query
  if (!presented) return false
  return secretsEqual(presented, expected)
}

// Deliberately no WWW-Authenticate header: advertising a challenge makes MCP
// clients start OAuth discovery, and this endpoint only ever takes a static
// secret. A JSON 401 (never a redirect) is what a client can actually report.
function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS })
}

async function handleMessage(message: unknown): Promise<object | null> {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return error(null, -32600, 'Invalid Request')
  }

  const { id: rawId, method, params } = message as { id?: unknown; method?: unknown; params?: unknown }
  const id: Id = typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null
  const isNotification = rawId === undefined || rawId === null

  if (typeof method !== 'string') {
    return isNotification ? null : error(id, -32600, 'Invalid Request')
  }
  if (isNotification) return null // notifications get no response, only a 202

  const args = (typeof params === 'object' && params !== null ? params : {}) as Record<string, unknown>

  switch (method) {
    case 'initialize': {
      const requested = args.protocolVersion
      const version = typeof requested === 'string' && SUPPORTED_PROTOCOLS.includes(requested)
        ? requested
        : LATEST_PROTOCOL
      return result(id, {
        protocolVersion: version,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      })
    }

    case 'ping':
      return result(id, {})

    case 'tools/list':
      return result(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      })

    // Not advertised in capabilities, but some clients probe for them anyway;
    // an empty list is quieter than a method-not-found.
    case 'resources/list':
      return result(id, { resources: [] })
    case 'prompts/list':
      return result(id, { prompts: [] })

    case 'tools/call': {
      const tool = TOOLS.find(t => t.name === args.name)
      if (!tool) return error(id, -32602, `Unknown tool: ${String(args.name)}`)

      try {
        const value = await tool.handler(asArgs(args.arguments ?? {}))
        return result(id, { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] })
      } catch (err) {
        if (err instanceof ToolError) return toolFailure(id, err.message)
        console.error(`mcp ${tool.name} unhandled error:`, err)
        return toolFailure(id, `${tool.name} failed unexpectedly`)
      }
    }

    default:
      return error(id, -32601, `Method not found: ${method}`)
  }
}

export async function POST(req: Request) {
  if (!(await authorized(req))) return unauthorized()

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json(error(null, -32700, 'Parse error'), { status: 400, headers: CORS })
  }

  const batched = Array.isArray(payload)
  const messages: unknown[] = batched ? (payload as unknown[]) : [payload]
  if (batched && messages.length === 0) {
    return NextResponse.json(error(null, -32600, 'Invalid Request'), { status: 400, headers: CORS })
  }

  const responses: object[] = []
  for (const message of messages) {
    const response = await handleMessage(message)
    if (response) responses.push(response)
  }

  // Every message was a notification — nothing to reply with.
  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS })

  return NextResponse.json(batched ? responses : responses[0], { headers: CORS })
}

// The server never initiates messages, so there is no stream to open and no
// session state to tear down.
export async function GET(req: Request) {
  if (!(await authorized(req))) return unauthorized()
  return NextResponse.json({ error: 'method not allowed' }, { status: 405, headers: { ...CORS, Allow: 'POST' } })
}

export async function DELETE(req: Request) {
  if (!(await authorized(req))) return unauthorized()
  return NextResponse.json({ ok: true }, { headers: CORS })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { ...CORS, 'Access-Control-Max-Age': '86400' } })
}

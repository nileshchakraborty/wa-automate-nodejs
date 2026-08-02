import type { HttpMethodDefinition } from '@open-wa/schema';

function schemaToOpenApi(schema: {
  toJSONSchema?: (params?: unknown) => unknown;
}) {
  if (typeof schema?.toJSONSchema === 'function') {
    return schema.toJSONSchema({ target: 'openapi-3.0' });
  }

  return { type: 'object', additionalProperties: true };
}

function buildQueryParameters(def: HttpMethodDefinition) {
  const inputSchema = schemaToOpenApi(def.inputSchema) as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  const properties = inputSchema.properties ?? {};
  const required = new Set(inputSchema.required ?? []);

  return def.parameterOrder.map((name) => ({
    name,
    in: 'query',
    required: required.has(name),
    description: properties[name]?.description || `Argument: ${name}`,
    schema: properties[name] || { type: 'string' },
  }));
}

function buildScalarClientExamples(origin: string) {
  const healthUrl = `${origin}/health`;
  return [
    {
      lang: 'shell',
      source: `curl --fail \\
  --header "X-API-Key: $OPENWA_API_KEY" \\
  "${healthUrl}"`,
    },
    {
      lang: 'ruby',
      source: `require "net/http"

uri = URI("${healthUrl}")
request = Net::HTTP::Get.new(uri)
request["X-API-Key"] = ENV.fetch("OPENWA_API_KEY")
response = Net::HTTP.start(uri.hostname, uri.port) { |http| http.request(request) }
puts response.body`,
    },
    {
      lang: 'node',
      source: `const response = await fetch("${healthUrl}", {
  headers: { "X-API-Key": process.env.OPENWA_API_KEY },
});

console.log(await response.json());`,
    },
    {
      lang: 'php',
      source: `<?php
$context = stream_context_create([
  "http" => ["header" => "X-API-Key: " . getenv("OPENWA_API_KEY")],
]);

echo file_get_contents("${healthUrl}", false, $context);`,
    },
    {
      lang: 'python',
      source: `import json
import os
import urllib.request

request = urllib.request.Request("${healthUrl}")
request.add_header("X-API-Key", os.environ["OPENWA_API_KEY"])

with urllib.request.urlopen(request) as response:
    print(json.load(response))`,
    },
  ];
}

export function createOpenApiDocument(
  methodDefinitions: HttpMethodDefinition[],
  options: {
    origin: string;
    basePath?: string;
    title?: string;
    version?: string;
  },
) {
  const paths = Object.fromEntries(
    methodDefinitions.map((def) => [
      def.path,
      {
        [def.httpMethod.toLowerCase()]: {
          summary: def.description,
          operationId: def.functionName,
          tags: [def.namespace],
          ...(def.httpMethod === 'GET' || def.httpMethod === 'DELETE'
            ? { parameters: buildQueryParameters(def) }
            : {
                requestBody: {
                  required: def.parameterOrder.length > 0,
                  content: {
                    'application/json': {
                      schema: schemaToOpenApi(def.inputSchema),
                    },
                  },
                },
              }),
          'x-openwa-aliases': def.routeSignatures.filter(
            (signature) => signature !== `${def.httpMethod} ${def.path}`,
          ),
          responses: {
            '200': {
              description: 'Successful response',
              content: {
                'application/json': {
                  schema: schemaToOpenApi(def.outputSchema),
                },
              },
            },
          },
        },
      },
    ]),
  );

  return {
    openapi: '3.0.3',
    info: {
      title: options.title || 'open-wa Easy API',
      version: options.version || '5.0.0',
      'x-scalar-sdk-installation': buildScalarClientExamples(options.origin),
    },
    servers: [{ url: options.origin }],
    paths,
  };
}

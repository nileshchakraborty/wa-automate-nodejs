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
  const parsedHealthUrl = new URL(healthUrl);
  const apiKeyEnvironmentVariable = 'OPENWA_API_KEY';

  return [
    {
      lang: 'c',
      source: `#include <curl/curl.h>
#include <stdio.h>
#include <stdlib.h>

int main(void) {
  const char *api_key = getenv("${apiKeyEnvironmentVariable}");
  char header[512];
  snprintf(header, sizeof(header), "X-API-Key: %s", api_key);

  CURL *curl = curl_easy_init();
  struct curl_slist *headers = curl_slist_append(NULL, header);
  curl_easy_setopt(curl, CURLOPT_URL, "${healthUrl}");
  curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers);
  curl_easy_perform(curl);

  curl_slist_free_all(headers);
  curl_easy_cleanup(curl);
}`,
    },
    {
      lang: 'clojure',
      source: `(require '[clj-http.client :as http])

(println (:body (http/get "${healthUrl}"
  {:headers {"X-API-Key" (System/getenv "${apiKeyEnvironmentVariable}")}})))`,
    },
    {
      lang: 'csharp',
      source: `using System;
using System.Net.Http;

using var client = new HttpClient();
client.DefaultRequestHeaders.Add(
  "X-API-Key",
  Environment.GetEnvironmentVariable("${apiKeyEnvironmentVariable}")
);
Console.WriteLine(await client.GetStringAsync("${healthUrl}"));`,
    },
    {
      lang: 'dart',
      source: `import 'dart:io';
import 'package:http/http.dart' as http;

void main() async {
  final response = await http.get(
    Uri.parse('${healthUrl}'),
    headers: {'X-API-Key': Platform.environment['${apiKeyEnvironmentVariable}']!},
  );
  print(response.body);
}`,
    },
    {
      lang: 'fsharp',
      source: `open System
open System.Net.Http

use client = new HttpClient()
client.DefaultRequestHeaders.Add(
  "X-API-Key",
  Environment.GetEnvironmentVariable("${apiKeyEnvironmentVariable}"))
printfn "%s" (client.GetStringAsync("${healthUrl}").Result)`,
    },
    {
      lang: 'go',
      source: `package main

import (
  "fmt"
  "net/http"
  "os"
)

func main() {
  request, _ := http.NewRequest(http.MethodGet, "${healthUrl}", nil)
  request.Header.Set("X-API-Key", os.Getenv("${apiKeyEnvironmentVariable}"))
  response, err := http.DefaultClient.Do(request)
  if err != nil { panic(err) }
  defer response.Body.Close()
  fmt.Println(response.Status)
}`,
    },
    {
      lang: 'http',
      source: `GET ${parsedHealthUrl.pathname} HTTP/1.1
Host: ${parsedHealthUrl.host}
X-API-Key: $${apiKeyEnvironmentVariable}`,
    },
    {
      lang: 'java',
      source: `import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

var request = HttpRequest.newBuilder(URI.create("${healthUrl}"))
  .header("X-API-Key", System.getenv("${apiKeyEnvironmentVariable}"))
  .build();
var response = HttpClient.newHttpClient()
  .send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());`,
    },
    {
      lang: 'js',
      source: `const response = await fetch("${healthUrl}", {
  headers: { "X-API-Key": globalThis.${apiKeyEnvironmentVariable} },
});

console.log(await response.json());`,
    },
    {
      lang: 'kotlin',
      source: `import okhttp3.OkHttpClient
import okhttp3.Request

val client = OkHttpClient()
val request = Request.Builder()
  .url("${healthUrl}")
  .header("X-API-Key", System.getenv("${apiKeyEnvironmentVariable}"))
  .build()
client.newCall(request).execute().use { response ->
  println(response.body?.string())
}`,
    },
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
  headers: { "X-API-Key": process.env.${apiKeyEnvironmentVariable} },
});

console.log(await response.json());`,
    },
    {
      lang: 'objc',
      source: `#import <Foundation/Foundation.h>

NSMutableURLRequest *request = [NSMutableURLRequest
  requestWithURL:[NSURL URLWithString:@"${healthUrl}"]];
[request setValue:NSProcessInfo.processInfo.environment[@"${apiKeyEnvironmentVariable}"]
  forHTTPHeaderField:@"X-API-Key"];
[[NSURLSession.sharedSession dataTaskWithRequest:request
  completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
    NSLog(@"%@", [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding]);
  }] resume];`,
    },
    {
      lang: 'ocaml',
      source: `open Lwt.Infix

let uri = Uri.of_string "${healthUrl}" in
let headers = Cohttp.Header.init_with
  "X-API-Key" (Sys.getenv "${apiKeyEnvironmentVariable}") in
Lwt_main.run (
  Cohttp_lwt_unix.Client.get ~headers uri >>= fun (_, body) ->
  Cohttp_lwt.Body.to_string body >|= print_endline
)`,
    },
    {
      lang: 'php',
      source: `<?php
require "vendor/autoload.php";

$client = new GuzzleHttp\\Client();
$response = $client->get("${healthUrl}", [
  "headers" => ["X-API-Key" => getenv("${apiKeyEnvironmentVariable}")],
]);
echo $response->getBody();`,
    },
    {
      lang: 'powershell',
      source: `Invoke-RestMethod -Uri "${healthUrl}" \\
  -Headers @{ "X-API-Key" = $env:${apiKeyEnvironmentVariable} }`,
    },
    {
      lang: 'python',
      source: `import json
import os
import urllib.request

request = urllib.request.Request("${healthUrl}")
request.add_header("X-API-Key", os.environ["${apiKeyEnvironmentVariable}"])

with urllib.request.urlopen(request) as response:
    print(json.load(response))`,
    },
    {
      lang: 'r',
      source: `library(httr)

response <- GET(
  "${healthUrl}",
  add_headers("X-API-Key" = Sys.getenv("${apiKeyEnvironmentVariable}"))
)
content(response, "text")`,
    },
    {
      lang: 'rust',
      source: `let client = reqwest::blocking::Client::new();
let response = client
    .get("${healthUrl}")
    .header("X-API-Key", std::env::var("${apiKeyEnvironmentVariable}")?)
    .send()?
    .text()?;
println!("{response}");`,
    },
    {
      lang: 'swift',
      source: `import Foundation

var request = URLRequest(url: URL(string: "${healthUrl}")!)
request.setValue(
  ProcessInfo.processInfo.environment["${apiKeyEnvironmentVariable}"],
  forHTTPHeaderField: "X-API-Key")
let (data, _) = try await URLSession.shared.data(for: request)
print(String(decoding: data, as: UTF8.self))`,
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

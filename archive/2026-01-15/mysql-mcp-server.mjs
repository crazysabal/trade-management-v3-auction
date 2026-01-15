#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import mysql from "mysql2/promise";
import { z } from "zod";

// DB 설정 (환경 변수에서 로드)
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    multipleStatements: true
};

const server = new Server(
    {
        name: "mysql-mcp-server",
        version: "0.1.0",
    },
    {
        capabilities: {
            resources: {},
            tools: {},
        },
    }
);

let pool;

async function getPool() {
    if (!pool) {
        if (!process.env.DB_PASSWORD) {
            throw new Error("DB_PASSWORD environment variable is not set");
        }
        pool = mysql.createPool(dbConfig);
    }
    return pool;
}

// 리소스 목록 조회 (테이블 목록을 리소스로 노출)
server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const connection = await getPool();
    try {
        const [rows] = await connection.query("SHOW TABLES");
        const tables = rows.map(row => Object.values(row)[0]);

        return {
            resources: tables.map(table => ({
                uri: `mysql://${dbConfig.database}/${table}`,
                name: table,
                mimeType: "application/json",
                description: `MySQL Table: ${table}`
            }))
        };
    } catch (error) {
        console.error("Error listing resources:", error);
        throw error;
    }
});

// 리소스 읽기 (테이블 스키마 또는 상위 데이터 반환)
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = new URL(request.params.uri);
    const pathParts = uri.pathname.split("/").filter(Boolean); // mysql://db/table -> ['', 'table'] or similar depending on implementation
    // URL parsing might be slightly different. Let's assume the URI is mysql://dbname/tablename
    // url.pathname would be /tablename if hostname is dbname

    // simpler parsing
    const uriStr = request.params.uri;
    const tableName = uriStr.split('/').pop();

    if (!tableName) {
        throw new Error("Invalid resource URI");
    }

    const connection = await getPool();
    try {
        const [columns] = await connection.query(`DESCRIBE ??`, [tableName]);

        return {
            contents: [
                {
                    uri: request.params.uri,
                    mimeType: "application/json",
                    text: JSON.stringify(columns, null, 2),
                },
            ],
        };
    } catch (error) {
        throw new Error(`Failed to read resource ${request.params.uri}: ${error.message}`);
    }
});

// 도구 목록 정의
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "list_tables",
                description: "List all tables in the database",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "describe_table",
                description: "Get schema information for a specific table",
                inputSchema: {
                    type: "object",
                    properties: {
                        table_name: {
                            type: "string",
                            description: "Name of the table to describe",
                        },
                    },
                    required: ["table_name"],
                },
            },
            {
                name: "read_query",
                description: "Execute a read-only SQL query (SELECT only)",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The SQL SELECT query to execute",
                        },
                    },
                    required: ["query"],
                },
            },
        ],
    };
});

// 도구 실행 핸들러
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const connection = await getPool();

    if (request.params.name === "list_tables") {
        const [rows] = await connection.query("SHOW TABLES");
        const tables = rows.map(row => Object.values(row)[0]);
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(tables, null, 2),
                },
            ],
        };
    }

    if (request.params.name === "describe_table") {
        const tableName = request.params.arguments?.table_name;
        if (!tableName) {
            throw new Error("Table name is required");
        }

        try {
            // 테이블 존재 여부 확인 및 스키마 조회
            const [rows] = await connection.query(`DESCRIBE ??`, [tableName]);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(rows, null, 2),
                    },
                ],
            };
        } catch (err) {
            return {
                content: [{ type: "text", text: `Error: ${err.message}` }],
                isError: true
            }
        }
    }

    if (request.params.name === "read_query") {
        const query = request.params.arguments?.query;
        if (!query) {
            throw new Error("Query is required");
        }

        // 간단한 안전 장치: SELECT로 시작하는지 확인
        if (!/^\s*SELECT/i.test(query)) {
            throw new Error("Only SELECT queries are allowed for safety");
        }

        try {
            const [rows] = await connection.query(query);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(rows, null, 2),
                    },
                ],
            };
        } catch (error) {
            return {
                content: [
                    {
                        type: "text",
                        text: `Database Error: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    }

    throw new Error("Unknown tool");
});

const transport = new StdioServerTransport();
await server.connect(transport);
